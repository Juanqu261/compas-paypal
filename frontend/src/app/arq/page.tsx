import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";
import { ArqExperience } from "@/features/arq/ArqExperience";
import { SurfaceStage } from "@/features/site/SurfaceStage";

export default function ArqPage() {
  return (
    <SurfaceStage surface="arq">
      <DemoSessionProvider scenarios={loadDemoScenarios()}>
        <ArqExperience />
      </DemoSessionProvider>
    </SurfaceStage>
  );
}
