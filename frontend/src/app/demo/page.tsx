import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoStage } from "@/features/demo/DemoStage";
import { PageTransition } from "@/features/site/PageTransition";

export default function DemoPage() {
  return (
    <PageTransition>
      <main className="pb-16">
        <h1 className="sr-only">COMPAS demo: one purchase, three phones</h1>
        <DemoStage scenarios={loadDemoScenarios()} />
      </main>
    </PageTransition>
  );
}
