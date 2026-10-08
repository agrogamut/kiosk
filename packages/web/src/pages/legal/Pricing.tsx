import { Link } from "react-router-dom";
import { Logo } from "../../components/brand/Logo";
import { PublicPageLinks } from "../../components/PublicPageLinks";

export default function Pricing() {
  return (
    <main className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <Logo className="mb-8 h-10 w-auto" />
      <h1 className="font-display mb-6 text-2xl font-bold">Consultation pricing</h1>
      <p className="mb-4 text-sm text-muted-foreground">Last updated: 8 October 2026.</p>
      <h2 className="font-display mb-2 mt-8 text-xl font-bold">Scheduled pediatric consultations</h2>
      <p className="mb-4">
        Book through <a href="https://consultpd.madamgy.com" className="text-primary underline">consultpd.madamgy.com</a>.
      </p>
      <dl className="mb-6 divide-y divide-border border-y border-border">
        <div className="flex flex-wrap justify-between gap-2 py-3">
          <dt>Consultation fee</dt><dd className="font-semibold">₹1,200 per appointment</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2 py-3">
          <dt>Duration</dt><dd>Up to 30 minutes</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2 py-3">
          <dt>Currency</dt><dd>Indian rupees (INR)</dd>
        </div>
      </dl>
      <p className="mb-4">
        Select a doctor and an available time, or choose a time for any available doctor.
        All appointment times are shown in India Standard Time (IST).
      </p>
      <p className="mb-4">
        Payment is collected upfront through Razorpay. An unpaid appointment is held for up to
        15 minutes, ending earlier if the appointment starts. After successful payment, the
        booking awaits confirmation by the MadamGy team. Payment alone does not confirm it.
      </p>
      <p className="mb-4">
        The amount for your booking is shown before you pay. Check that amount before completing
        checkout. See the <Link to="/refund-policy" className="text-primary underline">cancellation and refund policy</Link> for
        cancelled or rejected bookings and payments received after a hold expires.
      </p>
      <h2 className="font-display mb-2 mt-8 text-xl font-bold">On-demand audio and video consultations</h2>
      <p className="mb-4">
        On-demand calls through the main MadamGy website, app or kiosk use a separate booking flow.
        The fee for that service is displayed before payment. The scheduled pediatric consultation
        price above applies to consultpd.madamgy.com.
      </p>
      <p className="mb-4">
        For billing questions, <Link to="/contact" className="text-primary underline">contact us</Link>.
      </p>
      <PublicPageLinks />
    </main>
  );
}
