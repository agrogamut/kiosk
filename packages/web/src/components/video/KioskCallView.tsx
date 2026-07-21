import { Track } from "livekit-client";
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";

interface KioskCallViewProps {
  token: string;
  serverUrl: string;
  onDisconnected: () => void;
}

function CallLayout() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });

  return (
    <>
      <GridLayout tracks={tracks} style={{ height: "calc(100% - 4rem)" }}>
        <ParticipantTile />
      </GridLayout>
      <RoomAudioRenderer />
      <ControlBar controls={{ chat: false, screenShare: false, settings: false }} />
    </>
  );
}

export function KioskCallView({ token, serverUrl, onDisconnected }: KioskCallViewProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      video
      audio
      onDisconnected={onDisconnected}
      style={{ height: "100%" }}
    >
      <CallLayout />
    </LiveKitRoom>
  );
}
