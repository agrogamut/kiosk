import { cn } from "@/lib/utils";

interface DoctorAvatarProps {
  id: string;
  name: string;
  className?: string;
  showStatus?: boolean;
}

// Small illustrated bust per doctor, keyed off `id` so the same doctor always
// gets the same look. Hair/scrub colors stay inside the brand's three hues
// (rose/coral/sage) rather than literal skin tones -- reads as a friendly
// abstract character, not a stand-in for any particular person.
const VARIANTS = [
  { hair: "fill-primary", scrub: "fill-primary/20", hairPath: "M8 17c0-6 4-10.5 10-10.5S28 11 28 17v2H8v-2Z" },
  { hair: "fill-secondary", scrub: "fill-secondary/25", hairPath: "M7 18c-1-7 3.5-12 11-12s12 5 11 12l-3 .5C25 13 21 10 18 10s-7 3-8 8.5L7 18Z" },
  { hair: "fill-tertiary", scrub: "fill-tertiary/20", hairPath: "M9 16.5C9 10 13 6 18 6s9 4 9 10.5c0 1-.3 2-.7 3l-2-1c.4-2.3-.4-6-1.8-7.6-1.8 1-4.2 1.4-7 1.2-2 1.2-3.4 3.2-3.8 6.4l-2-1c.1-.7.2-1.4.3-2Z" },
  { hair: "fill-secondary", scrub: "fill-primary/20", hairPath: "M8.5 17c-.7-6.5 3.3-11 9.5-11s10.2 4.5 9.5 11l-2 .3c.3-5-2.7-8.8-7.5-8.8s-7.8 3.8-7.5 8.8l-2-.3Z" },
] as const;

function variantForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return VARIANTS[hash % VARIANTS.length];
}

export function DoctorAvatar({ id, name, className, showStatus = false }: DoctorAvatarProps) {
  const variant = variantForId(id);

  return (
    <div className={cn("relative inline-flex size-14 shrink-0", className)}>
      <svg viewBox="0 0 36 36" role="img" aria-label={name} className="size-full">
        <circle cx="18" cy="18" r="18" className="fill-card" />
        <path d="M2 33c1.5-7 7.5-11.5 16-11.5S34.5 26 36 33v3H2v-3Z" className={variant.scrub} />
        <circle cx="18" cy="16" r="9" className="fill-muted" />
        <path d={variant.hairPath} className={variant.hair} />
      </svg>
      {showStatus && (
        <span className="absolute bottom-0 right-0 flex size-3.5 items-center justify-center rounded-full bg-card">
          <span className="size-2.5 rounded-full bg-tertiary" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
