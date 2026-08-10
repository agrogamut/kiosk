import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { AppError } from "../middleware/error.middleware.js";
import { verifyFileToken } from "../services/file-url.service.js";
import { getObjectStream } from "../services/storage.service.js";

export const filesRouter = Router();

// Deliberately unauthenticated: the signed token in the path is the authorisation, granted by
// whichever route minted the URL after its own ownership check. It has to work this way because
// <img src> and plain links send no Authorization header. See file-url.service.ts.
filesRouter.get("/:token", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let claims;
    try {
      claims = verifyFileToken(req.params.token);
    } catch {
      throw new AppError(403, "Link expired or invalid");
    }

    let object;
    try {
      object = await getObjectStream(claims.k);
    } catch {
      throw new AppError(404, "File not found");
    }

    res.setHeader("Content-Type", object.contentType);
    res.setHeader("Content-Length", object.size);
    // Uploads are arbitrary user files served from the API's own origin, so an SVG or HTML
    // attachment would otherwise run script there. nosniff stops a mislabelled file being
    // reinterpreted, and the sandbox policy stops anything in it executing.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    // helmet defaults this to same-origin, which would block the web app and the Android WebView
    // from rendering these at all -- both run on a different origin to the API. Safe to relax
    // here specifically: the signed token is what guards the object, not the requester's origin.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader(
      "Content-Disposition",
      claims.d ? `attachment; filename="${claims.d.replace(/"/g, "")}"` : "inline",
    );
    // Matches the token's own lifetime: the URL stops working before a cached copy goes stale.
    res.setHeader("Cache-Control", "private, max-age=3600");

    object.stream.on("error", (error: unknown) => {
      console.error("file stream failed", claims.k, error);
      res.destroy();
    });
    object.stream.pipe(res);
  } catch (error) {
    next(error);
  }
});
