/** The part of `fetch` an adapter uses, so tests can pass a fake API. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
