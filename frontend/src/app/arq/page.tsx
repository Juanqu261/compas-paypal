import { ArqExperience } from "@/features/arq/ArqExperience";
import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";

export default function ArqPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <DemoSessionProvider scenarios={loadDemoScenarios()}>
        <ArqExperience />
      </DemoSessionProvider>
    </main>
  );
}
