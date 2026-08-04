import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const roomService = new RoomServiceClient(
  process.env.LIVEKIT_HOST!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
);

export const livekitService = {
  async generateToken(room: string, participantId: string): Promise<string> {
    const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: participantId,
      ttl: "2h",
    });

    token.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    return token.toJwt();
  },

  // Best-effort: keeps the room open for 2 minutes after the last participant leaves, giving
  // either side time to rejoin after a network drop. If this call fails, LiveKit still
  // auto-creates the room on first join with its own (shorter) default departure timeout, so a
  // call can still connect -- this must never block call:accept.
  async createRoom(room: string): Promise<void> {
    try {
      await roomService.createRoom({ name: room, departureTimeout: 120 });
    } catch (error) {
      console.error("livekit createRoom failed, falling back to implicit room creation", room, error);
    }
  },
};
