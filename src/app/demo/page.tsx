import { DemoStage } from "@/features/demo/DemoStage";

export default function DemoPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Demo</h1>
        <p className="text-sm text-neutral-600">
          One payment lifecycle across three simulated wallet surfaces. The
          phones share scenario state. Switching the fixture updates all three.
        </p>
      </header>
      <DemoStage />
    </main>
  );
}
