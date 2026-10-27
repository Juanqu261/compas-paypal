import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";
import { PayPalExperience } from "@/features/paypal/PayPalExperience";
import { SurfaceStage } from "@/features/site/SurfaceStage";

export default function PayPalPage() {
  return (
    <SurfaceStage surface="paypal">
      <DemoSessionProvider scenarios={loadDemoScenarios()}>
        <PayPalExperience />
      </DemoSessionProvider>
    </SurfaceStage>
  );
}
