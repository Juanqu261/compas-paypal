import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";
import { PayPalDelegateExperience } from "@/features/paypal-delegate/PayPalDelegateExperience";
import { SurfaceStage } from "@/features/site/SurfaceStage";

export default function PayPalDelegatePage() {
  return (
    <SurfaceStage surface="paypal-delegate">
      <DemoSessionProvider scenarios={loadDemoScenarios()}>
        <PayPalDelegateExperience />
      </DemoSessionProvider>
    </SurfaceStage>
  );
}
