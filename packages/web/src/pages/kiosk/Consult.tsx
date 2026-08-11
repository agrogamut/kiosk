import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import type { CallSession } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { CallChatPanel } from "../../components/call/CallChatPanel";
import { KioskCallView } from "../../components/video/KioskCallView";
import { PulseRing } from "../../components/brand/PulseRing";
import { api } from "../../lib/api";
import { fetchActiveCall } from "../../lib/activeCall";
import { getApiErrorMessage } from "../../lib/errors";
import { getLivekitUrl } from "../../lib/livekitUrl";
import { getSocket } from "../../lib/socket";
import { useImmersiveStatusBar } from "../../hooks/useImmersiveStatusBar";
import { useCallStore } from "../../store/call.store";
import { useKioskStore } from "../../store/kiosk.store";

interface PaymentOrder {
  paymentId: string;
  razorpayOrderId: string;
  amount: number;
  keyId: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  order_id: string;
  handler: () => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

const PAYMENT_RETRY_DELAY_MS = 1500;

export default function KioskConsult() {
  const navigate = useNavigate();
  const location = useLocation();
  const { callSession, livekitToken, setCall, setLivekitToken, clearCall } = useCallStore();
  // Landing here is not on its own a request for a consultation: history keeps /consult entries
  // around (minimize, then a call that ended), and reaching one of them by a back tap used to
  // start and pay for a fresh call the patient never asked for -- which looked like the search
  // restarting itself the moment the doctor hung up. Only an explicit Consult tap carries this.
  const startRequested = (location.state as { start?: boolean } | null)?.start === true;
  const bootstrapped = useRef(false);
  const [loading, setLoading] = useState(!callSession);
  const [connectionLost, setConnectionLost] = useState(false);
  const [rejoinKey, setRejoinKey] = useState(0);

  function handleDisconnected(): void {
    setConnectionLost(true);
  }

  async function handleRejoin(): Promise<void> {
    let active: { callSession: CallSession | null; livekitToken: string | null };
    try {
      active = await fetchActiveCall();
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
      return;
    }

    if (!active.callSession || active.callSession.status !== "ACTIVE" || !active.livekitToken) {
      toast("The call has ended");
      clearCall();
      navigate("/dashboard", { replace: true });
      return;
    }

    setLivekitToken(active.livekitToken);
    setConnectionLost(false);
    setRejoinKey((key) => key + 1);
  }

  useImmersiveStatusBar();

  useEffect(() => {
    // Once per mount, never again on this instance: call:ended clears the store while this page
    // is still mounted, and re-running would read that as "no call yet" and open a new one.
    if (callSession || bootstrapped.current) {
      return;
    }
    bootstrapped.current = true;

    async function createCallWithPayment(paymentId: string, retried = false): Promise<void> {
      try {
        const response = await api.post("/calls", { paymentId, deviceId: useKioskStore.getState().deviceId });
        setCall(response.data);
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 402 && !retried) {
          // The client-side checkout succeeded but the payment webhook may not have
          // landed yet -- give it one short retry before treating this as a failure.
          await new Promise((resolve) => setTimeout(resolve, PAYMENT_RETRY_DELAY_MS));
          await createCallWithPayment(paymentId, true);
          return;
        }

        toast.error(getApiErrorMessage(error, "Failed to start call after payment"));
        navigate("/dashboard");
      }
    }

    async function payAndCreateCall(): Promise<void> {
      try {
        if (typeof window.Razorpay !== "function") {
          // checkout.js (loaded via a <script> tag in index.html) can fail to load --
          // ad blockers, offline, or a flaky CDN. window.Razorpay would otherwise throw
          // "is not a constructor" deep inside this promise with no user-facing message.
          toast.error("Payment could not be started. Check your connection and try again.");
          navigate("/dashboard");
          return;
        }

        const order = await api.post<PaymentOrder>("/payments/order");
        await new Promise<void>((resolve) => {
          const razorpay = new window.Razorpay({
            key: order.data.keyId,
            amount: order.data.amount * 100,
            currency: "INR",
            name: "MadamGy Consultation",
            order_id: order.data.razorpayOrderId,
            handler: () => {
              void createCallWithPayment(order.data.paymentId).finally(resolve);
            },
            modal: {
              ondismiss: () => {
                toast("Payment cancelled");
                navigate("/dashboard");
                resolve();
              },
            },
          });
          razorpay.open();
        });
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Payment could not be started"));
        navigate("/dashboard");
      }
    }

    async function startConsult(): Promise<void> {
      try {
        const response = await api.post("/calls", { deviceId: useKioskStore.getState().deviceId });
        setCall(response.data);
      } catch (error: unknown) {
        if (axios.isAxiosError<{ callSession?: CallSession }>(error) && error.response?.status === 409 && error.response.data.callSession) {
          setCall(error.response.data.callSession);
          return;
        }

        if (axios.isAxiosError(error) && error.response?.status === 402) {
          await payAndCreateCall();
          return;
        }

        toast.error(getApiErrorMessage(error, "Failed to start call"));
        navigate("/dashboard");
      }
    }

    async function bootstrap(): Promise<void> {
      const active = await fetchActiveCall().catch(() => ({ callSession: null, livekitToken: null }));
      if (active.callSession) {
        setCall(active.callSession);
        if (active.livekitToken) {
          setLivekitToken(active.livekitToken);
        }
        return;
      }

      if (!startRequested) {
        navigate("/dashboard", { replace: true });
        return;
      }

      // Spend the intent before starting, so this history entry can't start a second consultation
      // if the patient walks back onto it later.
      navigate(".", { replace: true, state: null });
      await startConsult();
    }

    void bootstrap().finally(() => setLoading(false));
  }, [callSession, navigate, setCall, setLivekitToken, startRequested]);

