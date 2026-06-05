import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../services/auth.service.js";
import { AppError } from "./error.middleware.js";

export function requireAuth(...roles: UserRole[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw new AppError(401, "Unauthorized");
      }

      const payload = verifyAccessToken(header.slice(7));
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.disabled) {
        throw new AppError(401, "Unauthorized");
      }
      if (roles.length > 0 && !roles.includes(user.role)) {
        throw new AppError(403, "Forbidden");
      }

      req.user = { sub: user.id, role: user.role };
      next();
    } catch (error) {
      next(error instanceof AppError ? error : new AppError(401, "Unauthorized"));
    }
  };
}
