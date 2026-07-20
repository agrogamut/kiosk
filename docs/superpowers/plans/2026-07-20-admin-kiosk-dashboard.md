# Admin Kiosk Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the kiosk-runner `ADMIN` role a working web dashboard — it currently has full backend support (wallet, kiosk device registration, stats, calls, audit log) but zero frontend; logging in as an `ADMIN` today lands on a `SUPER_ADMIN`-only page and immediately bounces to `/`.

**Architecture:** One shared `/admin/*` route namespace for both `SUPER_ADMIN` and `ADMIN`, gated by a `RequireRole` component generalized to accept an array of roles. `Dashboard.tsx` branches its nav grid by `user.role`. New pages (`Devices`, `Patients`, `AuditLog`) and a shared `WalletPanel` component follow the exact structural conventions of the existing admin/doctor pages (TanStack Query reads, `useMutation` + `invalidateQueries` writes, Zod-resolved `react-hook-form`, `getApiErrorMessage` + `react-hot-toast` for errors). Two small backend additions are required first: a list endpoint for an admin's own kiosk devices (doesn't exist today — only register/deactivate do), and an actor-scoping fix on the audit log endpoint (currently returns every actor's actions to any `ADMIN` caller, not just their own).

**Tech Stack:** Express 4 + Prisma 5 (server), React 18 + Vite + TanStack Query 5 + react-hook-form + Zod + Tailwind (web), Vitest + Supertest (server tests only — this repo has no frontend test suite; frontend tasks are verified by manual walkthrough against the running dev server, not automated tests).

## Global Constraints

- Use fish shell for all commands.
- Before any `npm test` / prisma command in `packages/server`, load env vars: `set -a; source ../../.env; set +a`.
- After every edit to `packages/api-client/src/**`, rebuild it (`cd packages/api-client && npm run build`) before typechecking or running `server`/`web` — they import the compiled `dist/`, not the source.
- No `any`, no unused locals/params (TypeScript strict, matches existing tsconfig).
- Async code uses `async/await`, never `.then()` chains (except the existing `.then((response) => response.data)` pattern already used throughout `web`'s query functions — that one is idiomatic here, keep it).
- Follow existing file conventions exactly: page components are default exports in `packages/web/src/pages/admin/PascalCase.tsx`; shared components live in `packages/web/src/components/<feature>/PascalCase.tsx`; Tailwind utility classes match neighboring pages (`rounded-2xl border border-gray-100 bg-white p-6 shadow-sm` for cards, `rounded-xl ... px-5 py-3 font-semibold text-white` for buttons).
- Commit after each task with a plain, factual message — no attribution footers, no mention of any tool or assistant.
- Docker stack (`postgres`, `redis`, `minio`) must be up before running server tests: `docker compose ps`, start with `docker compose up -d postgres redis minio` if not.

---

### Task 1: Backend — list an admin's own kiosk devices

**Files:**
- Modify: `packages/api-client/src/schemas/user.schema.ts` (add `KioskSchema`)
- Modify: `packages/server/src/services/kiosk.service.ts` (add `listKioskDevicesForAdmin`)
- Modify: `packages/server/src/routes/admin.routes.ts` (add `GET /kiosk-devices`)
- Test: `packages/server/src/__tests__/api-routes.test.ts`

**Interfaces:**
- Consumes: `prisma.kiosk` (existing model: `id, deviceId, adminId, label, active, createdAt`).
- Produces: `listKioskDevicesForAdmin(adminId: string): Promise<Kiosk[]>` — used by Task 4's frontend page. `GET /admin/kiosk-devices` (`requireAuth("ADMIN")`) returning `Kiosk[]` as JSON, ordered by `createdAt desc`.

- [ ] **Step 1: Add the `KioskSchema` to api-client**

In `packages/api-client/src/schemas/user.schema.ts`, immediately after the existing `KioskRegisterSchema`/`KioskRegister` export block, add:

```typescript
export const KioskSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  adminId: z.string(),
  label: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type Kiosk = z.infer<typeof KioskSchema>;
```

- [ ] **Step 2: Rebuild api-client**

Run: `cd packages/api-client && npm run build`
Expected: exits 0, no output (tsc is silent on success).

- [ ] **Step 3: Write the failing test**

Add to `packages/server/src/__tests__/api-routes.test.ts`, inside the existing `describe("Admin API", ...)` block (find it — it already contains other kiosk-admin-role tests using the `8888700xxx` phone prefix convention; add this test after the existing tests in that block, before the closing `});` of the describe):

```typescript
  it("lets an ADMIN list only their own kiosk devices", async () => {
    const passwordHash = await bcrypt.hash("pw12345", 10);
    const ownAdmin = await prisma.user.create({
      data: { phone: "8888700009", name: "Devices Admin Own", role: "ADMIN", passwordHash },
    });
    const otherAdmin = await prisma.user.create({
      data: { phone: "8888700010", name: "Devices Admin Other", role: "ADMIN", passwordHash },
    });
    const ownToken = signAccessToken({ sub: ownAdmin.id, role: "ADMIN" });

    await prisma.kiosk.create({ data: { deviceId: "device-list-test-own", adminId: ownAdmin.id, active: true } });
    await prisma.kiosk.create({ data: { deviceId: "device-list-test-other", adminId: otherAdmin.id, active: true } });

    const response = await request(app).get("/api/admin/kiosk-devices").set("Authorization", `Bearer ${ownToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].deviceId).toBe("device-list-test-own");

    await prisma.kiosk.deleteMany({ where: { deviceId: { in: ["device-list-test-own", "device-list-test-other"] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownAdmin.id, otherAdmin.id] } } });
  });
