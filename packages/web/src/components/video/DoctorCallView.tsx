import type { ReactNode } from "react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";

interface DoctorCallViewProps {
  token: string;
  serverUrl: string;
  onDisconnected: () => void;
  children?: ReactNode;
}

export function DoctorCallView({ token, serverUrl, onDisconnected, children }: DoctorCallViewProps) {
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
      {children}
    </LiveKitRoom>
  );
}
