import { Logo } from "../brand/Logo";

export function KioskHeader() {
  return (
    <header className="flex items-center justify-center border-b border-border bg-card px-6 py-4">
      <Logo />
    </header>
  );
}
