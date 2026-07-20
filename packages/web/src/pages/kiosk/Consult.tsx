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

    api
      .post("/calls")
      .then((response) => setCall(response.data))
      .catch((error: unknown) => {
        if (axios.isAxiosError<{ callSession?: CallSession }>(error) && error.response?.status === 409 && error.response.data.callSession) {
          setCall(error.response.data.callSession);
          return;
        }

        toast.error(getApiErrorMessage(error, "Failed to start call"));
        navigate("/dashboard");
      })
      .finally(() => setLoading(false));
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
