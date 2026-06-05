import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";

const IDLE_MS = 5 * 60 * 1000;

export function IdleGuard() {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function reset(): void {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        logout();
        navigate("/");
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
  }, [logout, navigate]);

  return null;
}
