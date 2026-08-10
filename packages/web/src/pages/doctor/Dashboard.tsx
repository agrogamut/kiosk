import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { CallSession } from "@madamgy/api-client";
import { DoctorAvatar } from "../../components/patient/DoctorAvatar";
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
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api";
import { fetchActiveCall } from "../../lib/activeCall";
import { logout } from "../../lib/logout";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket, getSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";
import { useCallStore } from "../../store/call.store";

interface IncomingCall {
  callSession: { id: string; livekitRoom: string };
  patient: { id: string; name: string };
}

interface DoctorProfile {
  isApproved: boolean;
  degree: string;
  regNumber: string;
  specialization: string | null;
  photoUrl: string | null;
}

interface MeResponse {
  doctorProfile?: DoctorProfile | null;
}

interface WalletResponse {
  balance: string;
}

interface AvailabilityResponse {
  isOnDuty: boolean;
  isInCall: boolean;
  reachable: boolean;
}

interface HistoryResponse {
  calls: (CallSession & { patient: { name: string } })[];
  total: number;
}

export default function DoctorDashboard() {
  const user = useAuthStore((state) => state.user);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  // Read inside the socket handler, which is registered once and would otherwise close over the
  // value of `incoming` from first render.
  const incomingRef = useRef<IncomingCall | null>(null);
  incomingRef.current = incoming;
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: availability, refetch: refetchAvailability } = useQuery({
    queryKey: ["doctor-availability"],
    queryFn: () => api.get<AvailabilityResponse>("/doctor/availability").then((response) => response.data),
  });
  const [togglingDuty, setTogglingDuty] = useState(false);

  const { data: wallet } = useQuery({
    queryKey: ["wallet", "/doctor"],
    queryFn: () => api.get<WalletResponse>("/doctor/wallet").then((response) => response.data),
  });
  const { data: history } = useQuery({
    queryKey: ["call-history"],
    queryFn: () => api.get<HistoryResponse>("/calls/history").then((response) => response.data),
  });
  const recentCalls = history?.calls.slice(0, 5) ?? [];

  useEffect(() => {
    api
      .get<MeResponse>("/users/me")
      .then((response) => setProfile(response.data.doctorProfile ?? null))
      .catch(() => setProfile(null));

    // `incoming` only ever came from the socket event, so a doctor who reloaded (or opened the
    // dashboard in a new tab) during a ring lost the call with no way back, while the patient
    // kept ringing. Rebuild it from the server instead.
    fetchActiveCall()
      .then((active) => {
        const call = active.callSession;
        if (call?.status === "RINGING" && call.patient) {
          setIncoming({
            callSession: { id: call.id, livekitRoom: call.livekitRoom },
            patient: call.patient,
          });
        } else if (call?.status === "ACTIVE" && active.livekitToken) {
          setLivekitToken(active.livekitToken);
          navigate(`/doctor/call/${call.id}`, { state: { patientId: call.patient?.id } });
        }
      })
      .catch(() => {
        // Non-fatal: the socket still delivers any call that starts ringing from now on.
      });

    const socket = connectSocket();
    socket.on("call:incoming", (data: IncomingCall) => {
      setIncoming(data);
      toast("Incoming call");
    });
    socket.on(
      "call:accepted",
      ({ callSessionId, livekitToken, patientId }: { callSessionId: string; livekitToken: string; patientId?: string }) => {
        setLivekitToken(livekitToken);
        // The name comes from the incoming-call card so the call screen can name the patient
        // straight away instead of waiting on a round trip.
        navigate(`/doctor/call/${callSessionId}`, {
          state: { patientId, patientName: incomingRef.current?.patient.name },
        });
      },
    );
    // Fires when the patient hangs up mid-ring and when an unanswered ring is requeued to another
    // doctor. Without this the card sat there forever advertising a call that no longer exists,
    // and Accept silently did nothing because the server refuses a call that isn't RINGING.
    socket.on("call:ended", ({ callSessionId }: { callSessionId: string }) => {
      setIncoming((current) => (current && current.callSession.id !== callSessionId ? current : null));
      // The doctor becomes reachable again the moment the call closes, so the badge above has to
      // stop saying "On a call".
      void refetchAvailability();
    });

    return () => {
      socket.off("call:incoming");
      socket.off("call:accepted");
      socket.off("call:ended");
    };
  }, [navigate, setLivekitToken, refetchAvailability]);

  // The heartbeat is mounted by DoctorShell, which wraps this page, so it keeps running across
  // every doctor page rather than only this one.

  function accept(): void {
    if (!incoming) {
      return;
    }

    getSocket().emit("call:accept", { callSessionId: incoming.callSession.id });
    setIncoming(null);
  }

  function reject(): void {
    if (!incoming) {
      return;
    }

    getSocket().emit("call:reject", { callSessionId: incoming.callSession.id });
    setIncoming(null);
  }

  async function toggleDuty(): Promise<void> {
    if (!availability) {
      return;
    }

    setTogglingDuty(true);
    try {
      await api.put("/doctor/availability", { isOnDuty: !availability.isOnDuty });
      await refetchAvailability();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't change your availability. Try again."));
    } finally {
      setTogglingDuty(false);
    }
  }

  async function uploadPhoto(file: File): Promise<void> {
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const response = await api.post<{ photoUrl: string }>("/doctor/photo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfile((current) => (current ? { ...current, photoUrl: response.data.photoUrl } : current));
      toast.success("Photo updated");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't upload your photo. Try again."));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function deleteAccount(): Promise<void> {
    try {
      await api.delete("/account/me");
      await logout();
      navigate("/doctor/login");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't delete your account. Try again."));
    }
  }

  return (
    <div className="mx-auto max-w-2xl lg:max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-foreground">Welcome, Dr. {user?.name}</h1>
      </div>

      {availability && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${
                  availability.reachable ? "bg-primary" : availability.isInCall ? "bg-amber-500" : "bg-muted-foreground"
                }`}
              />
              <p className="font-semibold text-foreground">
                {availability.reachable ? "Available for calls" : availability.isInCall ? "On a call" : "Off duty"}
              </p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {availability.reachable
                ? "Patients can reach you right now."
                : availability.isInCall
                  ? "You'll be reachable again when this call ends."
                  : "Patients can't reach you until you go on duty."}
            </p>
          </div>
          <Button
            type="button"
            variant={availability.isOnDuty ? "outline" : "default"}
            disabled={togglingDuty}
            onClick={() => void toggleDuty()}
          >
            {availability.isOnDuty ? "Go off duty" : "Go on duty"}
          </Button>
        </div>
      )}

      {incoming && (
        <div className="mb-8 rounded-xl bg-card p-6 shadow-sm ring-1 ring-primary/30">
          <h2 className="font-display mb-2 text-xl font-bold text-foreground">Incoming call</h2>
          <p className="mb-4 text-foreground">
            Patient: <strong>{incoming.patient.name}</strong>
          </p>
          <div className="flex gap-4">
            <Button onClick={accept} className="flex-1 rounded-full text-lg">
              Accept
            </Button>
            <Button variant="destructive" onClick={reject} className="flex-1 rounded-full text-lg">
              Reject
            </Button>
          </div>
        </div>
      )}

      {profile && !profile.isApproved && (
        <div className="mb-8 rounded-xl bg-card p-6 shadow-sm ring-1 ring-destructive/30">
          <p className="font-semibold text-destructive">Approval pending</p>
          <p className="mt-1 text-sm text-muted-foreground">
            An admin needs to verify your credentials before patients can call you.
          </p>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Link to="/doctor/wallet" className="rounded-xl bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
          <p className="mb-2 text-muted-foreground">Wallet balance</p>
          <p className="text-3xl font-bold text-primary">Rs. {wallet?.balance ?? "-"}</p>
        </Link>
        <Link to="/doctor/history" className="rounded-xl bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
          <p className="mb-2 text-muted-foreground">Total consultations</p>
          <p className="text-3xl font-bold text-primary">{history?.total ?? "-"}</p>
        </Link>
      </div>

      {profile && (
        <div className="mb-8 rounded-xl bg-card p-6 shadow-sm">
          <h2 className="font-display mb-4 text-lg font-semibold text-foreground">Your profile</h2>
          <div className="mb-6 flex items-center gap-4">
            <DoctorAvatar id={user?.id ?? ""} name={user?.name ?? ""} photoUrl={profile.photoUrl} className="size-16" />
            <div>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
              >
                {uploadingPhoto ? "Uploading..." : "Change photo"}
              </button>
              <p className="text-xs text-muted-foreground">Shown to patients on the booking screen</p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void uploadPhoto(file);
                }}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Degree</p>
              <p className="font-medium text-foreground">{profile.degree}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Registration number</p>
              <p className="font-medium text-foreground">{profile.regNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Specialization</p>
              <p className="font-medium text-foreground">{profile.specialization ?? "Not set"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Verification</p>
              <Badge variant={profile.isApproved ? "default" : "destructive"}>
                {profile.isApproved ? "Approved" : "Pending"}
              </Badge>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 rounded-xl bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">Recent consultations</h2>
          <Link to="/doctor/history" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {recentCalls.length === 0 && <p className="text-sm text-muted-foreground">No consultations yet.</p>}
        <div className="flex flex-col gap-2">
          {recentCalls.map((call) => (
            <div key={call.id} className="flex items-center justify-between gap-4 rounded-lg border border-input p-3">
              <div>
                <p className="font-medium text-foreground">{call.patient?.name}</p>
                <p className="text-sm text-muted-foreground">{format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}</p>
              </div>
              <Badge variant={call.status === "ENDED" ? "default" : "secondary"}>{call.status}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-input pt-6 text-center">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button type="button" className="text-sm text-destructive underline">
              Delete my account
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your account. Any wallet balance must be withdrawn first. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void deleteAccount()} className="bg-destructive hover:bg-destructive/90">
                Yes, delete my account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
