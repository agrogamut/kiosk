import { Logo } from "../../components/brand/Logo";
import { PublicPageLinks } from "../../components/PublicPageLinks";

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <Logo className="mb-8 h-10 w-auto" />
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">Privacy policy</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Last updated: 8 October 2026.
      </p>

      <p className="mb-4">
        This policy covers MadamGy's main website, app and kiosks, and the scheduled pediatric
        consultation portal at consultpd.madamgy.com, operated by Agrogamut Services Pvt Ltd.
        The services have separate registration and sign-in flows.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Information for on-demand consultations</h2>
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
          card, UPI, or bank details. Razorpay handles those directly.
        </li>
        <li>
          <strong>For doctors:</strong> degree, registration number, specialization, and license document, used for admin verification
          before approval.
        </li>
      </ul>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Information for scheduled pediatric consultations</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>Registration details: the parent or guardian's name, contact phone number, optional email address, and the child's full name and date of birth.</li>
        <li>Family account and access details used to let you return to your registrations and appointments.</li>
        <li>Booking records: the requested doctor and time, appointment status, payment references, amounts and refund status.</li>
        <li>Child profiles, consultation notes and documents recorded or prepared by the team, including files released to the family.</li>
      </ul>
      <p className="mb-4">
        These details are used to arrange appointments, process payments and refunds, contact
        the family, and provide access to the child's records. Razorpay processes checkout;
        the consultation portal stores payment references and status, not card or bank credentials.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Who can access it</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>The doctor assigned to your consultation can see your health profile, uploaded files, and prior prescriptions with MadamGy, so they can treat you safely.</li>
        <li>Platform administrators can access account and consultation records for support, safety, and compliance purposes.</li>
        <li>In the scheduled consultation portal, a family can access the registrations linked to their access or account and documents that staff have released to them. Assigned doctors and authorised staff access records needed for their work.</li>
        <li>We do not sell your personal or health data to third parties.</li>
      </ul>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">How long we keep it</h2>
      <p className="mb-4">
        We retain consultation, prescription, and related medical records in line with applicable
        Indian medical record-keeping requirements, including the Clinical Establishments
        (Registration and Regulation) Act, 2010 and its associated Rules, and the Telemedicine
        Practice Guidelines, 2020. Personal data more broadly is handled in line with the Digital
        Personal Data Protection Act, 2023 and the Information Technology (Reasonable Security
        Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011. Where
        these frameworks specify a minimum retention period for medical records, we retain the
        underlying consultation and prescription records for at least that period, even after you
        delete your account, so your treating doctor's records remain complete and auditable. Your
        personal identifying details (name, phone, email, and profile information) are removed when
        you delete your account; consultation records associated with your account are retained but
        no longer linked to your identifying information beyond what's necessary to meet these
        requirements.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Deleting your account</h2>
      <p className="mb-4">
        For your on-demand MadamGy account, you can request deletion from within the app, or without
        installing the app at{" "}
        <a href="/delete-account" className="text-primary underline">
          /delete-account
        </a>
        .
      </p>
      <p className="mb-4">
        For access, correction or deletion requests concerning a child or family record in
        consultpd.madamgy.com, contact agrogamut@gmail.com and identify the registration concerned.
        The on-demand account deletion page does not delete records in the separate consultation
        portal. The record-retention requirements described above still apply.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Contact</h2>
      <p className="mb-4">
        Questions about this policy or your data can be sent to{" "}
        <a href="mailto:agrogamut@gmail.com" className="text-primary underline">
          agrogamut@gmail.com
        </a>
        .
      </p>
      <PublicPageLinks />
    </div>
  );
}
