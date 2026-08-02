import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface DoctorAvatarProps {
  id: string;
  name: string;
  className?: string;
}

// `--secondary` is a light 74%-lightness coral, so it needs noticeably more alpha than
// `--primary` (63% lightness, more saturated) to read as a visible tint rather than blend into
// the page's own pale-pink `--background` (98% lightness) -- confirmed live, the previous /10
// and /30 spread left half these swatches looking like plain gray icons with no color at all.
const VARIANTS = [
  "bg-primary/25 text-primary",
  "bg-secondary/45 text-secondary-foreground",
  "bg-primary/40 text-primary",
  "bg-secondary/25 text-secondary-foreground",
];

function variantForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return VARIANTS[hash % VARIANTS.length];
}

export function DoctorAvatar({ id, name: _name, className }: DoctorAvatarProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full",
        variantForId(id),
        className,
      )}
    >
      <UserRound className="size-5" aria-hidden="true" />
    </div>
  );
}
