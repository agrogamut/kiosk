import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import morgan from "morgan";
import { Server } from "socket.io";
import { adminRouter } from "./routes/admin.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { callsRouter } from "./routes/calls.routes.js";
import { doctorRouter } from "./routes/doctor.routes.js";
import { healthFilesRouter } from "./routes/health-files.routes.js";
import { prescriptionsRouter } from "./routes/prescriptions.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { initSocketHandlers } from "./socket/index.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { ensureBucket } from "./services/storage.service.js";
import { handleAssignDoctorFailed, startAssignDoctorWorker } from "./workers/assign-doctor.worker.js";
import { startRenderPdfWorker } from "./workers/render-pdf.worker.js";

const webUrl = process.env.WEB_URL ?? "*";

export const app = express();
export const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: { origin: webUrl, credentials: true },
});

initSocketHandlers(io);

app.use(helmet());
app.use(cors({ origin: webUrl, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/calls", callsRouter);
app.use("/api/prescriptions", prescriptionsRouter);
app.use("/api/health-files", healthFilesRouter);
app.use("/api/admin", adminRouter);
app.use("/api/doctor", doctorRouter);

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
  startRenderPdfWorker();
  console.log("Queue workers started");
}

const port = process.env.PORT ?? 3000;
if (process.env.NODE_ENV !== "test") {
  httpServer.listen(port, () => console.log(`Server on :${port}`));
}
