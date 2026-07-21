import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api";
import { logout } from "../../lib/logout";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket, getSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";
import { useCallStore } from "../../store/call.store";

interface IncomingCall {
  callSession: { id: string; livekitRoom: string };
  patient: { id: string; name: string };
}

interface MeResponse {
  doctorProfile?: { isAvailable: boolean } | null;
}

export default function DoctorDashboard() {
  const user = useAuthStore((state) => state.user);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const navigate = useNavigate();
  const [isAvailable, setIsAvailable] = useState(false);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  useEffect(() => {
    api
      .get<MeResponse>("/users/me")
      .then((response) => setIsAvailable(Boolean(response.data.doctorProfile?.isAvailable)))
      .catch(() => setIsAvailable(false));

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

  useEffect(() => {
    getSocket().emit("presence:ping");
    const interval = setInterval(() => {
      getSocket().emit("presence:ping");
    }, 20_000);

    return () => clearInterval(interval);
  }, []);

  function toggleAvailable(): void {
    const next = !isAvailable;
    setIsAvailable(next);
    getSocket().emit("doctor:toggle_available", { isAvailable: next });
  }

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

  async function signOut(): Promise<void> {
    await logout();
    navigate("/doctor/login");
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
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Welcome, Dr. {user?.name}</h1>
            <Button
              type="button"
              onClick={toggleAvailable}
              variant={isAvailable ? "default" : "secondary"}
              className="mt-3 rounded-full"
            >
              {isAvailable ? "Available" : "Unavailable"}
            </Button>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => void signOut()}>
              Logout
            </Button>
            <Button variant="outline" asChild>
              <Link to="/doctor/history">History</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/doctor/wallet">Wallet</Link>
            </Button>
          </div>
        </div>

        {incoming && (
          <div className="rounded-xl bg-card p-6 shadow-sm ring-1 ring-primary/30">
            <h2 className="mb-2 text-xl font-bold text-foreground">Incoming call</h2>
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

        <div className="mt-8 border-t border-input pt-6 text-center">
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
    </div>
  );
}
