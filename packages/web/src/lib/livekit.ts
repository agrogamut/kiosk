import type { MediaDeviceFailure } from "livekit-client";

export function describeMediaDeviceFailure(failure: MediaDeviceFailure | undefined, kind: MediaDeviceKind | undefined): string {
  const device = kind === "videoinput" ? "Camera" : kind === "audioinput" ? "Microphone" : "Camera/microphone";

  switch (failure) {
    case "NotFound":
      return `${device} not found on this device — continuing without it.`;
    case "PermissionDenied":
      return `${device} access was denied — allow it in your browser settings to use it.`;
    case "DeviceInUse":
      return `${device} is already in use by another app or tab.`;
    default:
      return `${device} couldn't be started — continuing without it.`;
  }
}