```

- [ ] **Step 4: Run test to verify it fails**

Run (from `packages/server/`): `set -a; source ../../.env; set +a; npm test -- api-routes.test.ts`
Expected: FAIL — `GET /api/admin/kiosk-devices` returns 404 (route doesn't exist yet).

- [ ] **Step 5: Implement `listKioskDevicesForAdmin`**

In `packages/server/src/services/kiosk.service.ts`, add (anywhere after the imports, e.g. right after `registerKioskDevice`):

```typescript
export async function listKioskDevicesForAdmin(adminId: string) {
  return prisma.kiosk.findMany({ where: { adminId }, orderBy: { createdAt: "desc" } });
}
```

- [ ] **Step 6: Add the route**

In `packages/server/src/routes/admin.routes.ts`, change the kiosk.service import to include the new function:

```typescript
import {
  deactivateKioskDevice,
  forceDeactivateKioskDevice,
  listKioskDevicesForAdmin,
  registerKioskDevice,
} from "../services/kiosk.service.js";
```

Then add the route immediately before the existing `adminRouter.post("/kiosk-devices", ...)` route:

```typescript
adminRouter.get("/kiosk-devices", requireAuth("ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kiosks = await listKioskDevicesForAdmin(req.user!.sub);
    res.json(kiosks);
  } catch (error) {
    next(error);
  }
});

```

- [ ] **Step 7: Run test to verify it passes**

Run: `set -a; source ../../.env; set +a; npm test -- api-routes.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the full server suite twice**

Run: `set -a; source ../../.env; set +a; npm test` (twice)
Expected: all files pass both times, no regressions vs. the pre-task count.

- [ ] **Step 9: Commit**

```bash
git add packages/api-client/src/schemas/user.schema.ts packages/server/src/services/kiosk.service.ts packages/server/src/routes/admin.routes.ts packages/server/src/__tests__/api-routes.test.ts
git commit -m "feat: let an ADMIN list their own registered kiosk devices"
```

---

### Task 2: Backend — scope the audit log to the caller's own actions for ADMIN

**Files:**
- Modify: `packages/api-client/src/schemas/user.schema.ts` (add `AuditLogSchema`)
- Modify: `packages/server/src/routes/admin.routes.ts` (`GET /audit-log`)
- Test: `packages/server/src/__tests__/api-routes.test.ts`

**Interfaces:**
- Consumes: `prisma.auditLog` (existing model: `id, actorId, action, targetId, metadata, createdAt`, `actor: {id, name, role}`).
- Produces: `GET /admin/audit-log?page=N` — `SUPER_ADMIN` unchanged (all actors); `ADMIN` now sees only rows where `actorId === req.user.sub`. Response shape unchanged: `{ logs, total, page, pages }`. `AuditLogSchema`/`AuditLog` type used by Task 7's frontend page.

- [ ] **Step 1: Add the `AuditLogSchema` to api-client**

In `packages/api-client/src/schemas/user.schema.ts`, after the `KioskSchema` block added in Task 1, add:

```typescript
export const AuditLogSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: z.string(),
  targetId: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
  actor: z.object({
    id: z.string(),
    name: z.string(),
    role: UserRoleSchema,
  }),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;
```

- [ ] **Step 2: Rebuild api-client**

Run: `cd packages/api-client && npm run build`
Expected: exits 0.

- [ ] **Step 3: Write the failing test**

Add to `packages/server/src/__tests__/api-routes.test.ts`, in the same `describe("Admin API", ...)` block, after the test added in Task 1:

