import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";
import { NequiBusinessExperience } from "@/features/nequi-business/NequiBusinessExperience";
import { SurfaceStage } from "@/features/site/SurfaceStage";

export default function NequiBusinessPage() {
  return (
    <SurfaceStage surface="nequi-negocios">
      <DemoSessionProvider scenarios={loadDemoScenarios()}>
        <NequiBusinessExperience />
      </DemoSessionProvider>
    </SurfaceStage>
  );
}
