import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { ContactMessageCreateSchema } from "@madamgy/api-client";
import { createContactMessage } from "../services/support.service.js";

export const supportRouter = Router();

// Public and unauthenticated on purpose -- reachable both from the pre-login screen (someone
// locked out of their account has no token to send) and from the patient profile page.
supportRouter.post("/contact", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = ContactMessageCreateSchema.parse(req.body);
    await createContactMessage(data);
    res.status(201).json({ message: "Message sent" });
  } catch (error) {
    next(error);
  }
});
