import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchActiveCall } from "../lib/activeCall";
import { useAuthStore } from "../store/auth.store";
import { useCallStore } from "../store/call.store";

// A full page reload wipes useCallStore (it's in-memory only), so a patient/doctor who reloads
// while they have an in-progress call lands on their normal dashboard with no way back in. This
// runs once per shell mount and, if the server still has an in-progress call for this user,
// hydrates the store and routes them straight back into it.
export function useActiveCallRedirect(): void {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const setCall = useCallStore((state) => state.setCall);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);

  useEffect(() => {
    if (role !== "PATIENT" && role !== "DOCTOR") {
      return;
    }

    fetchActiveCall()
      .then(({ callSession, livekitToken }) => {
        if (!callSession) {
          return;
        }

        setCall(callSession);
        if (livekitToken) {
          setLivekitToken(livekitToken);
        }

        if (role === "DOCTOR") {
          // Only ACTIVE calls have a minted livekitToken (GET /calls/active only mints one for
          // ACTIVE status). Redirecting a doctor into /doctor/call/:id for a QUEUED/RINGING call
          // sends them to a screen with no token, which bounces them right back out -- and since
          // that route is outside DoctorShell, the bounce remounts this hook and loops forever.
          // Let a still-ringing call surface via the doctor's normal incoming-call UI instead.
          if (callSession.status === "ACTIVE") {
            navigate(`/doctor/call/${callSession.id}`);
          }
          return;
        }

        navigate("/consult");
      })
      .catch(() => {
        // No active call, or a transient error -- stay on the current page either way.
      });
    // Intentionally runs once per shell mount, not on every role/navigate identity change --
    // this is a one-shot "did I reload into an orphaned call" check, not a poller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