```typescript
  it("scopes the audit log to the caller's own actions for an ADMIN, but not for SUPER_ADMIN", async () => {
    const passwordHash = await bcrypt.hash("pw12345", 10);
    const scopedAdmin = await prisma.user.create({
      data: { phone: "8888700011", name: "Audit Scoped Admin", role: "ADMIN", passwordHash },
    });
    const scopedToken = signAccessToken({ sub: scopedAdmin.id, role: "ADMIN" });

    await prisma.auditLog.create({ data: { actorId: scopedAdmin.id, action: "test.own-action" } });
    await prisma.auditLog.create({ data: { actorId: adminId, action: "test.other-action" } });

    const asAdmin = await request(app).get("/api/admin/audit-log").set("Authorization", `Bearer ${scopedToken}`);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.logs.every((log: { actorId: string }) => log.actorId === scopedAdmin.id)).toBe(true);
    expect(asAdmin.body.logs.some((log: { action: string }) => log.action === "test.own-action")).toBe(true);

    const asSuperAdmin = await request(app).get("/api/admin/audit-log").set("Authorization", `Bearer ${adminToken}`);
    expect(asSuperAdmin.status).toBe(200);
    expect(asSuperAdmin.body.logs.some((log: { action: string }) => log.action === "test.own-action")).toBe(true);
    expect(asSuperAdmin.body.logs.some((log: { action: string }) => log.action === "test.other-action")).toBe(true);

    await prisma.auditLog.deleteMany({ where: { action: { in: ["test.own-action", "test.other-action"] } } });
    await prisma.user.deleteMany({ where: { id: scopedAdmin.id } });
  });
```

Note: `adminId`/`adminToken` here are the file's existing top-level `SUPER_ADMIN` test fixtures (set up in this file's `beforeAll` — confirm the variable names match by reading the top of the file; they do as of this plan's writing).

- [ ] **Step 4: Run test to verify it fails**

Run: `set -a; source ../../.env; set +a; npm test -- api-routes.test.ts`
Expected: FAIL — the `asAdmin` assertion fails because the endpoint currently returns every actor's logs to an `ADMIN` caller, not just their own.

- [ ] **Step 5: Implement the scoping**

In `packages/server/src/routes/admin.routes.ts`, find the existing route:

```typescript
adminRouter.get("/audit-log", requireAuth("SUPER_ADMIN", "ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page ?? "1"), 1);
    const limit = 50;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: { id: true, name: true, role: true } } },
      }),
      prisma.auditLog.count(),
    ]);
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});
```

Replace with:

```typescript
adminRouter.get("/audit-log", requireAuth("SUPER_ADMIN", "ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page ?? "1"), 1);
    const limit = 50;
    const where = req.user!.role === "ADMIN" ? { actorId: req.user!.sub } : {};
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { actor: { select: { id: true, name: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `set -a; source ../../.env; set +a; npm test -- api-routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full server suite twice**

Run: `set -a; source ../../.env; set +a; npm test` (twice)
Expected: all files pass both times.

- [ ] **Step 8: Commit**

```bash
git add packages/api-client/src/schemas/user.schema.ts packages/server/src/routes/admin.routes.ts packages/server/src/__tests__/api-routes.test.ts
git commit -m "fix: scope admin audit log to the caller's own actions for the ADMIN role"
```

---

### Task 3: Frontend — multi-role routing and role-aware dashboard

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/pages/admin/Login.tsx`
- Modify: `packages/web/src/pages/admin/Dashboard.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (existing, `user.role: UserRole`).
- Produces: `RequireRole` now accepts `role: UserRole | UserRole[]`, used by every route added in Tasks 4-7.

- [ ] **Step 1: Generalize `RequireRole`**

In `packages/web/src/App.tsx`, replace:

```typescript
function RequireRole({ role, loginPath, children }: { role: UserRole; loginPath?: string; children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  if (!user) {
    return <Navigate to={loginPath ?? "/"} replace />;
  }
  if (user.role !== role) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```

with:

