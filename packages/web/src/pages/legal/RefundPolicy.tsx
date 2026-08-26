import { Logo } from "../../components/brand/Logo";

export default function RefundPolicy() {
  return (
    <div className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <Logo className="mb-8 h-10 w-auto" />
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">Refund &amp; cancellation policy</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Last updated: 27 August 2026.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">When you're charged</h2>
      <p className="mb-4">
        The consultation fee shown at checkout is charged upfront, before you're placed in the
        queue for a doctor. Payment is processed by Razorpay; we never see or store your card, UPI,
        or bank details.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Automatic refund — no doctor available</h2>
      <p className="mb-4">
        If no doctor becomes available to take your call, your consultation is marked as such and
        the fee you paid is automatically refunded to your original payment method. No action is
        needed on your part. Refunds are issued via Razorpay and typically reflect in your
        account within 5–7 business days, depending on your bank or payment provider.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Once a doctor joins the call</h2>
      <p className="mb-4">
        Once a doctor accepts and joins your consultation, the fee is non-refundable — the service
        (access to a licensed doctor for consultation) has been rendered, regardless of the medical
        outcome or advice given. This mirrors how an in-person consultation fee is not refunded
        after the appointment takes place.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Technical issues</h2>
      <p className="mb-4">
        If a call disconnects or fails to connect due to a fault on our platform before the doctor
        could meaningfully consult with you, contact support within 24 hours with your details and
        we'll review it for a refund on a case-by-case basis.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Cancelling before a doctor joins</h2>
      <p className="mb-4">
        You can leave the queue at any point before a doctor joins your call from within the app.
        If a doctor has not yet joined, this is treated the same as the "no doctor available" case
        above and the fee is refunded automatically.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Contact</h2>
      <p className="mb-4">
        For refund questions, write to{" "}
        <a href="mailto:agrogamut@gmail.com" className="text-primary underline">
          agrogamut@gmail.com
        </a>{" "}
        with your registered phone number and, if you have it, the consultation date/time.
      </p>
    </div>
  );
}
