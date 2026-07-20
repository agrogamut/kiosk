import { useEffect } from "react";
import { StatusBar } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";

export function useImmersiveStatusBar(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    void StatusBar.hide();

    return () => {
      void StatusBar.show();
    };
  }, []);
}
