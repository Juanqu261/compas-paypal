import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";
import { NequiExperience } from "@/features/nequi/NequiExperience";
import { SurfaceStage } from "@/features/site/SurfaceStage";

export default function NequiPage() {
  return (
    <SurfaceStage surface="nequi">
      <DemoSessionProvider scenarios={loadDemoScenarios()}>
        <NequiExperience />
      </DemoSessionProvider>
    </SurfaceStage>
  );
}
