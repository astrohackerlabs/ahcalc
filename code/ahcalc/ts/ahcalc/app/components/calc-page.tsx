import { SpaceRain } from "@astrohacker/ui/space-rain";
import { useMotionMode } from "@astrohacker/ui/motion-mode";
import { MotionMenu } from "@astrohacker/ui/motion-menu";
import { shellPanel } from "@astrohacker/ui/surfaces";
import { cn } from "~/lib/utils";
import { Calculator } from "~/components/calculator";
import { ExitButton } from "~/components/exit-button";

export function CalcPage(): React.JSX.Element {
  const { mode, ready } = useMotionMode();
  return (
    <div data-testid="ahcalc" className="ahcalc-root relative min-h-dvh">
      {ready && <SpaceRain motionMode={mode} data-testid="ahcalc-space-rain" />}
      <div
        aria-hidden="true"
        className="bg-[rgba(17, 18, 25,0.55)] pointer-events-none fixed inset-0 z-[2]"
      />
      <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-6 sm:px-4 sm:py-6">
        <section
          data-testid="ahcalc-shell"
          className={cn("w-full max-w-[380px] p-5", shellPanel)}
        >
          <header className="mb-[18px] flex items-center gap-3">
            <img
              src="/images/astrohacker-7-dark-64.webp"
              srcSet="/images/astrohacker-7-dark-64.webp 1x, /images/astrohacker-7-dark-128.webp 2x, /images/astrohacker-7-dark-200.webp 3x"
              width={40}
              height={40}
              alt="Astrohacker logo"
              data-testid="ahcalc-logo"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate font-heading text-[0.7rem] font-bold tracking-[0.12em] text-primary uppercase sm:text-[0.85rem] sm:tracking-[0.28em]">
                Astrohacker
              </p>
              <p className="mt-1 mb-0 text-[0.75rem] tracking-[0.08em] text-muted">
                Calculator
              </p>
            </div>
            <MotionMenu />
            <ExitButton />
          </header>
          <Calculator />
        </section>
      </main>
    </div>
  );
}
