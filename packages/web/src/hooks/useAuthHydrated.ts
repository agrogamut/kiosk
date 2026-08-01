import { useEffect, useState } from "react";
import { useAuthStore } from "../store/auth.store";

// zustand's persist middleware always rehydrates from storage asynchronously (via a
// microtask), even for synchronous storage like localStorage. Reading auth state on the
// very first render (before that microtask resolves) sees `user: null` regardless of
// whether a session actually exists, which is what was bouncing logged-in users to the
// login screen on every refresh.
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) {
      return;
    }

    const unsubscribe = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    }

    return unsubscribe;
  }, [hydrated]);

  return hydrated;
}
