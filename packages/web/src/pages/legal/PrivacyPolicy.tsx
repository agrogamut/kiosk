import { Logo } from "../../components/brand/Logo";

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <Logo className="mb-8 h-10 w-auto" />
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">Privacy policy</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Last updated: check this date against the actual publish date before submitting to Play Console.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">What we collect</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>
          <strong>Account details:</strong> phone number, full name, date of birth.
        </li>
        <li>
          <strong>Optional profile details:</strong> gender, email address, height, weight, blood type.
        </li>
        <li>
          <strong>Health information:</strong> lab reports and other files you upload, prescriptions issued during a consultation, and
          vitals shared during a call.
        </li>
        <li>
          <strong>Consultation content:</strong> chat messages (text, images, and documents) exchanged with your doctor during a call.
        </li>
        <li>
          <strong>Payment metadata:</strong> consultation fee amount and payment status, processed via Razorpay. We do not store your
          card, UPI, or bank details — Razorpay handles that directly.
        </li>
        <li>
          <strong>For doctors:</strong> degree, registration number, specialization, and license document, used for admin verification
          before approval.
        </li>
      </ul>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Who can access it</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>The doctor assigned to your consultation can see your health profile, uploaded files, and prior prescriptions with MadamGy, so they can treat you safely.</li>
        <li>Platform administrators can access account and consultation records for support, safety, and compliance purposes.</li>
        <li>We do not sell your personal or health data to third parties.</li>
      </ul>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">How long we keep it</h2>
      <p className="mb-4">
        We retain consultation and prescription records for as long as required by applicable medical
        record-keeping regulations, even after you delete your account, so your treating doctor's
        records remain complete and auditable. Your personal identifying details (name, phone, email,
        and profile information) are removed when you delete your account; consultation records
        associated with your account are retained but no longer linked to your identifying information
        beyond what's necessary for that retention requirement.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Deleting your account</h2>
      <p className="mb-4">
        You can delete your account and personal data at any time from within the app, or without
        installing the app at{" "}
        <a href="/delete-account" className="text-primary underline">
          /delete-account
        </a>
        .
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Contact</h2>
      <p className="mb-4">Replace this line with a real support contact email before publishing.</p>
    </div>
  );
}
