import assert from "node:assert/strict";
import test from "node:test";
import { ACCESS_TTL_MS, isAllowedRedirectUri, redirectUriMatches } from "../../src/application/agent-auth.ts";
import { DemoIdentityProvider } from "../../src/api/demo-identity.ts";
import { StaticPartyDirectory } from "../../src/integrations/mandates/demo-party-directory.ts";
import { ANDREA, NOW, PEDRO, STRANGER } from "./mandate-test-kit.ts";
import { agentKit, pkce, REDIRECT, RESOURCE } from "./agent-test-kit.ts";

test("only https and loopback redirect URIs register, and a loopback client may change port", () => {
  assert.ok(isAllowedRedirectUri("https://agent.test/callback"));
  assert.ok(isAllowedRedirectUri("http://localhost:5173/cb"));
  assert.ok(isAllowedRedirectUri("http://127.0.0.1/cb"));
  assert.ok(!isAllowedRedirectUri("http://agent.test/callback"));
  assert.ok(!isAllowedRedirectUri("https://agent.test/cb#frag"));
  assert.ok(!isAllowedRedirectUri("https://user:pw@agent.test/cb"));
  assert.ok(!isAllowedRedirectUri("javascript:alert(1)"));
  assert.ok(redirectUriMatches("http://localhost:5173/cb", "http://localhost:49152/cb"));
  assert.ok(!redirectUriMatches("http://localhost:5173/cb", "http://localhost:49152/other"));
  assert.ok(!redirectUriMatches("https://agent.test/cb", "https://agent.test:8443/cb"));
});

