import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";
import { NequiExperience } from "@/features/nequi/NequiExperience";

export default function NequiPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <DemoSessionProvider scenarios={loadDemoScenarios()}>
        <NequiExperience />
      </DemoSessionProvider>
    </main>
  );
}
