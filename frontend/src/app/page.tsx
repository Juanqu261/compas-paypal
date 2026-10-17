import { loadDemoScenarios } from "@/demo/load-scenarios";
import { PurposeDial } from "@/features/landing/PurposeDial";
import { RouteChart } from "@/features/landing/RouteChart";
import { PageTransition } from "@/features/site/PageTransition";
import { PersonaName } from "@/features/site/PersonaName";
import { StoryLink } from "@/features/site/StoryLink";
import { surfaces } from "@/features/site/story";

const steps = [
  {
    who: "Pedro grants once.",
    what: "In his own wallet he approves an Open Payments grant capped at USD 40, for medication for Gladys.",
  },
  {
    who: "Andrea asks to pay.",
    what: "At the counter, from Nequi. COMPAS checks the merchant and every item against the mandate’s purpose.",
  },
  {
    who: "Only an Allow moves money.",
    what: "A quote, then one outgoing payment from Pedro’s wallet to the pharmacy’s. Anything else stops before payment.",
  },
];

export default function Home() {
  return (
    <PageTransition>
      <main className="mx-auto max-w-7xl px-4 sm:px-8">
        <section className="py-14 sm:py-20 lg:py-24">
          <PurposeDial
            scenarios={loadDemoScenarios()}
            intro={
              <div className="space-y-6">
                <h1 className="font-display text-[2.6rem] leading-[1.05] text-ink sm:text-6xl lg:text-[4.5rem]">
                  Money stays where it is. COMPAS moves permission.
                </h1>
                <p className="max-w-[36rem] text-lg leading-relaxed text-ink-soft sm:text-xl">
                  Pedro, abroad, lets Andrea buy medication for Gladys with up
                  to USD 40 from his own wallet. Andrea never holds that money,
                  and it can only pay for what Pedro allowed.
                </p>
              </div>
            }
          />
        </section>

        <section
          aria-labelledby="route-heading"
          className="grid gap-10 border-t border-ink/15 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16"
        >
          <div className="space-y-8">
            <h2
              id="route-heading"
              className="font-display text-3xl leading-tight text-ink sm:text-4xl"
            >
              The money never passes through COMPAS.
            </h2>
            <ol className="space-y-6">
              {steps.map((step, index) => (
                <li key={step.who} className="grid grid-cols-[2rem_1fr] gap-x-3">
                  <span
                    aria-hidden="true"
                    className="font-display text-2xl leading-7 text-route"
                  >
                    {index + 1}
                  </span>
                  <p className="leading-relaxed text-ink-soft">
                    <span className="font-semibold text-ink">{step.who}</span>{" "}
                    {step.what}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <RouteChart />
        </section>

        <section className="border-t border-ink/15 py-16 sm:py-24">
          <blockquote className="max-w-[52rem]">
            <p className="font-display text-3xl leading-snug text-ink sm:text-[2.75rem] sm:leading-[1.2]">
              Open Payments enforces the consent and the cap. COMPAS enforces
              the purpose.
            </p>
          </blockquote>

          <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
            <div className="space-y-5">
              <p className="max-w-[28rem] text-lg leading-relaxed text-ink-soft">
                Watch the same purchase on all three phones, then try the
                liquor store against the same mandate.
              </p>
              <StoryLink
                href="/demo"
                className="inline-flex items-center rounded-md bg-route px-6 py-3.5 text-lg font-medium text-paper transition-colors duration-200 hover:bg-route-deep motion-reduce:transition-none"
              >
                Open the three-phone demo
              </StoryLink>
            </div>

            <ul className="grid gap-px overflow-hidden rounded-lg border border-ink/15 bg-ink/15 sm:grid-cols-3">
              {surfaces.map((surface) => (
                <li key={surface.id} className="bg-paper">
                  <StoryLink
                    href={surface.href}
                    className="group flex h-full flex-col gap-2 p-5 transition-colors duration-200 hover:bg-white motion-reduce:transition-none"
                  >
                    <PersonaName
                      surface={surface.id}
                      name={surface.person}
                      className="font-display text-2xl text-ink"
                    />
                    <span className="text-ink-soft">
                      {surface.role} on {surface.app}
                    </span>
                    <span className="mt-auto pt-4 text-sm text-route-deep underline decoration-route/40 underline-offset-4 group-hover:decoration-route">
                      Open {surface.app}
                    </span>
                  </StoryLink>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <footer className="border-t border-ink/15 py-8 text-sm text-ink-soft">
          <p className="max-w-[48rem]">
            ARQ, Nequi and Nequi Negocios are simulations built for this demo,
            not integrations. Amounts are demo/test data. Built for the Open
            Payments Hackathon, Medellín 2026.
          </p>
        </footer>
      </main>
    </PageTransition>
  );
}
