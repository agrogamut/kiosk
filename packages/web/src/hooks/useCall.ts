import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { connectSocket } from "../lib/socket";
import { useCallStore } from "../store/call.store";

export function useCallListener(): void {
  const { setLivekitToken, clearCall } = useCallStore();
  const navigate = useNavigate();

  useEffect(() => {
    const socket = connectSocket();

    socket.on("call:accepted", ({ livekitToken }: { callSessionId: string; livekitToken: string }) => {
      setLivekitToken(livekitToken);
      navigate("/consult");
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
      socket.off("call:accepted");
      socket.off("call:no_doctor_available");
      socket.off("call:ended");
    };
  }, [clearCall, navigate, setLivekitToken]);
}