test("registration refuses confidential clients and bad redirect URIs", async () => {
  const kit = await agentKit();
  const noUris = await kit.auth.registerClient({ client_name: "x" });
  assert.equal(!noUris.ok && noUris.error, "invalid_redirect_uri");
  const http = await kit.auth.registerClient({ redirect_uris: ["http://agent.test/cb"] });
  assert.equal(!http.ok && http.error, "invalid_redirect_uri");
  const secret = await kit.auth.registerClient({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" });
  assert.equal(!secret.ok && secret.error, "invalid_client_metadata");
  const ok = await kit.auth.registerClient({ redirect_uris: [REDIRECT], client_name: "  An\u0000gent\n  name " });
  assert.ok(ok.ok);
  assert.equal(ok.client.name, "An gent name");
});

test("the whole flow ends with a token bound to the errands the delegate picked", async () => {
  const kit = await agentKit();
  const { principal, token } = await kit.authorize(["errand-losartan"]);
  assert.equal(token.token_type, "Bearer");
  assert.ok(token.access_token.startsWith("cmp_at_"));
  assert.deepEqual(principal.grant.errandIds, ["errand-losartan"]);
  assert.equal(principal.grant.delegateId, ANDREA.partyId);
  assert.equal(principal.clientName, "Test agent");
});

test("the consent screen lists the delegate's own open errands and nobody else's", async () => {
  const kit = await agentKit();
  const registered = await kit.auth.registerClient({ redirect_uris: [REDIRECT], client_name: "Test agent" });
  assert.ok(registered.ok);
  const begun = await kit.auth.beginAuthorization(
    new URLSearchParams({ client_id: registered.client.id, response_type: "code", code_challenge: pkce().challenge, code_challenge_method: "S256" }),
  );
  assert.ok(begun.ok);
  const described = await kit.auth.describeRequest(ANDREA, begun.requestId);
  assert.ok(described.ok);
  assert.deepEqual(described.consent.errands.map((errand) => errand.id).sort(), ["errand-losartan", "errand-other"]);
  assert.equal(described.consent.client.redirectHost, "agent.test");

  // The payer has no errands of their own to give.
  const payer = await kit.auth.describeRequest(PEDRO, begun.requestId);
  assert.ok(payer.ok && payer.consent.errands.length === 0);
});

test("a delegate cannot give an agent an errand that is not theirs or is not open", async () => {
  const kit = await agentKit();
  await kit.errands.cancel("errand-other");
  const registered = await kit.auth.registerClient({ redirect_uris: [REDIRECT] });
  assert.ok(registered.ok);
  const begun = await kit.auth.beginAuthorization(
    new URLSearchParams({ client_id: registered.client.id, response_type: "code", code_challenge: pkce().challenge, code_challenge_method: "S256" }),
  );
  assert.ok(begun.ok);
  for (const ids of [["errand-foreign"], ["errand-other"], ["errand-nope"], [], "errand-losartan", ["not an id"]]) {
    const refused = await kit.auth.approve(ANDREA, begun.requestId, ids);
    assert.ok(!refused.ok);
    assert.equal(refused.error, "invalid_errands");
  }
  // Pedro has no errand to give, so Pedro cannot answer for Andrea's agent either.
  const asPayer = await kit.auth.approve(PEDRO, begun.requestId, ["errand-losartan"]);
  assert.ok(!asPayer.ok);
  // The request survived every refusal.
  assert.ok((await kit.auth.approve(ANDREA, begun.requestId, ["errand-losartan"])).ok);
});

test("authorization problems go to the user or the client as the OAuth rules say", async () => {
  const kit = await agentKit();
  const registered = await kit.auth.registerClient({ redirect_uris: [REDIRECT] });
  assert.ok(registered.ok);
  const base = { client_id: registered.client.id, response_type: "code", code_challenge: pkce().challenge, code_challenge_method: "S256", state: "s" };

  const unknown = await kit.auth.beginAuthorization(new URLSearchParams({ ...base, client_id: "aclient-nope" }));
  assert.ok(!unknown.ok && !unknown.redirectTo);
  const wrongUri = await kit.auth.beginAuthorization(new URLSearchParams({ ...base, redirect_uri: "https://evil.test/cb" }));
  assert.ok(!wrongUri.ok && !wrongUri.redirectTo);

  const plain = await kit.auth.beginAuthorization(new URLSearchParams({ ...base, code_challenge_method: "plain" }));
  assert.ok(!plain.ok);
  assert.equal(new URL(plain.redirectTo!).searchParams.get("error"), "invalid_request");
  assert.equal(new URL(plain.redirectTo!).searchParams.get("state"), "s");
  const noChallenge = await kit.auth.beginAuthorization(new URLSearchParams({ client_id: base.client_id, response_type: "code" }));
  assert.ok(!noChallenge.ok && noChallenge.redirectTo);
  const token = await kit.auth.beginAuthorization(new URLSearchParams({ ...base, response_type: "token" }));
  assert.equal(new URL(!token.ok ? token.redirectTo! : "http://x").searchParams.get("error"), "unsupported_response_type");
  const wrongResource = await kit.auth.beginAuthorization(new URLSearchParams({ ...base, resource: "https://other.test/mcp" }));
  assert.equal(new URL(!wrongResource.ok ? wrongResource.redirectTo! : "http://x").searchParams.get("error"), "invalid_target");
  const right = await kit.auth.beginAuthorization(new URLSearchParams({ ...base, resource: RESOURCE }));
  assert.ok(right.ok);
});

test("a refusal goes back to the client as access_denied", async () => {
  const kit = await agentKit();
  const registered = await kit.auth.registerClient({ redirect_uris: [REDIRECT] });
  assert.ok(registered.ok);
  const begun = await kit.auth.beginAuthorization(
    new URLSearchParams({ client_id: registered.client.id, response_type: "code", code_challenge: pkce().challenge, code_challenge_method: "S256", state: "abc" }),
  );
  assert.ok(begun.ok);
  const denied = await kit.auth.deny(ANDREA, begun.requestId);
  assert.ok(denied.ok);
  const url = new URL(denied.redirectTo);
  assert.equal(url.searchParams.get("error"), "access_denied");
  assert.equal(url.searchParams.get("state"), "abc");
  assert.ok(!(await kit.auth.approve(ANDREA, begun.requestId, ["errand-losartan"])).ok);
});

test("the token request needs the right verifier, client and redirect URI", async () => {
  const kit = await agentKit();
  const registered = await kit.auth.registerClient({ redirect_uris: [REDIRECT] });
  assert.ok(registered.ok);
  const { verifier, challenge } = pkce();
  const attempt = async (extra: Record<string, string>) => {
    const begun = await kit.auth.beginAuthorization(
      new URLSearchParams({ client_id: registered.client.id, response_type: "code", code_challenge: challenge, code_challenge_method: "S256" }),
    );
    assert.ok(begun.ok);
    const approved = await kit.auth.approve(ANDREA, begun.requestId, ["errand-losartan"]);
    assert.ok(approved.ok);
    return kit.auth.token(
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: registered.client.id,
        redirect_uri: REDIRECT,
        code: new URL(approved.redirectTo).searchParams.get("code")!,
        code_verifier: verifier,
        ...extra,
      }),
    );
  };
  assert.equal((await attempt({ code_verifier: pkce().verifier })).ok, false);
  assert.equal((await attempt({ client_id: "aclient-other" })).ok, false);
  assert.equal((await attempt({ redirect_uri: "https://agent.test/elsewhere" })).ok, false);
  assert.equal((await attempt({ resource: "https://other.test/mcp" })).ok, false);
  assert.equal((await attempt({})).ok, true);
});

