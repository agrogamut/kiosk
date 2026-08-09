import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { WebhookReceiver } from "livekit-server-sdk";
import { prisma } from "../lib/prisma.js";
import { completeCall } from "../services/call-completion.service.js";

export const webhooksRouter = Router();

const receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);

webhooksRouter.post("/livekit", async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);

  let event;
  try {
    // LiveKit signs the payload with a JWT in the standard `Authorization` header. Reading any
    // other header name means every real webhook is rejected as unsigned -- including the
    // room_finished events this endpoint exists to handle, so calls LiveKit ends on its own stay
    // ACTIVE forever and the doctor is never credited.
    event = await receiver.receive(body, req.get("Authorization"));
  } catch (error) {
    console.error("livekit webhook signature verification failed", error);
    res.status(400).json({ message: "invalid webhook payload" });
    return;
  }

  try {
    if (event.event === "room_finished" && event.room?.name) {
      const call = await prisma.callSession.findUnique({ where: { livekitRoom: event.room.name } });
      if (call && call.status === "ACTIVE") {
        await completeCall(call.id);
      }
    }
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("livekit webhook processing failed", event.event, error);
    res.status(500).json({ message: "failed to process webhook" });
  }
});
