import type { ReactNode } from "react";
import { PageTransition } from "@/features/site/PageTransition";
import { PersonaName } from "@/features/site/PersonaName";
import { StoryLink } from "@/features/site/StoryLink";
import { surfaceById, surfaces, type SurfaceId } from "@/features/site/story";

/**
 * Hosts one simulated app on its own page: full screen on a phone, and a
 * device beside its caption on a desktop. The app inside is not restyled.
 */
export function SurfaceStage({
  surface: id,
  children,
}: {
  surface: SurfaceId;
  children: ReactNode;
}) {
  const surface = surfaceById(id);
  const index = surfaces.indexOf(surface);
  const previous = surfaces[index - 1];
  const next = surfaces[index + 1];

  return (
    <PageTransition>
      <main className="sm:flex sm:items-center sm:justify-center sm:gap-16 sm:px-8 sm:py-8">
        <aside className="hidden max-w-[22rem] space-y-6 lg:block">
          <p className="flex items-baseline gap-3">
            <span className="font-display text-4xl text-route">{surface.step}</span>
            <span className="text-ink-soft">of {surfaces.length} in the story</span>
          </p>
          <div className="space-y-2">
            <h1 className="font-display text-5xl leading-tight text-ink">
              <PersonaName surface={surface.id} name={surface.person} />
            </h1>
            <p className="text-lg text-ink-soft">
              {surface.role} on {surface.app}
            </p>
          </div>
          <p className="text-lg leading-relaxed text-ink">{surface.summary}</p>
          <p className="text-sm text-ink-soft italic">
            {surface.app} here is a simulation for the COMPAS demo, not an
            integration.
          </p>
          <nav aria-label="Story" className="flex flex-col gap-2 border-t border-ink/15 pt-5">
            {previous ? (
              <StoryLink href={previous.href} className="text-ink-soft underline decoration-ink/30 underline-offset-4 hover:text-ink">
                Before this: {previous.person} on {previous.app}
              </StoryLink>
            ) : (
              <StoryLink href="/demo" className="text-ink-soft underline decoration-ink/30 underline-offset-4 hover:text-ink">
                See all three phones together
              </StoryLink>
            )}
            {next ? (
              <StoryLink href={next.href} className="font-medium text-route-deep underline decoration-route/40 underline-offset-4 hover:decoration-route">
                Next: {next.person} on {next.app}
              </StoryLink>
            ) : null}
          </nav>
        </aside>

        <div className="sm:flex sm:flex-col sm:items-center">
          {/* Full viewport on a phone; a device-width screen on desktop. */}
          <div className="sm:rounded-[2.75rem] sm:bg-bezel sm:p-[10px] sm:shadow-[0_30px_60px_-28px_rgb(14_35_56/0.55),0_12px_20px_-12px_rgb(14_35_56/0.35)]">
            <div
              data-surface
              className="fixed inset-0 z-50 sm:static sm:z-auto sm:h-[min(56rem,calc(100dvh_-_10.5rem))] sm:w-[392px] sm:overflow-hidden sm:rounded-[2.2rem]"
            >
              {children}
            </div>
          </div>
          <p className="mt-4 hidden text-center text-sm text-ink-soft sm:block lg:hidden">
            {surface.person}, {surface.role.toLowerCase()}. {surface.app} is
            simulated for the COMPAS demo.
          </p>
        </div>
      </main>
    </PageTransition>
  );
}
