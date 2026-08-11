import type { MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { PulseRing } from "../brand/PulseRing";
import { getSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";
import { useCallStore } from "../../store/call.store";

// Renders wherever a patient has navigated away from /consult while still searching for a
// doctor -- lets them keep browsing (health locker, profile) without losing the search. Tapping
// it returns to /consult; the X cancels the search outright. Hidden once livekitToken lands
// (call:accepted already navigates back to /consult itself, see useCallListener) and while
// already on /consult, so it never doubles up with the page's own waiting UI.
export function CallSearchWidget() {
  const role = useAuthStore((state) => state.user?.role);
  const { callSession, livekitToken, clearCall } = useCallStore();
  const location = useLocation();
  const navigate = useNavigate();

  const searching =
    role === "PATIENT" &&
    callSession &&
    !livekitToken &&
    (callSession.status === "QUEUED" || callSession.status === "RINGING");

  if (!searching || location.pathname === "/consult") {
    return null;
  }

  function cancel(event: MouseEvent): void {
    event.stopPropagation();
    getSocket().emit("call:end", { callSessionId: callSession!.id });
    clearCall();
  }

  return (
    <button
      type="button"
      onClick={() => navigate("/consult")}
      className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border/50 bg-card/95 py-2.5 pl-3 pr-2.5 shadow-lg backdrop-blur-lg"
    >
      <PulseRing size="sm" />
      <span className="text-sm font-medium text-foreground">
        {callSession!.status === "RINGING" ? "Ringing doctor..." : "Finding a doctor..."}
      </span>
      <span
        role="button"
        aria-label="Cancel search"
        onClick={cancel}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </span>
    </button>
  );
}
