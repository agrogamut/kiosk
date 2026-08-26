import { Logo } from "../../components/brand/Logo";

export default function Terms() {
  return (
    <div className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <Logo className="mb-8 h-10 w-auto" />
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">Terms &amp; conditions</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Last updated: 27 August 2026.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">1. Acceptance of terms</h2>
      <p className="mb-4">
        By creating an account or using MadamGy (the "Service"), operated by Agrogamut Services Pvt
        Ltd ("we", "us"), you agree to these terms. If you do not agree, do not use the Service.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">2. What the Service is</h2>
      <p className="mb-4">
        MadamGy connects patients with independent, licensed doctors for remote audio/video
        consultations. We provide the technology platform — scheduling, payment, video calling,
        chat, and prescription delivery. Doctors on the platform are independently licensed
        practitioners responsible for the medical advice, diagnosis, and treatment they provide.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">3. Medical disclaimer</h2>
      <p className="mb-4">
        MadamGy is not an emergency service. If you are experiencing a medical emergency, call your
        local emergency number or go to the nearest hospital immediately — do not wait for a
        consultation on this platform. Consultations are provided at the professional discretion of
        the treating doctor and do not guarantee a specific diagnosis or outcome.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">4. Accounts and eligibility</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>You must provide accurate information when registering, including a working phone number used to verify your identity.</li>
        <li>You are responsible for keeping your login credentials confidential and for all activity under your account.</li>
        <li>Doctor accounts require admin approval, based on submitted degree, registration number, and license documents.</li>
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
    </div>
  );
}
