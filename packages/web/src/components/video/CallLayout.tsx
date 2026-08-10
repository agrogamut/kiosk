import { type ReactNode, useEffect, useState } from "react";
import type { TrackSourceWithOptions } from "@livekit/components-core";
import { ConnectionState, Track } from "livekit-client";
import { MicOff, UserRound } from "lucide-react";
import {
  ControlBar,
  LayoutContextProvider,
  RoomAudioRenderer,
  isTrackReference,
  useConnectionState,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import toast from "react-hot-toast";
import { CameraOffTile, initials } from "./CameraOffTile";

// withPlaceholder is the whole point here. useTracks given plain sources returns only tracks that
// are actually published, so someone who joins with their camera off contributes nothing to the
// array -- which is indistinguishable from them not being in the room at all. A placeholder means
// every participant is represented the moment they connect, whether or not they are sending
// media. Screen share stays placeholder-free: it should appear only once something is shared.
const STAGE_SOURCES: TrackSourceWithOptions[] = [
  { source: Track.Source.Camera, withPlaceholder: true },
  { source: Track.Source.Microphone, withPlaceholder: true },
  { source: Track.Source.ScreenShare, withPlaceholder: false },
];

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
  /** Set when the camera or mic could not be started, so the failure can be shown and retried. */
  mediaNotice?: string | null;
  onMediaNoticeResolved?: () => void;
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
  mediaNotice,
  onMediaNoticeResolved,
  children,
}: CallLayoutProps) {
  const tracks = useTracks(STAGE_SOURCES, { onlySubscribed: false });
  const connectionState = useConnectionState();
  const reconnecting =
    connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting;
  const elapsed = useElapsed(startedAt);
  const room = useRoomContext();
  const [retrying, setRetrying] = useState(false);

  // Presence comes from the participant list, never from whether a track exists. Someone sitting
  // in the room with their camera off has joined; saying otherwise is what made a connected call
  // look like one that never started.
  const peerPresent = useRemoteParticipants().length > 0;

  // Filtered by source explicitly. The other person is what the doctor is here to look at, so
  // they get the stage and the local camera is demoted to a corner -- an even grid meant half of
  // a wide console was the doctor watching themselves.
  const cameras = tracks.filter((track) => track.source === Track.Source.Camera);
  const remoteCamera = cameras.find((track) => !track.participant.isLocal);
  const localCamera = cameras.find((track) => track.participant.isLocal);
  const sharedScreen = tracks.find((track) => track.source === Track.Source.ScreenShare);
  const mainTrack = sharedScreen ?? remoteCamera;

  const remoteMic = tracks.find(
    (track) => track.source === Track.Source.Microphone && !track.participant.isLocal,
  );
  // No publication at all counts as muted: the point is only whether the doctor can expect to
  // hear anything.
  const peerMicOff = peerPresent && (!remoteMic || !isTrackReference(remoteMic) || remoteMic.publication.isMuted);

  async function retryDevices(): Promise<void> {
    setRetrying(true);
    try {
      // Sequential, not Promise.all: when the devices are held by another app the second request
      // tends to fail simply because the first is still negotiating for the same hardware.
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.localParticipant.setCameraEnabled(true);
      onMediaNoticeResolved?.();
      toast.success("Camera and microphone are on");
    } catch {
      toast.error("Still can't reach the camera or microphone. Close any other app using them.");
    } finally {
      setRetrying(false);
    }
  }

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
            {peerName && <span className="truncate font-display font-semibold text-white">{peerName}</span>}
            {peerMicOff && (
              <span title="Their microphone is off" className="flex items-center text-white/70">
                <MicOff className="size-4" aria-label="Their microphone is off" />
              </span>
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

        {/* A toast was wrong for this: losing the camera is a state you stay in, not an event that
            passes, and the toast disappeared long before anyone worked out why the other side
            couldn't see them. */}
        {mediaNotice && (
          <div className="absolute inset-x-3 top-14 z-30 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive/95 px-3 py-2 text-sm text-destructive-foreground shadow-lg sm:inset-x-4">
            <span className="min-w-0">{mediaNotice}</span>
            <button
              type="button"
              onClick={() => void retryDevices()}
              disabled={retrying}
              className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/30 disabled:opacity-60"
            >
              {retrying ? "Trying..." : "Try again"}
            </button>
          </div>
        )}

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
