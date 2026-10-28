import { loadDemoScenarios } from "@/demo/load-scenarios";
import { DemoSessionProvider } from "@/features/demo/DemoSession";
import { PayPalBusinessExperience } from "@/features/paypal-business/PayPalBusinessExperience";
import { SurfaceStage } from "@/features/site/SurfaceStage";

export default function PayPalBusinessPage() {
  return (
    <SurfaceStage surface="paypal-business">
      <DemoSessionProvider scenarios={loadDemoScenarios()}>
        <PayPalBusinessExperience />
      </DemoSessionProvider>
    </SurfaceStage>
  );
}
