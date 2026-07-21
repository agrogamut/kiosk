import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import toast from "react-hot-toast";
import { CallChatPanel } from "../../components/call/CallChatPanel";
import { PatientHistoryPanel } from "../../components/call/PatientHistoryPanel";
import { DoctorCallView } from "../../components/video/DoctorCallView";
import { Button } from "../../components/ui/button";
import { PulseRing } from "../../components/brand/PulseRing";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket } from "../../lib/socket";
import { useImmersiveStatusBar } from "../../hooks/useImmersiveStatusBar";
import { useCallStore } from "../../store/call.store";

export default function DoctorCall() {
  const { id: callSessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const storedLivekitToken = useCallStore((state) => state.livekitToken);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const clearCall = useCallStore((state) => state.clearCall);
  const [submitting, setSubmitting] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"chat" | "history">("chat");

  useImmersiveStatusBar();

  const editor = useEditor({
    extensions: [StarterKit],
    content: "<p>Patient complaint:<br>Diagnosis:<br>Medications:<br>Advice:</p>",
  });

  useEffect(() => {
    const socket = connectSocket();
    socket.on(
      "call:accepted",
      ({ callSessionId: acceptedId, livekitToken, patientId: acceptedPatientId }: { callSessionId: string; livekitToken: string; patientId?: string }) => {
        if (acceptedId === callSessionId) {
          setLivekitToken(livekitToken);
          if (acceptedPatientId) {
            setPatientId(acceptedPatientId);
          }
        }
      },
    );
    socket.on("call:ended", () => {
      clearCall();
      navigate("/doctor");
    });

    return () => {
      socket.off("call:accepted");
      socket.off("call:ended");
    };
  }, [callSessionId, clearCall, navigate, setLivekitToken]);

  async function submitPrescription(): Promise<void> {
    if (!editor || !callSessionId) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/prescriptions", { callSessionId, content: editor.getJSON() });
      toast.success("Prescription submitted");
      clearCall();
      navigate("/doctor");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Submission failed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!storedLivekitToken) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
        <PulseRing size="lg" />
        <p className="text-center text-xl text-foreground">Waiting for connection...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="h-[55vh] lg:h-[70vh]">
        <DoctorCallView
          token={storedLivekitToken}
          serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
          onDisconnected={() => navigate("/doctor")}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 border-t border-input bg-background p-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex min-h-0 flex-col">
          <h3 className="font-display mb-2 text-lg font-semibold text-foreground">Prescription</h3>
          <div className="min-h-[120px] flex-1 rounded-lg border border-input bg-card p-3 text-foreground">
            <EditorContent editor={editor} />
          </div>
          <Button
            type="button"
            onClick={() => void submitPrescription()}
            disabled={submitting}
            className="mt-3 w-full text-lg"
          >
            {submitting ? "Submitting..." : "Submit prescription"}
          </Button>
        </div>
        <div className="flex min-h-0 flex-col rounded-xl bg-card shadow-sm">
          <div className="flex border-b border-input">
            <button
              type="button"
              onClick={() => setRightTab("chat")}
              className={`flex-1 rounded-tl-xl py-3 text-sm font-semibold ${
                rightTab === "chat" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setRightTab("history")}
              className={`flex-1 rounded-tr-xl py-3 text-sm font-semibold ${
                rightTab === "history" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              }`}
            >
              Patient history
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {rightTab === "chat" && callSessionId && <CallChatPanel callSessionId={callSessionId} />}
            {rightTab === "history" &&
              (patientId ? (
                <PatientHistoryPanel patientId={patientId} />
              ) : (
                <p className="p-4 text-sm text-muted-foreground">Patient not identified yet.</p>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