```typescript
function RequireRole({ role, loginPath, children }: { role: UserRole | UserRole[]; loginPath?: string; children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const allowedRoles = Array.isArray(role) ? role : [role];
  if (!user) {
    return <Navigate to={loginPath ?? "/"} replace />;
  }
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Widen the `/admin` and shared routes to accept both roles**

In `packages/web/src/App.tsx`, change the `/admin` route:

```typescript
<Route path="/admin" element={<RequireRole role="SUPER_ADMIN" loginPath="/admin/login"><AdminDashboard /></RequireRole>} />
```

to:

```typescript
<Route path="/admin" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/admin/login"><AdminDashboard /></RequireRole>} />
```

Leave `/admin/doctors`, `/admin/users`, `/admin/users/:id`, `/admin/withdrawals` as `role="SUPER_ADMIN"` — unchanged, these stay `SUPER_ADMIN`-only. Change `/admin/stats` and `/admin/calls` the same way as `/admin`:

```typescript
<Route path="/admin/stats" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/admin/login"><AdminStats /></RequireRole>} />
<Route path="/admin/calls" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/admin/login"><AdminCalls /></RequireRole>} />
```

(The routes for `/admin/devices`, `/admin/wallet`, `/admin/patients`, `/admin/audit-log` are added in Tasks 4-7, not this task — this task only touches routing infrastructure and existing routes.)

- [ ] **Step 3: Fix `AdminLogin`'s hardcoded role type**

In `packages/web/src/pages/admin/Login.tsx`, replace:

```typescript
import { AdminLoginSchema, type AdminLogin } from "@madamgy/api-client";
```

with:

```typescript
import { AdminLoginSchema, type AdminLogin, type UserRole } from "@madamgy/api-client";
```

and replace:

```typescript
interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; role: "SUPER_ADMIN" };
}
```

with:

```typescript
interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; role: UserRole };
}
```

The rest of the file (still `navigate("/admin")` on success) is unchanged — `Dashboard.tsx` now decides what to render based on the logged-in role, per Step 4.

- [ ] **Step 4: Make `Dashboard.tsx` role-aware**

Replace the full contents of `packages/web/src/pages/admin/Dashboard.tsx`:

```typescript
import { Link, useNavigate } from "react-router-dom";
import { logout } from "../../lib/logout";
import { useAuthStore } from "../../store/auth.store";

const SUPER_ADMIN_LINKS = [
  { label: "Stats", href: "/admin/stats" },
  { label: "Doctors", href: "/admin/doctors" },
  { label: "Users", href: "/admin/users" },
  { label: "Call History", href: "/admin/calls" },
  { label: "Withdrawals", href: "/admin/withdrawals" },
  { label: "Audit Log", href: "/admin/audit-log" },
];

