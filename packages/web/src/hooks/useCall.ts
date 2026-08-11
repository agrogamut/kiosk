import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { CallSession } from "@madamgy/api-client";
import { connectSocket } from "../lib/socket";
import { useAuthStore } from "../store/auth.store";
import { useCallStore } from "../store/call.store";

// Mounted once at the app root (not per-page) so these listeners survive navigation -- a patient
// who minimizes the search widget and browses their health locker must still hear about
// call:accepted/call:ended while they're away from /consult. Gated to PATIENT here (rather than
// only calling this hook conditionally) so the same always-mounted call satisfies the rules of
// hooks while still being a no-op for doctors and signed-out visitors.
export function useCallListener(): void {
  const { setCall, setCallStatus, setLivekitToken, clearCall } = useCallStore();
  const role = useAuthStore((state) => state.user?.role);
  const navigate = useNavigate();

  useEffect(() => {
    if (role !== "PATIENT") {
      return;
    }

    const socket = connectSocket();

    socket.on("call:ringing", ({ callSession }: { callSession: CallSession }) => {
      setCall(callSession);
    });

    socket.on("call:accepted", ({ livekitToken }: { callSessionId: string; livekitToken: string }) => {
      setCallStatus("ACTIVE");
      setLivekitToken(livekitToken);
      navigate("/consult");
    });

    socket.on("call:rejected", () => {
      setCallStatus("QUEUED");
      toast("Doctor unavailable. Finding another doctor...");
    });

    // replace, not push: a finished call must not stay in history. /consult starts a consultation
    // on arrival, so a back tap onto the entry left behind by an ended call silently opened a
    // brand-new search the patient never asked for.
    socket.on("call:no_doctor_available", () => {
      clearCall();
      toast.error("No doctors available. Please try again later.");
      navigate("/dashboard", { replace: true });
    });

    socket.on("call:ended", () => {
      clearCall();
      navigate("/dashboard", { replace: true });
    });

    return () => {
      socket.off("call:ringing");
      socket.off("call:accepted");
      socket.off("call:rejected");
      socket.off("call:no_doctor_available");
      socket.off("call:ended");
    };
  }, [role, clearCall, navigate, setCall, setCallStatus, setLivekitToken]);
}
