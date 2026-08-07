import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

interface HeroIllustrationProps {
  name?: string;
  greeting: string;
  availableCount: number;
  onConsult: () => void;
  className?: string;
}

export function HeroIllustration({ name, greeting, availableCount, onConsult, className }: HeroIllustrationProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-80 flex-col justify-between gap-5 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/15 via-secondary/10 to-tertiary/10 p-6 sm:min-h-96 lg:min-h-[30rem]",
        className,
      )}
    >
      <img
        src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=1200&auto=format&fit=crop"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover object-top"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-primary/70 via-primary/15 to-primary/80" />

      {/* Botanical line-art accent -- the page's one aesthetic signature, echoed
          faintly again on the doctor cards below. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 120 120"
        className="pointer-events-none absolute -left-6 -top-6 size-32 text-primary/25"
      >
        <path
          d="M20 90C10 60 25 25 60 15c-5 20 5 35 25 40-20 5-35 20-40 40-10-15-20-15-25-5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <div aria-hidden="true" className="absolute -right-8 -top-8 size-36 rounded-full bg-secondary/25 blur-2xl" />
      <div aria-hidden="true" className="absolute -bottom-10 left-10 size-28 rounded-full bg-tertiary/20 blur-2xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight text-white drop-shadow-sm">
            {greeting}
            {name ? `, ${name}` : ""}
          </h1>
          <p className="text-white/85">How are you feeling today?</p>
        </div>
        {availableCount > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-card/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm supports-[backdrop-filter]:backdrop-blur-sm">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-tertiary opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-tertiary" />
            </span>
            {availableCount} available
          </div>
        )}
      </div>

      <Button
        onClick={onConsult}
        className="relative w-full rounded-full border border-white/40 bg-white/20 text-lg text-white shadow-md backdrop-blur-sm hover:bg-white/30"
      >
        Consult a doctor
      </Button>
    </div>
  );
}