  function cancel(): void {
    if (callSession) {
      getSocket().emit("call:end", { callSessionId: callSession.id });
    }
    clearCall();
    navigate("/dashboard", { replace: true });
  }

  // The search keeps running -- callSession stays in the shared store and useCallListener is
  // mounted app-wide, so nothing here needs to pause. CallSearchWidget picks it up on any other
  // page and brings the patient back the moment a doctor accepts.
  function minimize(): void {
    navigate("/dashboard");
  }

  const waitingText = callSession?.status === "RINGING" ? "Ringing doctor..." : "Finding available doctor...";

  if (loading) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-background p-8">
        <PulseRing size="lg" />
        <p className="text-center text-xl text-foreground">{waitingText}</p>
        <div className="mt-4 flex gap-6">
          <button type="button" onClick={minimize} className="text-muted-foreground underline">
            Minimize
          </button>
          <button type="button" onClick={cancel} className="text-muted-foreground underline">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (livekitToken && callSession) {
    return (
      // dvh, not vh: on a phone the mobile browser's URL bar is excluded from vh, so the chat
      // composer sat below the fold until you scrolled.
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-background lg:flex-row">
        <div className="min-h-56 flex-[3] lg:h-full lg:flex-1">
          {connectionLost ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
              <p className="text-xl text-foreground">Connection lost</p>
              <p className="text-muted-foreground">The room is still open. Rejoin when you're ready.</p>
              <Button onClick={() => void handleRejoin()}>Rejoin call</Button>
            </div>
          ) : (
            <KioskCallView
              key={rejoinKey}
              token={livekitToken}
              serverUrl={getLivekitUrl()}
              onDisconnected={handleDisconnected}
              waitingTitle="Waiting for your doctor to join"
              startedAt={callSession.startedAt}
            />
          )}
        </div>
        <div className="min-h-0 flex-[2] p-3 lg:h-full lg:flex-none lg:w-96">
          <CallChatPanel callSessionId={callSession.id} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-background p-8">
      <PulseRing size="lg" />
      <p className="text-center text-xl text-foreground">{callSession?.status === "RINGING" ? "Waiting for doctor to accept..." : "Finding available doctor..."}</p>
      <div className="mt-4 flex gap-6">
        <button type="button" onClick={minimize} className="text-muted-foreground underline">
          Minimize
        </button>
        <button type="button" onClick={cancel} className="text-muted-foreground underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
