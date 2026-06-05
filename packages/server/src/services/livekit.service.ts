import { AccessToken } from "livekit-server-sdk";

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
};