const KIOSK_ADMIN_LINKS = [
  { label: "Stats", href: "/admin/stats" },
  { label: "Call History", href: "/admin/calls" },
  { label: "Patients", href: "/admin/patients" },
  { label: "My Devices", href: "/admin/devices" },
  { label: "Wallet", href: "/admin/wallet" },
  { label: "Audit Log", href: "/admin/audit-log" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const links = role === "ADMIN" ? KIOSK_ADMIN_LINKS : SUPER_ADMIN_LINKS;

  async function signOut(): Promise<void> {
    await logout();
    navigate("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <button type="button" onClick={() => void signOut()} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">
          Logout
        </button>
      </div>
      <div className="grid max-w-lg grid-cols-1 gap-6 sm:grid-cols-2">
        {links.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-xl font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-300"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

Note: `SUPER_ADMIN_LINKS` now includes "Audit Log" too (Task 7 builds that page, shared by both roles) — it didn't exist as a link anywhere before this plan.

- [ ] **Step 5: Typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: FAILS at this point — `AdminStats`/`AdminCalls`/`AdminDashboard` reference `/admin/devices`, `/admin/wallet`, `/admin/patients`, `/admin/audit-log` routes/pages that don't exist until Tasks 4-7. This is expected and fine; `Link to=` targets aren't typechecked by `tsc`, so the actual failure (if any) would only be from unused imports or type mismatches in the files touched this task. Confirm the failure (if any) is unrelated to missing route targets before proceeding — routes not yet existing is not a typecheck error in React Router.

Run again to confirm: `npm run typecheck`
Expected: PASS (no route existence checking happens at the type level; this step is a sanity check, not expected to fail).

- [ ] **Step 6: Manual verification**

Start the dev stack per the repo's existing dev workflow (check `scripts/dev-server.fish` or `README`/`package.json` root scripts) and in a browser:
1. Log in at `/admin/login` with a `SUPER_ADMIN` account — confirm the dashboard still shows the original 5 links plus the new "Audit Log" link (which 404s/blanks until Task 7 — expected at this point).
2. Log in with an `ADMIN` (kiosk) account (create one via `POST /api/admin/staff` as `SUPER_ADMIN`, or directly via Prisma Studio / a `prisma.user.create` if easier) — confirm you land on `/admin` (not bounced to `/`), and see the `KIOSK_ADMIN_LINKS` set (Stats, Call History, Patients, My Devices, Wallet, Audit Log). The four new links will 404/blank until Tasks 4-7 — expected at this point.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/pages/admin/Login.tsx packages/web/src/pages/admin/Dashboard.tsx
git commit -m "feat: let the kiosk ADMIN role log in and land on a role-appropriate dashboard"
```

---

### Task 4: Frontend — kiosk device registration page

**Files:**
- Create: `packages/web/src/pages/admin/Devices.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /admin/kiosk-devices` (Task 1), `POST /admin/kiosk-devices` (existing, `KioskRegisterSchema`), `DELETE /admin/kiosk-devices/:deviceId` (existing).
- Produces: page mounted at `/admin/devices`, `ADMIN`-only.

- [ ] **Step 1: Create the page**

Create `packages/web/src/pages/admin/Devices.tsx`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { KioskRegisterSchema, type Kiosk, type KioskRegister } from "@madamgy/api-client";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function AdminDevices() {
  const queryClient = useQueryClient();
  const { data: devices } = useQuery({
    queryKey: ["admin-kiosk-devices"],
    queryFn: () => api.get<Kiosk[]>("/admin/kiosk-devices").then((response) => response.data),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<KioskRegister>({ resolver: zodResolver(KioskRegisterSchema) });

  const registerDevice = useMutation({
    mutationFn: (data: KioskRegister) => api.post("/admin/kiosk-devices", data),
    onSuccess: () => {
      toast.success("Device registered");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["admin-kiosk-devices"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to register device")),
  });

  const deactivateDevice = useMutation({
    mutationFn: (deviceId: string) => api.delete(`/admin/kiosk-devices/${deviceId}`),
    onSuccess: () => {
      toast.success("Device deactivated");
      void queryClient.invalidateQueries({ queryKey: ["admin-kiosk-devices"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to deactivate device")),
  });

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-3xl font-bold">My Devices</h1>

      <form
        onSubmit={handleSubmit((data) => registerDevice.mutate(data))}
        className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-bold">Register a Device</h2>
        <div className="mb-4">
          <label className="mb-1 block text-sm text-gray-600">Device ID</label>
          <input {...register("deviceId")} className="w-full rounded-xl border-2 p-3" />
          {errors.deviceId && <p className="mt-1 text-sm text-red-500">{errors.deviceId.message}</p>}
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-sm text-gray-600">Label (optional)</label>
          <input {...register("label")} className="w-full rounded-xl border-2 p-3" />
          {errors.label && <p className="mt-1 text-sm text-red-500">{errors.label.message}</p>}
        </div>
        <button
          type="submit"
          disabled={registerDevice.isPending}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {registerDevice.isPending ? "Registering..." : "Register Device"}
        </button>
      </form>

      <h2 className="mb-4 text-xl font-bold">Registered Devices</h2>
      <div className="flex flex-col gap-3">
        {devices?.map((device) => (
          <div key={device.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div>
              <p className="font-bold">{device.label || device.deviceId}</p>
              <p className="text-sm text-gray-500">{device.deviceId}</p>
              <p className="text-xs text-gray-400">Registered {format(new Date(device.createdAt), "dd MMM yyyy")}</p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${device.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
              >
                {device.active ? "Active" : "Inactive"}
              </span>
              {device.active && (
                <button
                  type="button"
                  onClick={() => deactivateDevice.mutate(device.deviceId)}
                  className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white"
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>
        ))}
        {devices?.length === 0 && <p className="text-gray-500">No devices registered yet.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `packages/web/src/App.tsx`, add the import:

```typescript
import AdminDevices from "./pages/admin/Devices";
```

(Add alphabetically among the other `admin/*` imports.) Add the route, near the other `/admin/*` routes:

```typescript
<Route path="/admin/devices" element={<RequireRole role="ADMIN" loginPath="/admin/login"><AdminDevices /></RequireRole>} />
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Log in as the `ADMIN` test account from Task 3. Navigate to "My Devices". Register a device with a device ID and label, confirm it appears in the list as Active. Click Deactivate, confirm it flips to Inactive and the button disappears. Try registering the same `deviceId` again as a *different* logged-in admin (if you have a second test account) — confirm you get the existing 409 "Device already registered to another admin" surfaced as a toast, not a crash.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/admin/Devices.tsx packages/web/src/App.tsx
git commit -m "feat: add kiosk ADMIN device registration page"
```

---

### Task 5: Frontend — shared wallet panel + admin wallet page

**Files:**
- Create: `packages/web/src/components/wallet/WalletPanel.tsx`
- Modify: `packages/web/src/pages/doctor/Wallet.tsx` (reduce to a thin wrapper)
- Create: `packages/web/src/pages/admin/Wallet.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET :basePath/wallet`, `GET :basePath/wallet/transactions`, `POST :basePath/wallet/withdraw` — both `/doctor/wallet*` (existing) and `/admin/wallet*` (existing, from the roles-wallet-revenue plan) already implement this exact shape.
- Produces: `WalletPanel({ apiBasePath }: { apiBasePath: string })`, mounted by both `doctor/Wallet.tsx` (`apiBasePath="/doctor"`) and `admin/Wallet.tsx` (`apiBasePath="/admin"`).

- [ ] **Step 1: Create the shared component**

Create `packages/web/src/components/wallet/WalletPanel.tsx` (this is the existing `packages/web/src/pages/doctor/Wallet.tsx` body, parameterized by `apiBasePath` instead of hardcoding `/doctor`):

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { WithdrawRequestSchema, type WalletTransaction, type WithdrawRequest } from "@madamgy/api-client";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface WalletResponse {
  balance: string;
}

interface TransactionResponse {
  transactions: WalletTransaction[];
  total: number;
}

interface WalletPanelProps {
  apiBasePath: string;
}

export default function WalletPanel({ apiBasePath }: WalletPanelProps) {
  const queryClient = useQueryClient();
  const { data: wallet } = useQuery({
    queryKey: ["wallet", apiBasePath],
    queryFn: () => api.get<WalletResponse>(`${apiBasePath}/wallet`).then((response) => response.data),
  });
  const { data: transactions } = useQuery({
    queryKey: ["wallet-transactions", apiBasePath],
    queryFn: () => api.get<TransactionResponse>(`${apiBasePath}/wallet/transactions`).then((response) => response.data),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WithdrawRequest>({ resolver: zodResolver(WithdrawRequestSchema) });
  const withdraw = useMutation({
    mutationFn: (data: WithdrawRequest) => api.post(`${apiBasePath}/wallet/withdraw`, data),
    onSuccess: () => {
      toast.success("Withdrawal request submitted");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["wallet-transactions", apiBasePath] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed")),
  });

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-3xl font-bold">Wallet</h1>
      <div className="mb-8 rounded-2xl bg-blue-50 p-6">
        <p className="mb-1 text-gray-500">Available balance</p>
        <p className="text-5xl font-bold text-blue-700">Rs. {wallet?.balance ?? "-"}</p>
      </div>

      <form onSubmit={handleSubmit((data) => withdraw.mutate(data))} className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">Request Withdrawal</h2>
        {[
          { name: "amount" as const, label: "Amount (Rs.)", type: "number" },
          { name: "bankName" as const, label: "Bank Name" },
          { name: "accountNumber" as const, label: "Account Number" },
          { name: "ifsc" as const, label: "IFSC Code" },
          { name: "holderName" as const, label: "Account Holder Name" },
        ].map((field) => (
          <div key={field.name} className="mb-4">
            <label className="mb-1 block text-sm text-gray-600">{field.label}</label>
            <input
              {...register(field.name, { valueAsNumber: field.type === "number" })}
              type={field.type ?? "text"}
              className="w-full rounded-xl border-2 p-3"
            />
            {errors[field.name] && <p className="mt-1 text-sm text-red-500">{errors[field.name]?.message}</p>}
          </div>
        ))}
        <button type="submit" disabled={withdraw.isPending} className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50">
          {withdraw.isPending ? "Submitting..." : "Request Withdrawal"}
        </button>
      </form>

      <h2 className="mb-4 text-xl font-bold">Transactions</h2>
      <div className="flex flex-col gap-2">
        {transactions?.transactions.map((transaction) => (
          <div key={transaction.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div>
              <p className="font-medium">{transaction.description || transaction.type}</p>
              <p className="text-sm text-gray-500">{format(new Date(transaction.createdAt), "dd MMM yyyy HH:mm")}</p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${transaction.type === "CREDIT" ? "text-green-600" : "text-red-600"}`}>
                {transaction.type === "CREDIT" ? "+" : "-"}Rs. {transaction.amount}
              </p>
              <p className="text-xs text-gray-400">{transaction.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Note the query keys now include `apiBasePath` — this matters because both `DoctorWallet` and `AdminWallet` could theoretically be mounted in the same session (they won't be, since a user only ever has one role, but keying by `apiBasePath` keeps the cache correct regardless and costs nothing).

- [ ] **Step 2: Reduce `doctor/Wallet.tsx` to a thin wrapper**

Replace the full contents of `packages/web/src/pages/doctor/Wallet.tsx`:

```typescript
import WalletPanel from "../../components/wallet/WalletPanel";

export default function DoctorWallet() {
  return <WalletPanel apiBasePath="/doctor" />;
}
```

- [ ] **Step 3: Create `admin/Wallet.tsx`**

Create `packages/web/src/pages/admin/Wallet.tsx`:

```typescript
import WalletPanel from "../../components/wallet/WalletPanel";

export default function AdminWallet() {
  return <WalletPanel apiBasePath="/admin" />;
}
```

- [ ] **Step 4: Wire the route**

In `packages/web/src/App.tsx`, add the import (alphabetically among `admin/*` imports):

```typescript
import AdminWallet from "./pages/admin/Wallet";
```

Add the route:

```typescript
<Route path="/admin/wallet" element={<RequireRole role="ADMIN" loginPath="/admin/login"><AdminWallet /></RequireRole>} />
```

- [ ] **Step 5: Typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

First, confirm the refactor didn't break the doctor wallet page: log in as a `DOCTOR`, navigate to `/doctor/wallet`, confirm balance and transaction history render exactly as before. Then log in as the `ADMIN` test account, navigate to "Wallet" from the dashboard, confirm balance/transactions load from `/admin/wallet*` and a withdrawal request submits successfully (reuses the exact backend flow verified in the roles-wallet-revenue plan's Task 9).

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/wallet/WalletPanel.tsx packages/web/src/pages/doctor/Wallet.tsx packages/web/src/pages/admin/Wallet.tsx packages/web/src/App.tsx
git commit -m "refactor: share a WalletPanel component between doctor and admin wallet pages"
```

---

### Task 6: Frontend — patients list page (ADMIN-scoped)

**Files:**
- Create: `packages/web/src/pages/admin/Patients.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /admin/users` (existing, `SUPER_ADMIN, ADMIN`), `PUT /admin/users/:id/disable` (existing, server-side already restricts `ADMIN` callers to `PATIENT` targets only).
- Produces: page mounted at `/admin/patients`, `ADMIN`-only.

- [ ] **Step 1: Create the page**

Create `packages/web/src/pages/admin/Patients.tsx`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { api } from "../../lib/api";

interface AdminUser {
  id: string;
  name: string;
  phone: string;
  role: string;
  disabled: boolean;
  createdAt: string;
}

export default function AdminPatients() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/admin/users").then((response) => response.data),
  });
  const patients = users?.filter((user) => user.role === "PATIENT");
  const toggle = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => api.put(`/admin/users/${id}/disable`, { disabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Updated");
    },
    onError: () => toast.error("Update failed"),
  });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-8 text-3xl font-bold">Patients</h1>
      <div className="flex flex-col gap-3">
        {patients?.map((patient) => (
          <div key={patient.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div>
              <p className="font-bold">{patient.name}</p>
              <p className="text-sm text-gray-500">
                {patient.phone} - {format(new Date(patient.createdAt), "dd MMM yyyy")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggle.mutate({ id: patient.id, disabled: !patient.disabled })}
              className={`rounded-xl px-4 py-2 font-semibold text-white ${patient.disabled ? "bg-green-600" : "bg-red-600"}`}
            >
              {patient.disabled ? "Enable" : "Disable"}
            </button>
          </div>
        ))}
        {patients?.length === 0 && <p className="text-gray-500">No patients yet.</p>}
      </div>
    </div>
  );
}
```

This intentionally has no `Link` to a detail page (`/admin/users/:id` is `SUPER_ADMIN`-only) — unlike `Users.tsx`, which SUPER_ADMIN still uses unchanged.

- [ ] **Step 2: Wire the route**

In `packages/web/src/App.tsx`, add the import (alphabetically among `admin/*` imports):

```typescript
import AdminPatients from "./pages/admin/Patients";
```

Add the route:

```typescript
<Route path="/admin/patients" element={<RequireRole role="ADMIN" loginPath="/admin/login"><AdminPatients /></RequireRole>} />
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Log in as the `ADMIN` test account, navigate to "Patients". Confirm only `PATIENT`-role users appear (register a test doctor and confirm they're absent from this list even though they'd show on `SUPER_ADMIN`'s `/admin/users`). Toggle disable/enable on a patient, confirm it round-trips.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/admin/Patients.tsx packages/web/src/App.tsx
git commit -m "feat: add ADMIN-scoped patients list page"
```

---

### Task 7: Frontend — audit log page (shared by both roles)

**Files:**
- Create: `packages/web/src/pages/admin/AuditLog.tsx`
- Modify: `packages/web/src/App.tsx`

**Interfaces:**
- Consumes: `GET /admin/audit-log?page=N` (Task 2's scoped version), `AuditLogSchema`/`AuditLog` type (Task 2).
- Produces: page mounted at `/admin/audit-log`, shared by `SUPER_ADMIN` and `ADMIN`.

- [ ] **Step 1: Create the page**

Create `packages/web/src/pages/admin/AuditLog.tsx`:

```typescript
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { AuditLog } from "@madamgy/api-client";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/auth.store";

interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  pages: number;
}

export default function AdminAuditLog() {
  const [page, setPage] = useState(1);
  const role = useAuthStore((state) => state.user?.role);
  const { data } = useQuery({
    queryKey: ["admin-audit-log", page],
    queryFn: () => api.get<AuditLogResponse>("/admin/audit-log", { params: { page } }).then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-3xl font-bold">Audit Log</h1>
      {role === "ADMIN" && <p className="mb-8 text-sm text-gray-500">Showing your own actions only.</p>}
      {role !== "ADMIN" && <div className="mb-8" />}
      <div className="flex flex-col gap-2">
        {data?.logs.map((log) => (
          <div key={log.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {log.action}
                {role !== "ADMIN" && <span className="ml-2 text-sm text-gray-500">by {log.actor.name} ({log.actor.role})</span>}
              </p>
              <p className="text-sm text-gray-400">{format(new Date(log.createdAt), "dd MMM yyyy HH:mm")}</p>
            </div>
            {log.targetId && <p className="mt-1 text-sm text-gray-500">Target: {log.targetId}</p>}
          </div>
        ))}
        {data?.logs.length === 0 && <p className="text-gray-500">No audit log entries.</p>}
      </div>
      {data && data.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
            className="rounded-xl bg-gray-200 px-4 py-2 font-semibold disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {data.page} of {data.pages}
          </span>
          <button
            type="button"
            disabled={page >= data.pages}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-xl bg-gray-200 px-4 py-2 font-semibold disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `packages/web/src/App.tsx`, add the import (alphabetically among `admin/*` imports):

```typescript
import AdminAuditLog from "./pages/admin/AuditLog";
```

Add the route, shared by both roles:

```typescript
<Route path="/admin/audit-log" element={<RequireRole role={["SUPER_ADMIN", "ADMIN"]} loginPath="/admin/login"><AdminAuditLog /></RequireRole>} />
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Log in as `SUPER_ADMIN`, navigate to "Audit Log" — confirm entries from multiple actors appear (e.g. a doctor-approval action and a kiosk-device action from different admins), each showing "by `<name>` (`<role>`)". Log in as the `ADMIN` test account, navigate to "Audit Log" — perform an action first (e.g. register a device) if the log is empty, confirm only your own actions appear and the actor byline is hidden (redundant when it's always you). Confirm pagination controls appear/work if you have more than 50 entries, or are absent otherwise.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/admin/AuditLog.tsx packages/web/src/App.tsx
git commit -m "feat: add audit log page, shared by SUPER_ADMIN and kiosk ADMIN"
```

---

### Task 8: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full backend suite, twice**

Run (from `packages/server/`): `set -a; source ../../.env; set +a; npm test` — run twice, confirm identical pass counts both times, zero failures.

- [ ] **Step 2: Backend typecheck**

Run: `npx tsc --noEmit` (from `packages/server/`)
Expected: clean, no output.

- [ ] **Step 3: Web typecheck**

Run: `cd packages/web && npm run typecheck`
Expected: clean, no output.

- [ ] **Step 4: Full manual walkthrough as both roles**

As `SUPER_ADMIN`: log in, visit every link on the dashboard (Stats, Doctors, Users, Call History, Withdrawals, Audit Log) — confirm nothing that was working before this plan has regressed.

As the `ADMIN` (kiosk) test account: log in, visit every link on the dashboard (Stats, Call History, Patients, My Devices, Wallet, Audit Log) — confirm every page loads, every mutation (register/deactivate device, disable/enable patient, request withdrawal) round-trips correctly, and no `SUPER_ADMIN`-only page (`/admin/doctors`, `/admin/users`, `/admin/users/:id`, `/admin/withdrawals`) is reachable — attempting to navigate there directly by URL should bounce to `/`.

- [ ] **Step 5: Clean up test fixtures**

Delete any manually-created test `ADMIN`/`DOCTOR`/`PATIENT` accounts and kiosk devices created during manual verification in Steps 4 of Tasks 3, 4, 5, 6, 7 and this task, so the dev database is left clean.
