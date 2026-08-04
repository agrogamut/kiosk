import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { WebhookReceiver } from "livekit-server-sdk";
import { prisma } from "../lib/prisma.js";
import { completeCall } from "../services/call-completion.service.js";

export const webhooksRouter = Router();

const receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);

webhooksRouter.post("/livekit", async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  try {
    const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
    const event = await receiver.receive(body, req.get("Authorize"));

    if (event.event === "room_finished" && event.room?.name) {
      const call = await prisma.callSession.findUnique({ where: { livekitRoom: event.room.name } });
      if (call && call.status === "ACTIVE") {
        await completeCall(call.id);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("livekit webhook error", error);
    res.status(400).json({ message: "invalid webhook payload" });
  }
});
