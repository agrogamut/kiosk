import type { ReactNode } from "react";
import { ConnectionState, Track } from "livekit-client";
import { ControlBar, GridLayout, ParticipantTile, RoomAudioRenderer, useConnectionState, useTracks } from "@livekit/components-react";

interface CallLayoutProps {
  screenShare?: boolean;
  children?: ReactNode;
}

export function CallLayout({ screenShare = false, children }: CallLayoutProps) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });
  const connectionState = useConnectionState();
  const reconnecting = connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting;

  return (
    <>
      {reconnecting && (
        <div className="absolute inset-x-0 top-0 z-10 bg-destructive py-2 text-center text-sm font-medium text-destructive-foreground">
          Reconnecting...
        </div>
      )}
      <GridLayout tracks={tracks} style={{ height: "calc(100% - 4rem)" }}>
        <ParticipantTile />
      </GridLayout>
      <RoomAudioRenderer />
      <ControlBar controls={{ chat: false, screenShare, settings: true }} />
      {children}
    </>
  );
}