test("a code works once, and a replay ends the grant it made", async () => {
  const kit = await agentKit();
  const { form, principal, token } = await kit.authorize();
  const replay = await kit.auth.token(form({}));
  assert.ok(!replay.ok);
  assert.equal(replay.error, "invalid_grant");
  assert.equal(await kit.auth.authenticate(`Bearer ${token.access_token}`), undefined);
  assert.ok((await kit.repo.getGrant(principal.grant.id))?.revokedAt);
});

test("a code expires after a minute", async () => {
  const kit = await agentKit();
  const registered = await kit.auth.registerClient({ redirect_uris: [REDIRECT] });
  assert.ok(registered.ok);
  const { verifier, challenge } = pkce();
  const begun = await kit.auth.beginAuthorization(
    new URLSearchParams({ client_id: registered.client.id, response_type: "code", code_challenge: challenge, code_challenge_method: "S256" }),
  );
  assert.ok(begun.ok);
  const approved = await kit.auth.approve(ANDREA, begun.requestId, ["errand-losartan"]);
  assert.ok(approved.ok);
  kit.setNow(new Date(NOW.getTime() + 61_000));
  const late = await kit.auth.token(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: registered.client.id,
      redirect_uri: REDIRECT,
      code: new URL(approved.redirectTo).searchParams.get("code")!,
      code_verifier: verifier,
    }),
  );
  assert.ok(!late.ok);
});

test("refresh tokens rotate, and reusing one ends the grant", async () => {
  const kit = await agentKit();
  const { client, token } = await kit.authorize();
  const refreshed = await kit.auth.token(
    new URLSearchParams({ grant_type: "refresh_token", client_id: client.id, refresh_token: token.refresh_token }),
  );
  assert.ok(refreshed.ok);
  assert.notEqual(refreshed.token.refresh_token, token.refresh_token);
  assert.ok(await kit.auth.authenticate(`Bearer ${refreshed.token.access_token}`));

  const reused = await kit.auth.token(
    new URLSearchParams({ grant_type: "refresh_token", client_id: client.id, refresh_token: token.refresh_token }),
  );
  assert.ok(!reused.ok);
  // Both holders lose access: the newer token is revoked with the grant.
  assert.equal(await kit.auth.authenticate(`Bearer ${refreshed.token.access_token}`), undefined);
  const other = await kit.auth.token(
    new URLSearchParams({ grant_type: "refresh_token", client_id: client.id, refresh_token: refreshed.token.refresh_token }),
  );
  assert.ok(!other.ok);
});

