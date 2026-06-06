import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "../../lib/logout";

const IDLE_MS = 5 * 60 * 1000;

export function IdleGuard() {
  const navigate = useNavigate();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function reset(): void {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        void logout().finally(() => navigate("/"));
      }, IDLE_MS);
    }

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    reset();
    events.forEach((event) => window.addEventListener(event, reset));

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [navigate]);

  return null;
}
