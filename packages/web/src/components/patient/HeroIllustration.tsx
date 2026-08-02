import { Video } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroIllustrationProps {
  availableCount: number;
  className?: string;
}

export function HeroIllustration({ availableCount, className }: HeroIllustrationProps) {
  return (
    <div
      className={cn(
        "relative flex h-40 items-center overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-secondary/15 to-primary/10 px-6",
        className,
      )}
    >
      {availableCount > 0 && (
        <div className="absolute right-5 top-5 flex items-center gap-1.5 rounded-full bg-card/80 px-3 py-1 text-xs font-medium text-foreground shadow-sm supports-[backdrop-filter]:backdrop-blur-sm">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {availableCount} doctor{availableCount === 1 ? "" : "s"} available now
        </div>
      )}

      <div className="relative flex size-24 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/25 blur-xl motion-safe:animate-pulse" />
        <div className="relative z-10 flex size-16 items-center justify-center rounded-2xl bg-card shadow-md">
          <Video className="size-7 text-primary" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