test("an access token expires, and a refresh token of another client is useless", async () => {
  const kit = await agentKit();
  const { client, token } = await kit.authorize();
  const stranger = await kit.auth.token(
    new URLSearchParams({ grant_type: "refresh_token", client_id: "aclient-other", refresh_token: token.refresh_token }),
  );
  assert.ok(!stranger.ok);
  kit.setNow(new Date(NOW.getTime() + ACCESS_TTL_MS + 1000));
  assert.equal(await kit.auth.authenticate(`Bearer ${token.access_token}`), undefined);
  const refreshed = await kit.auth.token(
    new URLSearchParams({ grant_type: "refresh_token", client_id: client.id, refresh_token: token.refresh_token }),
  );
  assert.ok(refreshed.ok);
  assert.ok(await kit.auth.authenticate(`Bearer ${refreshed.token.access_token}`));
});

test("a grant never outlives the errands it was given for", async () => {
  const kit = await agentKit();
  const { principal, token, client } = await kit.authorize(["errand-losartan"]);
  assert.equal(principal.grant.expiresAt, "2026-11-15T00:00:00.000Z");
  assert.ok(await kit.auth.authenticate(`Bearer ${token.access_token}`));

  kit.setNow(new Date("2026-11-15T00:00:01Z"));
  assert.equal(await kit.auth.authenticate(`Bearer ${token.access_token}`), undefined);
  const refreshed = await kit.auth.token(
    new URLSearchParams({ grant_type: "refresh_token", client_id: client.id, refresh_token: token.refresh_token }),
  );
  assert.ok(!refreshed.ok);
});

test("the delegate and the payer can end an agent's access, and nobody else", async () => {
  const kit = await agentKit();
  const { principal, token } = await kit.authorize();
  assert.deepEqual((await kit.auth.listGrants(ANDREA)).map((grant) => [grant.id, grant.viewerRole]), [[principal.grant.id, "DELEGATE"]]);
  assert.deepEqual((await kit.auth.listGrants(PEDRO)).map((grant) => [grant.id, grant.viewerRole]), [[principal.grant.id, "PAYER"]]);
  assert.deepEqual(await kit.auth.listGrants(STRANGER), []);

  const refused = await kit.auth.revokeGrant(STRANGER, principal.grant.id);
  assert.ok(!refused.ok && refused.error === "unknown_grant");
  assert.ok(await kit.auth.authenticate(`Bearer ${token.access_token}`));

  const revoked = await kit.auth.revokeGrant(PEDRO, principal.grant.id);
  assert.ok(revoked.ok);
  assert.equal(revoked.grant.status, "REVOKED");
  assert.equal(await kit.auth.authenticate(`Bearer ${token.access_token}`), undefined);
});

test("the client can revoke its own token, which ends the grant", async () => {
  const kit = await agentKit();
  const { token } = await kit.authorize();
  await kit.auth.revokeToken(token.refresh_token);
  assert.equal(await kit.auth.authenticate(`Bearer ${token.access_token}`), undefined);
  // Revoking something unknown says nothing.
  await kit.auth.revokeToken("cmp_rt_unknown");
  await kit.auth.revokeToken(42);
});

test("an agent token is not a COMPAS session, and a session is not an agent token", async () => {
  const kit = await agentKit();
  const { token } = await kit.authorize();
  const identity = new DemoIdentityProvider({
    parties: new StaticPartyDirectory([{ id: ANDREA.partyId, displayName: "Andrea" }]),
  });
  const session = await identity.start(ANDREA.partyId);
  assert.ok(session);
  assert.equal(identity.authenticate(`Bearer ${token.access_token}`), undefined);
  assert.equal(await kit.auth.authenticate(`Bearer ${session.token}`), undefined);
  assert.equal(await kit.auth.authenticate(`Bearer ${token.refresh_token}`), undefined);
});
