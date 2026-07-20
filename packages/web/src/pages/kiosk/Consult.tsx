import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import type { CallSession } from "@madamgy/api-client";
import { CallChatPanel } from "../../components/call/CallChatPanel";
import { KioskCallView } from "../../components/video/KioskCallView";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { getSocket } from "../../lib/socket";
import { useCallListener } from "../../hooks/useCall";
import { useImmersiveStatusBar } from "../../hooks/useImmersiveStatusBar";
import { useCallStore } from "../../store/call.store";

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
  const { callSession, livekitToken, setCall, clearCall } = useCallStore();
  const [loading, setLoading] = useState(!callSession);

  useCallListener();
  useImmersiveStatusBar();

  useEffect(() => {
    if (callSession) {
      return;
    }

    async function createCallWithPayment(paymentId: string, retried = false): Promise<void> {
      try {
        const response = await api.post("/calls", { paymentId });
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
        const response = await api.post("/calls");
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

    void startConsult().finally(() => setLoading(false));
  }, [callSession, navigate, setCall]);

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-center text-2xl text-gray-700">{waitingText}</p>
        <button type="button" onClick={cancel} className="mt-4 text-lg text-gray-500 underline">
          Cancel
        </button>
      </div>
    );
  }

  if (livekitToken && callSession) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50 lg:flex-row">
        <div className="h-[60vh] min-h-0 lg:h-screen lg:flex-1">
          <KioskCallView
            token={livekitToken}
            serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
            onDisconnected={cancel}
          />
        </div>
        <div className="h-[40vh] p-3 lg:h-screen lg:w-96">
          <CallChatPanel callSessionId={callSession.id} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      <p className="text-center text-2xl text-gray-700">{callSession?.status === "RINGING" ? "Waiting for doctor to accept..." : "Finding available doctor..."}</p>
      <button type="button" onClick={cancel} className="mt-4 text-lg text-gray-500 underline">
        Cancel
      </button>
    </div>
  );
}
