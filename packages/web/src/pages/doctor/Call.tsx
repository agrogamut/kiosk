import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { CallChatPanel } from "../../components/call/CallChatPanel";
import { PatientHistoryPanel } from "../../components/call/PatientHistoryPanel";
import { DoctorCallView } from "../../components/video/DoctorCallView";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { PulseRing } from "../../components/brand/PulseRing";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket, getSocket } from "../../lib/socket";
import { fetchActiveCall } from "../../lib/activeCall";
import { useDoctorPresenceHeartbeat } from "../../hooks/useDoctorPresenceHeartbeat";
import { useImmersiveStatusBar } from "../../hooks/useImmersiveStatusBar";
import { useCallStore } from "../../store/call.store";

interface PrescriptionFields {
  complaint: string;
  diagnosis: string;
  medications: string;
  advice: string;
}

const EMPTY_PRESCRIPTION: PrescriptionFields = { complaint: "", diagnosis: "", medications: "", advice: "" };

const PRESCRIPTION_FIELDS: { name: keyof PrescriptionFields; label: string; placeholder: string }[] = [
  { name: "complaint", label: "Patient complaint", placeholder: "What the patient reported" },
  { name: "diagnosis", label: "Diagnosis", placeholder: "Your assessment" },
  { name: "medications", label: "Medications", placeholder: "Drug, dose, frequency, duration" },
  { name: "advice", label: "Advice", placeholder: "Follow-up, precautions, next steps" },
];

export default function DoctorCall() {
  const { id: callSessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const storedLivekitToken = useCallStore((state) => state.livekitToken);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const clearCall = useCallStore((state) => state.clearCall);
  const [submitting, setSubmitting] = useState(false);
  const [patientId] = useState<string | null>(() => (location.state as { patientId?: string } | null)?.patientId ?? null);
  const [rightTab, setRightTab] = useState<"chat" | "history">("chat");
  const [prescription, setPrescription] = useState<PrescriptionFields>(EMPTY_PRESCRIPTION);
  const [connectionLost, setConnectionLost] = useState(false);
  const [rejoinKey, setRejoinKey] = useState(0);

  useImmersiveStatusBar();
  useDoctorPresenceHeartbeat();

  function updatePrescriptionField(name: keyof PrescriptionFields, value: string): void {
    setPrescription((current) => ({ ...current, [name]: value }));
  }

  async function handleRejoin(): Promise<void> {
    let active: { callSession: any | null; livekitToken: string | null };
    try {
      active = await fetchActiveCall();
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
      return;
    }

    if (!active.callSession || active.callSession.status !== "ACTIVE" || !active.livekitToken) {
      toast("The call has ended");
      clearCall();
      navigate("/doctor");
      return;
    }

    setLivekitToken(active.livekitToken);
    setConnectionLost(false);
    setRejoinKey((key) => key + 1);
  }

  function closeRoom(): void {
    if (!callSessionId) {
      return;
    }
    getSocket().emit("call:end", { callSessionId });
  }

  const canSubmitPrescription = Object.values(prescription).some((value) => value.trim().length > 0);

  useEffect(() => {
    const socket = connectSocket();
    socket.on("call:ended", () => {
      clearCall();
      navigate("/doctor");
    });

    return () => {
      socket.off("call:ended");
    };
  }, [clearCall, navigate]);

  useEffect(() => {
    if (storedLivekitToken || !callSessionId) {
      return;
    }

    fetchActiveCall()
      .then((active) => {
        if (active.callSession?.id === callSessionId && active.livekitToken) {
          setLivekitToken(active.livekitToken);
        } else {
          toast.error("This call is no longer active");
          navigate("/doctor");
        }
      })
      .catch(() => {
        toast.error("Could not reconnect to the call");
        navigate("/doctor");
      });
  }, [storedLivekitToken, callSessionId, navigate, setLivekitToken]);

  async function submitPrescription(): Promise<void> {
    if (!callSessionId || !canSubmitPrescription) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/prescriptions", { callSessionId, content: prescription });
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
      <div className="relative h-[55vh] lg:h-[70vh]">
        <div className="absolute right-3 top-3 z-20">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Close room
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close this room?</AlertDialogTitle>
                <AlertDialogDescription>
                  This ends the call for the patient immediately and can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={closeRoom}>Close room</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {connectionLost ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
            <p className="text-xl text-foreground">Connection lost</p>
            <p className="text-muted-foreground">The room is still open. Rejoin when you're ready.</p>
            <Button onClick={() => void handleRejoin()}>Rejoin call</Button>
          </div>
        ) : (
          <DoctorCallView
            key={rejoinKey}
            token={storedLivekitToken}
            serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
            onDisconnected={() => setConnectionLost(true)}
          />
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 border-t border-input bg-background p-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex min-h-0 flex-col overflow-y-auto">
          <h3 className="font-display mb-2 text-lg font-semibold text-foreground">Prescription</h3>
          <div className="flex flex-col gap-3">
            {PRESCRIPTION_FIELDS.map((field) => (
              <div key={field.name}>
                <Label htmlFor={`prescription-${field.name}`} className="mb-1.5">
                  {field.label}
                </Label>
                <Textarea
                  id={`prescription-${field.name}`}
                  value={prescription[field.name]}
                  onChange={(event) => updatePrescriptionField(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                  className="bg-card"
                />
              </div>
            ))}
          </div>
          <Button
            type="button"
            onClick={() => void submitPrescription()}
            disabled={submitting || !canSubmitPrescription}
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
