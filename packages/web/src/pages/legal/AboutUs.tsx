import { Logo } from "../../components/brand/Logo";
import { PublicPageLinks } from "../../components/PublicPageLinks";

export default function AboutUs() {
  return (
    <div className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <Logo className="mb-8 h-10 w-auto" />
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">About us</h1>

      <p className="mb-4">
        MadamGy is a telemedicine platform operated by Agrogamut Services Pvt Ltd. We connect
        patients to licensed doctors for on-demand audio/video consultations from kiosk devices,
        the web, and the MadamGy Android app.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">What we offer</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>On-demand video/audio consultations with a licensed, admin-verified doctor.</li>
        <li>Digital prescriptions issued directly by the consulting doctor at the end of a call.</li>
        <li>A health locker to store lab reports and prescriptions for future consultations.</li>
        <li>In-call chat for sharing vitals, images, and documents with your doctor.</li>
      </ul>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Scheduled pediatric consultations</h2>
      <p className="mb-4">
        Families can register a child and request an appointment through{" "}
        <a href="https://consultpd.madamgy.com" className="text-primary underline">consultpd.madamgy.com</a>,
        our pediatric consultation portal. Choose a specific doctor or any available doctor,
        then select an available time. Each consultation is limited to 30 minutes.
      </p>
      <p className="mb-4">
        The consultation fee is paid through Razorpay before the MadamGy team confirms the booking.
        Families can return to the portal to view their appointment and documents released to them
        by the team. See our <a href="/pricing" className="text-primary underline">pricing</a> and{" "}
        <a href="/refund-policy" className="text-primary underline">cancellation and refund policy</a>.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Who we are</h2>
      <p className="mb-4">
        Agrogamut Services Pvt Ltd is the registered business operating the MadamGy platform.
        Doctors for the on-demand service are verified against their degree, registration number, and license
        document before being approved to take consultations.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Get in touch</h2>
      <p className="mb-4">
        For support, billing, or general questions, reach us at{" "}
        <a href="mailto:agrogamut@gmail.com" className="text-primary underline">
          agrogamut@gmail.com
        </a>{" "}
        or call{" "}
        <a href="tel:+918100540644" className="text-primary underline">
          +91 8100540644
        </a>
        .
      </p>
      <p className="mb-4">
        Registered office: Shop No. 9, 201 (239) Kamala Abasa, M.B. Road, Nimta, Kolkata,
        North 24 Parganas, West Bengal, PIN: 700049.
      </p>
      <PublicPageLinks />
    </div>
  );
}
