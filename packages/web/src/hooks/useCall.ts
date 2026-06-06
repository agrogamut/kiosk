import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { CallSession } from "@madamgy/api-client";
import { connectSocket } from "../lib/socket";
import { useCallStore } from "../store/call.store";

export function useCallListener(): void {
  const { setCall, setCallStatus, setLivekitToken, clearCall } = useCallStore();
  const navigate = useNavigate();

  useEffect(() => {
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

    socket.on("call:no_doctor_available", () => {
      clearCall();
      toast.error("No doctors available. Please try again later.");
      navigate("/dashboard");
    });

    socket.on("call:ended", () => {
      clearCall();
      navigate("/dashboard");
    });

    return () => {
      socket.off("call:ringing");
      socket.off("call:accepted");
      socket.off("call:rejected");
      socket.off("call:no_doctor_available");
      socket.off("call:ended");
    };
  }, [clearCall, navigate, setCall, setCallStatus, setLivekitToken]);
}
