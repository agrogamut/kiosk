import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { CallSession } from "@madamgy/api-client";
import { fetchActiveCall } from "../lib/activeCall";
import { connectSocket } from "../lib/socket";
import { useAuthStore } from "../store/auth.store";
import { useCallStore } from "../store/call.store";

// Mounted once at the app root (not per-page) so these listeners survive navigation -- a patient
// who minimizes the search widget and browses their health locker must still hear about
// call:accepted/call:ended while they're away from /consult. Gated to PATIENT here (rather than
// only calling this hook conditionally) so the same always-mounted call satisfies the rules of
// hooks while still being a no-op for doctors and signed-out visitors.
export function useCallListener(): void {
  const setCall = useCallStore((state) => state.setCall);
  const setCallStatus = useCallStore((state) => state.setCallStatus);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const clearCall = useCallStore((state) => state.clearCall);
  const role = useAuthStore((state) => state.user?.role);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (role !== "PATIENT") {
      return;
    }

    const socket = connectSocket();
    let cancelled = false;
    let revision = 0;
    const unsubscribeCall = useCallStore.subscribe((state, previous) => {
      if (state.callSession?.id !== previous.callSession?.id) revision += 1;
    });

    // Runs on every connect, not only the first. socket.io does not replay events emitted while a
    // socket was down, so a call:accepted sent during a reload or a network drop was simply lost
    // and the patient kept waiting for a doctor who was already in the room. The server knows
    // where the call stands, so ask it whenever the socket comes (back) up.
    const resync = (): void => {
      const requestRevision = ++revision;
      const knownCallId = useCallStore.getState().callSession?.id;
      fetchActiveCall()
        .then(({ callSession, livekitToken }) => {
          // Live events, local call changes and newer requests supersede this snapshot.
          if (cancelled || requestRevision !== revision) return;
          if (callSession) {
            setCall(callSession);
            if (livekitToken) {
              setLivekitToken(livekitToken);
              if (callSession.status === "ACTIVE") navigateRef.current("/consult", { replace: true });
            }
            return;
          }

          // Only a call this page already knew about can have ended while we were away. With no
          // known call the page is still creating one, and leaving here would abandon it.
          if (knownCallId && useCallStore.getState().callSession?.id === knownCallId) {
            clearCall();
            navigateRef.current("/dashboard", { replace: true });
          }
        })
        .catch(() => {
          // Transient: the next reconnect tries again, and live events still arrive meanwhile.
        });
    };

    socket.on("connect", resync);

    socket.on("call:ringing", ({ callSession }: { callSession: CallSession }) => {
      revision += 1;
      setCall(callSession);
    });

    socket.on("call:accepted", ({ livekitToken }: { callSessionId: string; livekitToken: string }) => {
      revision += 1;
      setCallStatus("ACTIVE");
      setLivekitToken(livekitToken);
      navigateRef.current("/consult");
    });

    socket.on("call:rejected", () => {
      revision += 1;
      setCallStatus("QUEUED");
      toast("Doctor unavailable. Finding another doctor...");
    });

    // replace, not push: a finished call must not stay in history. /consult starts a consultation
    // on arrival, so a back tap onto the entry left behind by an ended call silently opened a
    // brand-new search the patient never asked for.
    socket.on("call:no_doctor_available", () => {
      revision += 1;
      clearCall();
      toast.error("No doctors available. Please try again later.");
      navigateRef.current("/dashboard", { replace: true });
    });

    socket.on("call:ended", () => {
      revision += 1;
      clearCall();
      navigateRef.current("/dashboard", { replace: true });
    });

    return () => {
      cancelled = true;
      unsubscribeCall();
      socket.off("connect", resync);
      socket.off("call:ringing");
      socket.off("call:accepted");
      socket.off("call:rejected");
      socket.off("call:no_doctor_available");
      socket.off("call:ended");
    };
  }, [role, clearCall, setCall, setCallStatus, setLivekitToken]);
}
