import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface DoctorAvatarProps {
  id: string;
  name: string;
  className?: string;
}

const VARIANTS = [
  "bg-primary/10 text-primary",
  "bg-secondary/30 text-secondary-foreground",
  "bg-primary/30 text-primary",
  "bg-secondary/10 text-secondary-foreground",
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
