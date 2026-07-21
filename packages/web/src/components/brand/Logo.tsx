import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return <img src="/madamgy_horizontal.png" alt="MadamGy" className={cn("h-8 w-auto", className)} />;
}
