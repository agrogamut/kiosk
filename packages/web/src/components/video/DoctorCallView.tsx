import type { ReactNode } from "react";
import toast from "react-hot-toast";
import { Track, type MediaDeviceFailure } from "livekit-client";
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { describeMediaDeviceFailure } from "../../lib/livekit";

interface DoctorCallViewProps {
  token: string;
  serverUrl: string;
  onDisconnected: () => void;
  children?: ReactNode;
}

function CallLayout() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });

  return (
    <>
      <GridLayout tracks={tracks} style={{ height: "calc(100% - 4rem)" }}>
        <ParticipantTile />
      </GridLayout>
      <RoomAudioRenderer />
      <ControlBar controls={{ chat: false, screenShare: true, settings: false }} />
    </>
  );
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
      onMediaDeviceFailure={(failure?: MediaDeviceFailure, kind?: MediaDeviceKind) =>
        toast(describeMediaDeviceFailure(failure, kind))
      }
      data-lk-theme="default"
      style={{ height: "100%" }}
      options={{ adaptiveStream: true, dynacast: true, publishDefaults: { simulcast: true } }}
    >
      <CallLayout />
      {children}
    </LiveKitRoom>
  );
}
