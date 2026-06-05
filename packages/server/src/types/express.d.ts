import type { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        role: UserRole;
      };
    }
  }
}

export {};
