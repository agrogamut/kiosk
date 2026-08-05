import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { getSocket } from "../../lib/socket";
import { useCallListener } from "../../hooks/useCall";
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
  const { callSession, livekitToken, setCall, setLivekitToken, clearCall } = useCallStore();
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
      navigate("/dashboard");
      return;
    }

    setLivekitToken(active.livekitToken);
    setConnectionLost(false);
    setRejoinKey((key) => key + 1);
  }

  useCallListener();
  useImmersiveStatusBar();

  useEffect(() => {
    if (callSession) {
      return;
    }

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

      await startConsult();
    }

    void bootstrap().finally(() => setLoading(false));
  }, [callSession, navigate, setCall, setLivekitToken]);

  function cancel(): void {
    if (callSession) {
      getSocket().emit("call:end", { callSessionId: callSession.id });
    }
    clearCall();
    navigate("/dashboard");
  }

  const waitingText = callSession?.status === "RINGING" ? "Ringing doctor..." : "Finding available doctor...";

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
        <PulseRing size="lg" />
        <p className="text-center text-xl text-foreground">{waitingText}</p>
        <button type="button" onClick={cancel} className="mt-4 text-muted-foreground underline">
          Cancel
        </button>
      </div>
    );
  }

  if (livekitToken && callSession) {
    return (
      <div className="flex min-h-screen flex-col bg-background lg:flex-row">
        <div className="h-[60vh] min-h-0 lg:h-screen lg:flex-1">
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
              serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
              onDisconnected={handleDisconnected}
            />
          )}
        </div>
        <div className="h-[40vh] p-3 lg:h-screen lg:w-96">
          <CallChatPanel callSessionId={callSession.id} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
      <PulseRing size="lg" />
      <p className="text-center text-xl text-foreground">{callSession?.status === "RINGING" ? "Waiting for doctor to accept..." : "Finding available doctor..."}</p>
      <button type="button" onClick={cancel} className="mt-4 text-muted-foreground underline">
        Cancel
      </button>
    </div>
  );
}
