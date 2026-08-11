import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

interface HeroIllustrationProps {
  name?: string;
  greeting: string;
  availableCount: number;
  onConsult: () => void;
  className?: string;
}

// Rotates behind the hero card so it doesn't read as a single stock photo. Duration and easing
// are tuned to be barely-noticeable mid-crossfade -- fast enough that a patient glancing at the
// dashboard doesn't wait through a visible "flash", slow enough not to be distracting motion.
const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?q=80&w=1200&auto=format&fit=crop",
];
const HERO_IMAGE_INTERVAL_MS = 6000;

export function HeroIllustration({ name, greeting, availableCount, onConsult, className }: HeroIllustrationProps) {
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setImageIndex((index) => (index + 1) % HERO_IMAGES.length);
    }, HERO_IMAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className={cn(
        "relative flex min-h-80 flex-col justify-between gap-5 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/15 via-secondary/10 to-tertiary/10 p-6 sm:min-h-96 lg:min-h-[30rem]",
        className,
      )}
    >
      {/* All four stay mounted and stacked so the crossfade is a plain opacity transition
          between already-loaded images -- swapping `src` on one <img> would flash back to
          empty/broken while the next photo re-downloads. */}
      {HERO_IMAGES.map((src, index) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          className={cn(
            "absolute inset-0 size-full object-cover object-top transition-opacity duration-1000 ease-in-out",
            index === imageIndex ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
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
