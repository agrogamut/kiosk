import { Logo } from "../../components/brand/Logo";
import { PublicPageLinks } from "../../components/PublicPageLinks";

export default function RefundPolicy() {
  return (
    <div className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <Logo className="mb-8 h-10 w-auto" />
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">Refund &amp; cancellation policy</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Last updated: 8 October 2026.
      </p>

      <p className="mb-4">
        This policy covers both scheduled appointments at consultpd.madamgy.com and on-demand
        calls through the main MadamGy website, app and kiosks. The booking and refund steps
        for each service are described separately below.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">Scheduled pediatric appointments</h2>
      <h3 className="font-display mb-2 mt-6 text-lg font-bold">Payment and confirmation</h3>
      <p className="mb-4">
        The fee shown before checkout is paid upfront through Razorpay. An unpaid appointment
        is held for up to 15 minutes, ending earlier if the appointment starts. A successful
        payment is followed by confirmation from the MadamGy team. Payment alone does not
        confirm the appointment.
      </p>
      <h3 className="font-display mb-2 mt-6 text-lg font-bold">Cancellation and expired holds</h3>
      <p className="mb-4">
        You can cancel an active request from your booking receipt or family portal, or contact
        the team for help. Cancelling releases the appointment time. If no payment was collected,
        there is no consultation fee to refund.
      </p>
      <p className="mb-4">
        If a paid appointment is cancelled or rejected, or a payment is received after the
        booking hold has expired, the booking is sent to the team for refund processing.
        The team initiates the refund through Razorpay to the original payment method.
        Cancelling a booking does not itself send the refund; staff must process it.
      </p>
      <p className="mb-4">
        The payment status in your booking updates after the refund is processed by Razorpay.
        Bank processing can take additional time. If you have not received an update,
        contact us with your booking and payment references.
      </p>
      <h3 className="font-display mb-2 mt-6 text-lg font-bold">Rescheduling</h3>
      <p className="mb-4">
        Contact the MadamGy team to request a different time. A new time depends on doctor
        availability and confirmation by the team. The 30-minute consultation limit still applies.
      </p>

      <h2 className="font-display mb-2 mt-8 text-xl font-bold text-foreground">On-demand audio and video calls</h2>

      <h3 className="font-display mb-2 mt-6 text-lg font-bold text-foreground">When you're charged</h3>
      <p className="mb-4">
        The consultation fee shown at checkout is charged upfront, before you're placed in the
        queue for a doctor. Payment is processed by Razorpay; we never see or store your card, UPI,
        or bank details.
      </p>

      <h3 className="font-display mb-2 mt-6 text-lg font-bold text-foreground">Automatic refund when no doctor is available</h3>
      <p className="mb-4">
        If no doctor becomes available to take your call, your consultation is marked as such and
        the fee you paid is automatically refunded to your original payment method. No action is
        needed on your part. Refunds are issued via Razorpay and typically reflect in your
        account within 5-7 business days, depending on your bank or payment provider.
      </p>

      <h3 className="font-display mb-2 mt-6 text-lg font-bold text-foreground">Once a doctor joins the call</h3>
      <p className="mb-4">
        Once a doctor accepts and joins your consultation, the fee is non-refundable because the service
        (access to a licensed doctor for consultation) has been rendered, regardless of the medical
        outcome or advice given. This mirrors how an in-person consultation fee is not refunded
        after the appointment takes place.
      </p>

      <h3 className="font-display mb-2 mt-6 text-lg font-bold text-foreground">Technical issues</h3>
      <p className="mb-4">
        If a call disconnects or fails to connect due to a fault on our platform before the doctor
        could meaningfully consult with you, contact support within 24 hours with your details and
        we'll review it for a refund on a case-by-case basis.
      </p>

      <h3 className="font-display mb-2 mt-6 text-lg font-bold text-foreground">Cancelling before a doctor joins</h3>
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
        with your registered phone number, the website you used and, if you have them,
        the booking reference, Razorpay payment reference and consultation date/time.
      </p>
      <PublicPageLinks />
    </div>
  );
}
