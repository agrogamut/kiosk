import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { CallSession } from "@madamgy/api-client";
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
import { logout } from "../../lib/logout";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket, getSocket } from "../../lib/socket";
import { useDoctorPresenceHeartbeat } from "../../hooks/useDoctorPresenceHeartbeat";
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
}

interface MeResponse {
  doctorProfile?: DoctorProfile | null;
}

interface WalletResponse {
  balance: string;
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
  const [profile, setProfile] = useState<DoctorProfile | null>(null);

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

    const socket = connectSocket();
    socket.on("call:incoming", (data: IncomingCall) => {
      setIncoming(data);
      toast("Incoming call");
    });
    socket.on("call:accepted", ({ callSessionId, livekitToken }: { callSessionId: string; livekitToken: string }) => {
      setLivekitToken(livekitToken);
      navigate(`/doctor/call/${callSessionId}`);
    });

    return () => {
      socket.off("call:incoming");
      socket.off("call:accepted");
    };
  }, [navigate, setLivekitToken]);

  useDoctorPresenceHeartbeat();

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
