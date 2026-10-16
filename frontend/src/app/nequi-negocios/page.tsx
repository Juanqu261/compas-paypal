import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";
import { NequiBusinessExperience } from "@/features/nequi-business/NequiBusinessExperience";

export default function NequiBusinessPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <DemoSessionProvider scenarios={loadDemoScenarios()}>
        <NequiBusinessExperience />
      </DemoSessionProvider>
    </main>
  );
}
