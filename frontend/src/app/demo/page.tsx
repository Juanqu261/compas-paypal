import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoStage } from "@/features/demo/DemoStage";
import { PageTransition } from "@/features/site/PageTransition";

export default function DemoPage() {
  return (
    <PageTransition>
      <main className="pt-10 pb-16 sm:pt-14">
        <header className="mx-auto max-w-7xl space-y-3 px-4 pb-8 sm:px-8">
          <h1 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
            One purchase, three phones.
          </h1>
          <p className="max-w-[44rem] text-lg leading-relaxed text-ink-soft">
            Pedro authorizes, Andrea pays and the pharmacy collects. The phones
            share one scenario, so switching the purchase updates all three.
          </p>
        </header>
        <DemoStage scenarios={loadDemoScenarios()} />
      </main>
    </PageTransition>
  );
}
