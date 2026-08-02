import { Heart, Plus, Stethoscope, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { PulseRing } from "../brand/PulseRing";

interface HeroIllustrationProps {
  className?: string;
}

export function HeroIllustration({ className }: HeroIllustrationProps) {
  return (
    <div
      className={cn(
        "relative flex h-40 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-secondary/15 to-primary/10",
        className,
      )}
    >
      <Heart className="absolute left-6 top-6 size-5 text-primary/40" aria-hidden="true" />
      <Stethoscope className="absolute right-8 top-7 size-6 text-secondary-foreground/30" aria-hidden="true" />
      <Plus className="absolute bottom-7 right-7 size-5 text-primary/30" aria-hidden="true" />

      <div className="relative flex size-24 items-center justify-center">
        <div className="absolute inset-0 flex items-center justify-center">
          <PulseRing size="lg" />
        </div>
        <div className="relative z-10 flex size-16 items-center justify-center rounded-2xl bg-card shadow-md">
          <Video className="size-7 text-primary" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
