import { Logo } from "../../components/brand/Logo";
import { PublicPageLinks } from "../../components/PublicPageLinks";

export default function Terms() {
  return (
    <div className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <Logo className="mb-8 h-10 w-auto" />
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">Terms &amp; conditions</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Last updated: 8 October 2026.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">1. Acceptance of terms</h2>
      <p className="mb-4">
        By creating an account or using MadamGy (the "Service"), operated by Agrogamut Services Pvt
        Ltd ("we", "us"), you agree to these terms. This includes the main website, app and kiosks,
        and the scheduled pediatric consultation portal at consultpd.madamgy.com.
        If you do not agree, do not use the Service.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">2. What the Service is</h2>
      <p className="mb-4">
        MadamGy connects patients with independent, licensed doctors for remote audio/video
        consultations. We provide the technology platform for scheduling, payment, video calling,
        chat, and prescription delivery. Doctors on the platform are independently licensed
        practitioners responsible for the medical advice, diagnosis, and treatment they provide.
      </p>
      <p className="mb-4">
        At consultpd.madamgy.com, a parent or guardian registers a child, chooses a specific
        doctor or any available doctor, and requests an appointment time. Each appointment is
        limited to 30 minutes. Times are shown in India Standard Time (IST). Families can access
        appointment details and documents released to them through the family portal.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">3. Medical disclaimer</h2>
      <p className="mb-4">
        MadamGy is not an emergency service. If you are experiencing a medical emergency, call your
        local emergency number or go to the nearest hospital immediately. Do not wait for a
        consultation on this platform. Consultations are provided at the professional discretion of
        the treating doctor and do not guarantee a specific diagnosis or outcome.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">4. Accounts and eligibility</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>You must provide accurate information when registering, including a working contact phone number. On-demand accounts use phone verification.</li>
        <li>For scheduled pediatric consultations, the parent or guardian provides their contact details and the child's full name and date of birth. Family accounts use the portal's separate sign-in process.</li>
        <li>You are responsible for keeping your login credentials confidential and for all activity under your account.</li>
        <li>On-demand doctor accounts require admin approval, based on submitted degree, registration number, and license documents.</li>
      </ul>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">5. Fees and payment</h2>
      <p className="mb-4">
        Consultations are paid for upfront at the fee shown at checkout, processed through
        Razorpay. We do not store your card, UPI, or bank details. See our{" "}
        <a href="/refund-policy" className="text-primary underline">
          Refund &amp; Cancellation Policy
        </a>{" "}
        for when a consultation fee is refunded.
      </p>
      <p className="mb-4">
        Scheduled appointment requests are held for up to 15 minutes while awaiting payment,
        ending earlier if the appointment starts. After payment is successfully collected,
        the MadamGy team must confirm the booking. A payment receipt alone is not an appointment
        confirmation. Late payments and paid bookings that are rejected or cancelled are sent
        to the team for refund processing.
      </p>
      <p className="mb-4">
        See <a href="/pricing" className="text-primary underline">consultation pricing</a> for
        the scheduled service. Contact the team to request rescheduling; changes depend on
        available doctor time and confirmation.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">6. Acceptable use</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>Do not use the Service for anything unlawful, fraudulent, or abusive toward doctors, patients, or staff.</li>
        <li>Do not attempt to circumvent the platform to transact with a doctor outside MadamGy for consultations initiated here.</li>
        <li>Do not upload content you do not have the right to share, or that violates another person's privacy.</li>
      </ul>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">7. Prescriptions and records</h2>
      <p className="mb-4">
        Prescriptions are issued at the treating doctor's professional judgment. Consultation and
        prescription records are retained as described in our{" "}
        <a href="/privacy-policy" className="text-primary underline">
          Privacy Policy
        </a>
        , in line with applicable Indian medical record-keeping requirements.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">8. Limitation of liability</h2>
      <p className="mb-4">
        To the extent permitted by law, Agrogamut Services Pvt Ltd is not liable for the medical
        advice, diagnosis, or treatment given by any doctor on the platform, or for indirect,
        incidental, or consequential damages arising from use of the Service. Nothing here limits
        liability that cannot be limited under Indian law.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">9. Changes to these terms</h2>
      <p className="mb-4">
        We may update these terms from time to time. Continued use of the Service after a change is
        posted means you accept the updated terms.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">10. Governing law</h2>
      <p className="mb-4">These terms are governed by the laws of India.</p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Contact</h2>
      <p className="mb-4">
        Questions about these terms can be sent to{" "}
        <a href="mailto:agrogamut@gmail.com" className="text-primary underline">
          agrogamut@gmail.com
        </a>
        .
      </p>
      <PublicPageLinks />
    </div>
  );
}
