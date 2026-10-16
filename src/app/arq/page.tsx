import { DemoSessionProvider } from "@/features/demo/DemoSession";
import { ArqExperience } from "@/features/arq/ArqExperience";

export default function ArqPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <DemoSessionProvider>
        <ArqExperience />
      </DemoSessionProvider>
    </main>
  );
}
