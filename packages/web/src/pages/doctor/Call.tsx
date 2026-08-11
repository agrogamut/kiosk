import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import type { HealthFile } from "@madamgy/api-client";
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
import { getLivekitUrl } from "../../lib/livekitUrl";
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

const PRESCRIPTION_FIELDS: { name: keyof PrescriptionFields; label: string; placeholder: string; rows: number }[] = [
  { name: "complaint", label: "Patient complaint", placeholder: "What the patient reported", rows: 3 },
  { name: "diagnosis", label: "Diagnosis", placeholder: "Your assessment", rows: 3 },
  { name: "medications", label: "Medications", placeholder: "Drug, dose, frequency, duration", rows: 4 },
  { name: "advice", label: "Advice", placeholder: "Follow-up, precautions, next steps", rows: 3 },
];

type RailTab = "prescription" | "chat" | "history";

const TABS: { id: RailTab; label: string }[] = [
  { id: "prescription", label: "Prescription" },
  { id: "chat", label: "Chat" },
  { id: "history", label: "History" },
];

interface CallRouteState {
  patientId?: string;
  patientName?: string;
}

export default function DoctorCall() {
  const { id: callSessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const routeState = location.state as CallRouteState | null;
  const storedLivekitToken = useCallStore((state) => state.livekitToken);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const clearCall = useCallStore((state) => state.clearCall);
  const [submitting, setSubmitting] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(routeState?.patientId ?? null);
  const [patientName, setPatientName] = useState<string | null>(routeState?.patientName ?? null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [railTab, setRailTab] = useState<RailTab>("prescription");
  const [unreadChat, setUnreadChat] = useState(0);
  const [prescription, setPrescription] = useState<PrescriptionFields>(EMPTY_PRESCRIPTION);
  const [prescriptionSubmitted, setPrescriptionSubmitted] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [rejoinKey, setRejoinKey] = useState(0);
  const hydratedFor = useRef<string | null>(null);
  const tabRefs = useRef<Record<RailTab, HTMLButtonElement | null>>({
    prescription: null,
    chat: null,
    history: null,
  });

  useImmersiveStatusBar();
  useDoctorPresenceHeartbeat();

  function updatePrescriptionField(name: keyof PrescriptionFields, value: string): void {
    setPrescription((current) => ({ ...current, [name]: value }));
  }

  function selectTab(tab: RailTab): void {
    setRailTab(tab);
    if (tab === "chat") {
      setUnreadChat(0);
    }
  }

  function onTabKeyDown(event: React.KeyboardEvent, index: number): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + offset + TABS.length) % TABS.length];
    selectTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  async function handleRejoin(): Promise<void> {
    let active: Awaited<ReturnType<typeof fetchActiveCall>>;
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

    // PatientHistoryPanel fetches records once and caches them -- without this, a file the
    // patient uploads mid-call sits invisible until something else happens to trigger a refetch.
    socket.on("health-file:uploaded", ({ healthFile }: { healthFile: HealthFile }) => {
      if (healthFile.userId !== patientId) {
        return;
      }
      toast.success("Patient uploaded a new file");
      void queryClient.invalidateQueries({ queryKey: ["patient-records", patientId] });
    });

    return () => {
      socket.off("call:ended");
      socket.off("health-file:uploaded");
    };
  }, [clearCall, navigate, patientId, queryClient]);

  // Fills in whatever the dashboard didn't hand over -- the patient's name and the start time for
  // the timer, and the token itself after a reload. Guarded by a ref rather than by the state it
  // sets, which would otherwise re-trigger this effect on each field it filled in.
  useEffect(() => {
    if (!callSessionId || hydratedFor.current === callSessionId) {
      return;
    }
    if (storedLivekitToken && patientName && startedAt) {
      return;
    }
    hydratedFor.current = callSessionId;

    let cancelled = false;
    fetchActiveCall()
      .then((active) => {
        if (cancelled) {
          return;
        }
        if (active.callSession?.id !== callSessionId) {
          if (!storedLivekitToken) {
            toast.error("This call is no longer active");
            navigate("/doctor");
          }
          return;
        }

        setPatientId((current) => current ?? active.callSession?.patient?.id ?? null);
        setPatientName((current) => current ?? active.callSession?.patient?.name ?? null);
        setStartedAt((current) => current ?? active.callSession?.startedAt ?? null);
        if (active.livekitToken && !storedLivekitToken) {
          setLivekitToken(active.livekitToken);
        }
      })
      .catch(() => {
        if (!cancelled && !storedLivekitToken) {
          toast.error("Could not reconnect to the call");
          navigate("/doctor");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [callSessionId, storedLivekitToken, patientName, startedAt, navigate, setLivekitToken]);

  async function submitPrescription(): Promise<void> {
    if (!callSessionId || !canSubmitPrescription || prescriptionSubmitted) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/prescriptions", { callSessionId, content: prescription });
      toast.success("Prescription submitted");
      // Deliberately stays on the call. Navigating away here used to unmount the call view, which
      // disconnected the doctor from the LiveKit room and left the patient alone until LiveKit's
      // departure timeout ended the consultation -- so writing the prescription silently hung up
      // on the patient. The doctor ends the call with "Close room" instead.
      setPrescriptionSubmitted(true);
    } catch (error) {
      // The server allows exactly one prescription per call and answers 409 for a second one.
      // Treat that as already done rather than an error the doctor can retry into forever.
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setPrescriptionSubmitted(true);
        toast("Prescription already submitted for this call");
      } else {
        toast.error(getApiErrorMessage(error, "Submission failed"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const closeRoomButton = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:border-destructive hover:bg-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Close room
        </button>
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
  );

  if (!storedLivekitToken) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background p-8">
        <PulseRing size="lg" />
        <p className="text-center text-xl text-foreground">Waiting for connection...</p>
      </div>
    );
  }

  return (
    // Two panes side by side rather than stacked. Stacking made the video and the work surface
    // compete for the same vertical space, and on a laptop the video won by default -- the
    // prescription form was left with a couple of hundred pixels and the chat was off-screen.
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background lg:flex-row">
      <section className="relative min-h-44 flex-[2] lg:min-h-0 lg:w-0 lg:min-w-0 lg:flex-1">
        {connectionLost ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
            <p className="text-xl text-foreground">Connection lost</p>
            <p className="text-muted-foreground">The room is still open. Rejoin when you're ready.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => void handleRejoin()}>Rejoin call</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">Close room</Button>
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
          </div>
        ) : (
          <DoctorCallView
            key={rejoinKey}
            token={storedLivekitToken}
            serverUrl={getLivekitUrl()}
            onDisconnected={() => setConnectionLost(true)}
            peerName={patientName ?? undefined}
            startedAt={startedAt}
            actions={closeRoomButton}
          />
        )}
      </section>

      <aside className="flex min-h-0 flex-[3] flex-col border-t border-input bg-card lg:w-96 lg:flex-none lg:border-l lg:border-t-0 xl:w-[28rem] 2xl:w-[34rem]">
        <div role="tablist" aria-label="Consultation panels" className="flex shrink-0 gap-1 border-b border-input px-2 pt-2">
          {TABS.map((tab, index) => {
            const selected = railTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[tab.id] = node;
                }}
                type="button"
                role="tab"
                id={`rail-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`rail-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-t-lg px-2 py-2.5 text-sm font-semibold transition-colors ${
                  selected ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {/* The doctor writing a prescription cannot see the chat, and a photo or a set of
                    vitals arriving is exactly the thing they must not miss. */}
                {tab.id === "chat" && unreadChat > 0 && (
                  <span
                    className="size-1.5 rounded-full bg-tertiary"
                    aria-label={`${unreadChat} new ${unreadChat === 1 ? "message" : "messages"}`}
                  />
                )}
                {selected && <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-0.5 rounded bg-primary" />}
              </button>
            );
          })}
        </div>

        {/* All three stay mounted: unmounting the chat would drop its socket subscription and
            refetch the history every time the doctor switched back to the form. */}
        <div
          role="tabpanel"
          id="rail-panel-prescription"
          aria-labelledby="rail-tab-prescription"
          hidden={railTab !== "prescription"}
          className={railTab === "prescription" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {prescriptionSubmitted && (
              <p className="mb-4 rounded-lg bg-tertiary/15 p-3 text-sm text-foreground">
                Prescription submitted. The patient will receive it as a PDF. You're still in the call.
              </p>
            )}
            <div className="flex flex-col gap-4">
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
                    rows={field.rows}
                    readOnly={prescriptionSubmitted}
                    className={prescriptionSubmitted ? "bg-muted" : "bg-card"}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 border-t border-input p-3">
            <Button
              type="button"
              onClick={() => void submitPrescription()}
              disabled={submitting || !canSubmitPrescription || prescriptionSubmitted}
              className="w-full"
            >
              {prescriptionSubmitted ? "Submitted" : submitting ? "Submitting..." : "Submit prescription"}
            </Button>
            {!prescriptionSubmitted && (
              <p className="mt-2 text-center text-xs text-muted-foreground">Submitting keeps you in the call.</p>
            )}
          </div>
        </div>

        <div
          role="tabpanel"
          id="rail-panel-chat"
          aria-labelledby="rail-tab-chat"
          hidden={railTab !== "chat"}
          className={railTab === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        >
          {callSessionId && (
            <CallChatPanel
              callSessionId={callSessionId}
              embedded
              onMessageFromPeer={() => setUnreadChat((count) => count + 1)}
            />
          )}
        </div>

        <div
          role="tabpanel"
          id="rail-panel-history"
          aria-labelledby="rail-tab-history"
          hidden={railTab !== "history"}
          className={railTab === "history" ? "flex min-h-0 flex-1 flex-col overflow-y-auto" : "hidden"}
        >
          {patientId ? (
            <PatientHistoryPanel patientId={patientId} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Patient not identified yet.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
