import type { ReactNode } from "react";

type PhoneFrameProps = {
  title: string;
  children: ReactNode;
};

export function PhoneFrame({ title, children }: PhoneFrameProps) {
  return (
    <section className="w-72 shrink-0 rounded-2xl border border-neutral-300 bg-white p-3">
      <p className="mb-2 text-center text-xs text-neutral-500">{title}</p>
      <div className="min-h-80 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        {children}
      </div>
    </section>
  );
}
