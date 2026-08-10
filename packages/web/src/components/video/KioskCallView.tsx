import type { ReactNode } from "react";
import toast from "react-hot-toast";
import { type MediaDeviceFailure } from "livekit-client";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { describeMediaDeviceFailure } from "../../lib/livekit";
import { CallLayout } from "./CallLayout";

interface KioskCallViewProps {
  token: string;
  serverUrl: string;
  onDisconnected: () => void;
  peerName?: string;
  waitingTitle?: string;
  startedAt?: string | null;
  actions?: ReactNode;
}

export function KioskCallView({
  token,
  serverUrl,
  onDisconnected,
  peerName,
  waitingTitle,
  startedAt,
  actions,
}: KioskCallViewProps) {
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
      style={{ height: "100%", position: "relative" }}
      options={{ adaptiveStream: true, dynacast: true, publishDefaults: { simulcast: true } }}
    >
      <CallLayout peerName={peerName} waitingTitle={waitingTitle} startedAt={startedAt} actions={actions} />
    </LiveKitRoom>
  );
}
