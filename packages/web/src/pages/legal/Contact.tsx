import { Logo } from "../../components/brand/Logo";
import { PublicPageLinks } from "../../components/PublicPageLinks";

export default function Contact() {
  return (
    <main className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <Logo className="mb-8 h-10 w-auto" />
      <h1 className="font-display mb-6 text-2xl font-bold">Contact us</h1>
      <p className="mb-4">
        MadamGy and the scheduled pediatric consultation portal at consultpd.madamgy.com
        are operated by Agrogamut Services Pvt Ltd.
      </p>
      <h2 className="font-display mb-2 mt-8 text-xl font-bold">Appointments, payments and support</h2>
      <p className="mb-4">
        For booking confirmation, cancellation, rescheduling, refunds or access to your
        child's documents, contact the MadamGy team.
      </p>
      <p className="mb-3">
        Email: <a href="mailto:agrogamut@gmail.com" className="text-primary underline">agrogamut@gmail.com</a>
      </p>
      <p className="mb-4">
        Phone: <a href="tel:+918100540644" className="text-primary underline">+91 8100540644</a>
      </p>
      <p className="mb-4">
        Include the website you used, your registration or booking reference, and the appointment
        date if available. For a payment query, include the Razorpay payment reference.
        Do not send passwords, one-time codes or card details.
      </p>
      <h2 className="font-display mb-2 mt-8 text-xl font-bold">Registered office</h2>
      <address className="mb-4 not-italic">
        Agrogamut Services Pvt Ltd<br />
        Shop No. 9, 201 (239) Kamala Abasa, M.B. Road, Nimta, Kolkata,<br />
        North 24 Parganas, West Bengal, PIN: 700049.
      </address>
      <PublicPageLinks />
    </main>
  );
}
