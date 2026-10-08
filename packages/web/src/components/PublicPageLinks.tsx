import { Link } from "react-router-dom";

export function PublicPageLinks() {
  return (
    <nav aria-label="Business information" className="mt-8 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-6 text-sm">
      <Link to="/about" className="underline">About us</Link>
      <Link to="/contact" className="underline">Contact</Link>
      <Link to="/pricing" className="underline">Pricing</Link>
      <Link to="/terms" className="underline">Terms &amp; conditions</Link>
      <Link to="/privacy-policy" className="underline">Privacy policy</Link>
      <Link to="/refund-policy" className="underline">Cancellation and refunds</Link>
    </nav>
  );
}
