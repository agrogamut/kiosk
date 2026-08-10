import { type ReactNode, useState } from "react";
import { type MediaDeviceFailure } from "livekit-client";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { describeMediaDeviceFailure } from "../../lib/livekit";
import { CallLayout } from "./CallLayout";

interface DoctorCallViewProps {
  token: string;
  serverUrl: string;
  onDisconnected: () => void;
  peerName?: string;
  startedAt?: string | null;
  actions?: ReactNode;
  children?: ReactNode;
}

export function DoctorCallView({
  token,
  serverUrl,
  onDisconnected,
  peerName,
  startedAt,
  actions,
  children,
}: DoctorCallViewProps) {
  // Held as state rather than shown as a toast: a camera that never started is a condition the
  // call stays in, and a toast was gone long before anyone worked out why the other side could
  // not see or hear them.
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
        screenShare
        peerName={peerName}
        startedAt={startedAt}
        actions={actions}
        mediaNotice={mediaNotice}
        onMediaNoticeResolved={() => setMediaNotice(null)}
      >
        {children}
      </CallLayout>
    </LiveKitRoom>
  );
}
