import { type ReactNode, useState } from "react";
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
  // See DoctorCallView: a failed camera is a lasting condition, not a passing event.
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      video
      audio
      onDisconnected={onDisconnected}
      onMediaDeviceFailure={(failure?: MediaDeviceFailure, kind?: MediaDeviceKind) =>
        setMediaNotice(describeMediaDeviceFailure(failure, kind))
      }
      data-lk-theme="default"
      style={{ height: "100%", position: "relative" }}
      options={{ adaptiveStream: true, dynacast: true, publishDefaults: { simulcast: true } }}
    >
      <CallLayout
        peerName={peerName}
        waitingTitle={waitingTitle}
        startedAt={startedAt}
        actions={actions}
        mediaNotice={mediaNotice}
        onMediaNoticeResolved={() => setMediaNotice(null)}
      />
    </LiveKitRoom>
  );
}
