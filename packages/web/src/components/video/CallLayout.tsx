import type { ReactNode } from "react";
import { ConnectionState, Track } from "livekit-client";
import {
  ControlBar,
  GridLayout,
  LayoutContextProvider,
  RoomAudioRenderer,
  useConnectionState,
  useTracks,
} from "@livekit/components-react";
import { CameraOffTile } from "./CameraOffTile";

interface CallLayoutProps {
  screenShare?: boolean;
  children?: ReactNode;
}

export function CallLayout({ screenShare = false, children }: CallLayoutProps) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });
  const connectionState = useConnectionState();
  const reconnecting = connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting;

  return (
    // ControlBar's settings menu (device picker) reads useLayoutContext internally --
    // without this provider it throws instead of rendering, taking down the whole call view.
    <LayoutContextProvider>
      {reconnecting && (
        <div className="absolute inset-x-0 top-0 z-10 bg-destructive py-2 text-center text-sm font-medium text-destructive-foreground">
          Reconnecting...
        </div>
      )}
      {/* Column rather than the video reserving `calc(100% - 4rem)`: the control bar is only 4rem
          tall at some breakpoints, and where it is taller it used to overlap the video and crowd
          whatever sits below. Letting it take its natural height and giving the grid the rest
          keeps both correct at every size. */}
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <GridLayout tracks={tracks} style={{ height: "100%" }}>
            <CameraOffTile />
          </GridLayout>
        </div>
        <RoomAudioRenderer />
        {/* leave: false -- LiveKit's default Leave button just calls room.disconnect(), which this
            branch's onDisconnected handler treats as a lost connection (shows "Connection lost /
            Rejoin" with no other way out, since both call routes sit outside their shell nav).
            Both doctor and patient already have their own explicit way to end a call (Close room,
            prescription submit, Cancel), so LiveKit's own leave control would only add a dead end. */}
        <ControlBar controls={{ chat: false, screenShare, settings: true, leave: false }} className="shrink-0" />
      </div>
      {children}
    </LayoutContextProvider>
  );
}
