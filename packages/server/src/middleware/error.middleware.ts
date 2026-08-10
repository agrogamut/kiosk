import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorMiddleware(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ message: "Invalid request", issues: error.issues });
    return;
  }

  // Multer rejects an oversized upload by calling next(err), which without this lands in the
  // catch-all below as a 500 "Internal server error" -- so a photo straight from a phone camera,
  // routinely several MB, failed with a message suggesting the server was broken rather than
  // telling the user to pick a smaller file.
  if (error instanceof MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "That file is too large. Please choose a smaller one."
        : "That file couldn't be uploaded. Please try another.";
    res.status(413).json({ message });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Internal server error" });
}
