import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { KioskCallView } from "../../components/video/KioskCallView";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { getSocket } from "../../lib/socket";
import { useCallListener } from "../../hooks/useCall";
import { useCallStore } from "../../store/call.store";

export default function KioskConsult() {
  const navigate = useNavigate();
  const { callSession, livekitToken, setCall, clearCall } = useCallStore();
  const [loading, setLoading] = useState(!callSession);

  useCallListener();

  useEffect(() => {
    if (callSession) {
      return;
    }

    api
      .post("/calls")
      .then((response) => setCall(response.data))
      .catch((error: unknown) => {
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

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-center text-2xl text-gray-700">Finding available doctor...</p>
        <button type="button" onClick={cancel} className="mt-4 text-lg text-gray-500 underline">
          Cancel
        </button>
      </div>
    );
  }

  if (livekitToken) {
    return (
      <KioskCallView
        token={livekitToken}
        serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
        onDisconnected={cancel}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      <p className="text-center text-2xl text-gray-700">Connecting to doctor...</p>
      <button type="button" onClick={cancel} className="mt-4 text-lg text-gray-500 underline">
        Cancel
      </button>
    </div>
  );
}
