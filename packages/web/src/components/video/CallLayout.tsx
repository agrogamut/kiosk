import { type ReactNode, useEffect, useState } from "react";
import { ConnectionState, Track } from "livekit-client";
import { UserRound } from "lucide-react";
import {
  ControlBar,
  LayoutContextProvider,
  RoomAudioRenderer,
  useConnectionState,
  useTracks,
} from "@livekit/components-react";
import { CameraOffTile, initials } from "./CameraOffTile";

interface CallLayoutProps {
  screenShare?: boolean;
  /** The other person's actual name. Drives the status line and the waiting-state initials. */
  peerName?: string;
  /** Waiting copy for the side that doesn't know the other person's name yet. */
  waitingTitle?: string;
  /** ISO timestamp the consultation started at, for the elapsed timer. */
  startedAt?: string | null;
  /** Rendered at the top right of the stage -- the call's single end action. */
  actions?: ReactNode;
  children?: ReactNode;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useElapsed(startedAt?: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) {
    return null;
  }
  return formatElapsed(now - new Date(startedAt).getTime());
}

export function CallLayout({
  screenShare = false,
  peerName,
  waitingTitle,
  startedAt,
  actions,
  children,
}: CallLayoutProps) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });
  const connectionState = useConnectionState();
  const reconnecting =
    connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting;
  const elapsed = useElapsed(startedAt);

  // The other person is what the doctor is here to look at, so they get the stage and the local
  // camera is demoted to a corner. A plain grid split the two evenly, which on a wide console
  // meant half the screen was the doctor looking at themselves.
  const remoteTracks = tracks.filter((track) => !track.participant.isLocal);
  const localCamera = tracks.find((track) => track.participant.isLocal && track.source === Track.Source.Camera);
  const sharedScreen = tracks.find((track) => track.source === Track.Source.ScreenShare);
  const mainTrack =
    sharedScreen ?? remoteTracks.find((track) => track.source === Track.Source.Camera) ?? remoteTracks[0];

  return (
    // ControlBar's settings menu (device picker) reads useLayoutContext internally --
    // without this provider it throws instead of rendering, taking down the whole call view.
    <LayoutContextProvider>
      {/* The one dark surface in an otherwise pale app, warm-tinted rather than neutral black so
          it belongs to the palette. Everything else here is an overlay on top of it, which is
          what keeps the stage from stealing height from the work panel beside it. */}
      <div className="relative h-full w-full overflow-hidden bg-[hsl(0_10%_8%)]">
        <div className="absolute inset-0">
          {mainTrack ? (
            <CameraOffTile trackRef={mainTrack} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {peerName ? (
                  <span className="font-display text-2xl font-semibold">{initials(peerName)}</span>
                ) : (
                  <UserRound className="size-9" aria-hidden="true" />
                )}
              </div>
              <p className="font-display text-lg font-semibold text-white">
                {waitingTitle ?? (peerName ? `Waiting for ${peerName} to join` : "Waiting for the other person to join")}
              </p>
              <p className="text-sm text-white/60">They have been notified. The room stays open.</p>
            </div>
          )}
        </div>

        {/* Self-view. Sits above the dock so the controls never cover it. */}
        {localCamera && mainTrack && (
          <div className="absolute bottom-20 left-3 z-20 w-28 overflow-hidden rounded-xl border border-white/15 shadow-lg sm:w-36 lg:bottom-24 lg:w-44">
            <div className="aspect-[4/3]">
              <CameraOffTile trackRef={localCamera} compact />
            </div>
          </div>
        )}

        {/* Overlays come after the video in DOM order as well as carrying a z-index, so nothing
            in LiveKit's own tree can paint over the end-call control. */}
        <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${reconnecting ? "bg-destructive" : "bg-tertiary"}`}
            />
            {peerName && (
              <span className="truncate font-display font-semibold text-white">{peerName}</span>
            )}
            {elapsed && (
              <>
                <span aria-hidden="true" className="text-white/35">
                  &middot;
                </span>
                <span className="tabular-nums text-sm text-white/70">{elapsed}</span>
              </>
            )}
            {reconnecting && <span className="text-sm text-white/80">Reconnecting...</span>}
          </div>
          {actions}
        </div>

        <div className="call-dock absolute inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-3">
          {/* leave: false -- LiveKit's default Leave button just calls room.disconnect(), which
              this branch's onDisconnected handler treats as a lost connection (shows "Connection
              lost / Rejoin" with no other way out, since both call routes sit outside their shell
              nav). Both doctor and patient already have their own explicit way to end a call, so
              LiveKit's own leave control would only add a dead end. */}
          <ControlBar controls={{ chat: false, screenShare, settings: true, leave: false }} />
        </div>

        <RoomAudioRenderer />
        {children}
      </div>
    </LayoutContextProvider>
  );
}
