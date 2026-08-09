// VITE_* values are inlined at build time, so a deploy that forgot to set VITE_LIVEKIT_URL bakes
// the localhost fallback into the shipped bundle -- and the only symptom is calls that never
// connect, on a screen that otherwise looks fine. Keep the fallback (it's what every local dev
// run relies on), but make a build that actually shipped it say so in the console the first time
// a call tries to connect.
let warned = false;

const DEV_FALLBACK = "ws://localhost:7880";

export function getLivekitUrl(): string {
  const configured = import.meta.env.VITE_LIVEKIT_URL;
  if (configured) {
    return configured;
  }

  if (!warned && !import.meta.env.DEV) {
    warned = true;
    console.error(
      `VITE_LIVEKIT_URL was not set when this bundle was built, so calls are dialling ${DEV_FALLBACK} and will never connect. Set it in the Vercel project env and in the Android build workflow, then rebuild.`,
    );
  }

  return DEV_FALLBACK;
}
