import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";
import { NequiBusinessExperience } from "@/features/nequi-business/NequiBusinessExperience";

export default function NequiBusinessPage() {
  return (
    <main className="sm:flex sm:flex-col sm:items-center sm:px-6 sm:py-6">
      {/* Full viewport on a phone; a centered device-width screen on desktop. */}
      <div className="fixed inset-0 z-50 sm:static sm:z-auto sm:h-[min(56rem,calc(100dvh_-_8.5rem))] sm:w-full sm:max-w-[412px] sm:overflow-hidden sm:rounded-[2.25rem] sm:border-[10px] sm:border-neutral-900 sm:shadow-xl">
        <DemoSessionProvider scenarios={loadDemoScenarios()}>
          <NequiBusinessExperience />
        </DemoSessionProvider>
      </div>
      <p className="mt-3 hidden text-center text-xs text-neutral-500 sm:block">
        Nequi Negocios simulation for the COMPAS demo. Not a Nequi integration.
      </p>
    </main>
  );
}
