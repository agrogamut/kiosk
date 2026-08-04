import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import morgan from "morgan";
import { Server } from "socket.io";
import { accountRouter } from "./routes/account.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { callsRouter } from "./routes/calls.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { doctorRouter } from "./routes/doctor.routes.js";
import { doctorsRouter } from "./routes/doctors.routes.js";
import { healthFilesRouter } from "./routes/health-files.routes.js";
import { paymentsRouter } from "./routes/payments.routes.js";
import { prescriptionsRouter } from "./routes/prescriptions.routes.js";
import { supportRouter } from "./routes/support.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { webhooksRouter } from "./routes/webhooks.routes.js";
import { initSocketHandlers } from "./socket/index.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { ensureBucket, minioClient } from "./services/storage.service.js";
import { handleAssignDoctorFailed, startAssignDoctorWorker } from "./workers/assign-doctor.worker.js";
import { handleRenderPdfFailed, startRenderPdfWorker } from "./workers/render-pdf.worker.js";
import { startStaleCallReaper } from "./workers/stale-call-reaper.worker.js";

// A wildcard origin combined with credentials: true is invalid per the Fetch spec -- browsers
// reject the credentialed request outright when the server echoes "*" -- so an unset WEB_URL in
// production wouldn't just be permissive, it would silently break every authenticated request
// from the real web app. Fail loudly at startup instead of letting that surface as a mystery bug.
if (process.env.NODE_ENV === "production" && !process.env.WEB_URL) {
  throw new Error("WEB_URL must be set in production (CORS origin + credentials requires an explicit value)");
}
const webUrl = process.env.WEB_URL ?? "*";

export const app = express();
export const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: { origin: webUrl, credentials: true },
});

initSocketHandlers(io);

app.use(helmet());
app.use(cors({ origin: webUrl, credentials: true }));
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use("/api/webhooks/livekit", express.raw({ type: "application/webhook+json" }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("health check timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

app.get("/api/health", async (_req, res) => {
  const checks = { db: false, redis: false, minio: false };

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3000);
    checks.db = true;
  } catch {
    checks.db = false;
  }

  try {
    const pong = await withTimeout(redis.ping(), 3000);
    checks.redis = pong === "PONG";
  } catch {
    checks.redis = false;
  }

  try {
    checks.minio = await withTimeout(
      minioClient.bucketExists(process.env.MINIO_BUCKET ?? "madamgy"),
      3000,
    );
  } catch {
    checks.minio = false;
  }

  const ok = checks.db && checks.redis && checks.minio;
  res.status(ok ? 200 : 503).json({ ok, checks });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/calls", callsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/prescriptions", prescriptionsRouter);
app.use("/api/health-files", healthFilesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/doctor", doctorRouter);
app.use("/api/doctors", doctorsRouter);
app.use("/api/account", accountRouter);
app.use("/api/support", supportRouter);
app.use("/api/webhooks", webhooksRouter);

app.use(errorMiddleware);

if (process.env.NODE_ENV !== "test") {
  if (process.env.MINIO_SKIP_BUCKET_CHECK !== "true") {
    ensureBucket().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`MinIO bucket check skipped: ${message}`);
    });
  }

  const assignWorker = startAssignDoctorWorker();
  handleAssignDoctorFailed(assignWorker);
  const renderPdfWorker = startRenderPdfWorker();
  handleRenderPdfFailed(renderPdfWorker);
  console.log("Queue workers started");

  if (process.env.STALE_CALL_REAPER_ENABLED === "true") {
    startStaleCallReaper();
    console.log("Stale call reaper started");
  }
}

const port = process.env.PORT ?? 3000;
if (process.env.NODE_ENV !== "test") {
  httpServer.listen(port, () => console.log(`Server on :${port}`));
}
