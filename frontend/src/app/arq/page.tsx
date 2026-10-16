import { ArqExperience } from "@/features/arq/ArqExperience";
import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";

export default function ArqPage() {
  return (
    <main className="sm:flex sm:justify-center sm:px-6 sm:py-6">
      {/* Full viewport on a phone; a centered device-width screen on desktop. */}
      <div className="fixed inset-0 z-50 sm:static sm:z-auto sm:h-[min(56rem,calc(100dvh_-_7rem))] sm:w-full sm:max-w-[412px] sm:overflow-hidden sm:rounded-[2.25rem] sm:border-[10px] sm:border-neutral-900 sm:shadow-xl">
        <DemoSessionProvider scenarios={loadDemoScenarios()}>
          <ArqExperience />
        </DemoSessionProvider>
      </div>
    </main>
  );
}
