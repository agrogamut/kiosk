import { Video } from "lucide-react";
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
        "relative flex flex-col gap-5 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/15 via-secondary/10 to-tertiary/10 p-6",
        className,
      )}
    >
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
          <h1 className="font-display text-2xl font-bold leading-tight text-foreground">
            {greeting}
            {name ? `, ${name}` : ""}
          </h1>
          <p className="text-muted-foreground">How are you feeling today?</p>
        </div>
        {availableCount > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-card/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm supports-[backdrop-filter]:backdrop-blur-sm">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-tertiary opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-tertiary" />
            </span>
            {availableCount} available
          </div>
        )}
      </div>

      <div className="relative flex h-28 items-center justify-center">
        <div className="absolute inset-0 m-auto size-28 rounded-full bg-primary/20 blur-xl motion-safe:animate-pulse" />

        <div className="relative flex size-28 items-center justify-center rounded-3xl bg-card shadow-md">
          <svg viewBox="0 0 64 64" aria-hidden="true" className="size-20">
            <circle cx="32" cy="27" r="15" className="fill-muted" />
            <path
              d="M6 62c2-13 11-21 26-21s24 8 26 21v2H6v-2Z"
              className="fill-primary/25"
            />
            <path
              d="M20 44c2 5 7 8 12 8s10-3 12-8c-4 3-8 4.5-12 4.5S24 47 20 44Z"
              className="fill-card"
            />
            <path
              d="M18 24c0-8 6-13 14-13s14 5 14 13c0 1.4-.1 2.7-.4 4l-2.4-.6c.5-3.5-.6-7.6-2.6-9.6-2.3 1.3-5.4 1.8-8.6 1.5-2.6 1.5-4.3 4-4.8 8.1l-2.4.6c-.5-1.3-.8-2.6-.8-4Z"
              className="fill-primary"
            />
          </svg>
        </div>

        <div className="absolute -bottom-1 right-[calc(50%-3.25rem)] flex size-9 items-center justify-center rounded-full bg-primary shadow-sm ring-4 ring-background">
          <Video className="size-4 text-primary-foreground" aria-hidden="true" />
        </div>
      </div>

      <Button onClick={onConsult} className="relative w-full rounded-full text-lg">
        Consult a doctor
      </Button>
    </div>
  );
}
