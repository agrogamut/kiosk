import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { logout } from "../../lib/logout";
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="mb-2 text-3xl font-bold">Welcome, Dr. {user?.name}</h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-600">Availability:</span>
              <button
                type="button"
                onClick={toggleAvailable}
                className={`rounded-full px-6 py-3 font-semibold text-white transition-colors ${
                  isAvailable ? "bg-green-500 hover:bg-green-600" : "bg-gray-400 hover:bg-gray-500"
                }`}
              >
                {isAvailable ? "Available" : "Unavailable"}
              </button>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => void signOut()} className="rounded-xl bg-white px-4 py-3 font-semibold text-blue-700 shadow-sm">
              Logout
            </button>
            <Link to="/doctor/history" className="rounded-xl bg-white px-4 py-3 font-semibold text-blue-700 shadow-sm">
              History
            </Link>
            <Link to="/doctor/wallet" className="rounded-xl bg-white px-4 py-3 font-semibold text-blue-700 shadow-sm">
              Wallet
            </Link>
          </div>
        </div>

        {incoming && (
          <div className="rounded-2xl border-2 border-blue-400 bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-xl font-bold">Incoming call</h2>
            <p className="mb-4 text-gray-700">
              Patient: <strong>{incoming.patient.name}</strong>
            </p>
            <div className="flex gap-4">
              <button type="button" onClick={accept} className="flex-1 rounded-xl bg-green-500 py-4 font-semibold text-white hover:bg-green-600">
                Accept
              </button>
              <button type="button" onClick={reject} className="flex-1 rounded-xl bg-red-500 py-4 font-semibold text-white hover:bg-red-600">
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
