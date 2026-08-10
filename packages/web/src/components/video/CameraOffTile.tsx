import { Track } from "livekit-client";
import {
  ParticipantTile,
  useEnsureTrackRef,
  useIsMuted,
  useParticipantInfo,
} from "@livekit/components-react";

function initials(name: string): string {
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
export function CameraOffTile() {
  const trackRef = useEnsureTrackRef();
  const cameraMuted = useIsMuted(trackRef);
  const { identity, name } = useParticipantInfo({ participant: trackRef.participant });
  const displayName = name || identity || "Participant";
  const showPlaceholder = trackRef.source === Track.Source.Camera && cameraMuted;

  return (
    <div className="relative h-full w-full">
      <ParticipantTile />
      {showPlaceholder && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-muted">
          <div className="flex size-20 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
            {initials(displayName)}
          </div>
          <p className="px-4 text-center text-sm text-muted-foreground">{displayName} &mdash; camera off</p>
        </div>
      )}
    </div>
  );
}
