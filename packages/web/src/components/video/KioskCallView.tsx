import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";

interface KioskCallViewProps {
  token: string;
  serverUrl: string;
  onDisconnected: () => void;
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
      <VideoConference />
    </LiveKitRoom>
  );
}
