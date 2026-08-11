import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { Track } from "livekit-client";
import {
  ParticipantTile,
  isTrackReference,
  useEnsureTrackRef,
  useIsMuted,
  useParticipantInfo,
} from "@livekit/components-react";

interface CameraOffTileProps {
  trackRef?: TrackReferenceOrPlaceholder;
  /** Shrinks the placeholder for the small self-view. */
  compact?: boolean;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// A participant whose camera is off renders as a plain dark rectangle, which during a
// consultation is indistinguishable from a call that has failed -- neither side can tell whether
// the other is still there. Naming who it is makes a muted camera obviously deliberate.
//
// Overlaid as a sibling rather than passed as ParticipantTile's children: children *replace* the
// tile's entire default content, so putting it there would drop the video track, the name and the
// focus toggle along with it.
export function CameraOffTile({ trackRef, compact = false }: CameraOffTileProps) {
  const resolved = useEnsureTrackRef(trackRef);
  const cameraMuted = useIsMuted(resolved);
  const { identity, name } = useParticipantInfo({ participant: resolved.participant });
  const displayName = name || identity || "Participant";

  // A participant who has joined but published nothing yields a placeholder with no publication,
  // which is not "muted" -- it still needs the same treatment or it renders as an empty tile.
  const noVideo = !isTrackReference(resolved) || cameraMuted;
  const showPlaceholder = resolved.source === Track.Source.Camera && noVideo;

  return (
    <div className={`relative h-full w-full ${compact ? "" : "call-stage-main"}`}>
      <ParticipantTile trackRef={resolved} />
      {showPlaceholder && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[hsl(0_8%_13%)] p-4 text-center">
          <div
            className={`flex items-center justify-center rounded-full bg-primary font-display font-semibold text-primary-foreground ${
              compact ? "size-9 text-sm" : "size-20 text-2xl"
            }`}
          >
            {initials(displayName)}
          </div>
          {!compact && (
            <p className="text-sm text-white/70">
              {displayName} &mdash; camera off
            </p>
          )}
        </div>
      )}
    </div>
  );
}
