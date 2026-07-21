# Responsive UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining layout, loading/error-state, and validation-copy gaps found by the post-visual-design audit of the madamGy monorepo — no color/typography changes, this is responsiveness, loading/error UX, and validation-message copy only.

**Architecture:** Two independent tracks that land in the same branch. Track A (Tasks 2-3) fixes raw Zod validation-library text into human copy at the schema layer (`packages/api-client`) and strips a redundant path prefix in the web error formatter — pure text/copy changes, no new UI. Track B (Tasks 1, 4-12) adds two small shared components (an error-state block and a skeleton-row placeholder) and then wires them into every `useQuery`-backed list/detail page that currently has no failure feedback, widens fixed-width containers so admin/doctor/kiosk pages use available space on tablet/laptop/desktop viewports, converts the six admin list pages to a responsive card-below/table-above pattern, and fixes two touch targets that fall under the established 44px floor.

**Tech Stack:** React 18.3.1 + Vite (ESM), Tailwind CSS v3.4.19 (default breakpoint scale, no custom `screens`), shadcn/ui primitives already vendored in `packages/web/src/components/ui/`, `react-hook-form` + `zod` (`^3.23.0`) for forms, `@tanstack/react-query` for data fetching, Zustand for `auth.store`/`call.store`, `@madamgy/api-client` as the shared Zod-schema package (built to `dist/`, consumed by both `packages/web` and `packages/server`).

## Global Constraints

- Color tokens are finalized — use only: `background`, `foreground`, `card`, `card-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `destructive`, `input`, `ring`, `popover`, `popover-foreground`. No raw hex/named-color Tailwind classes (`blue-*`, `gray-*`, `red-*`, `green-*`, `amber-*`, `slate-*`) anywhere in this plan's diffs. This plan does not touch colors or typography beyond what's already token-based in the current code — every task is layout/state/copy only.
- `Button`/`Input`/`Select` default size is `h-11` (44px, WCAG/HIG touch-target minimum). Every primary interactive control uses the default size; any hand-rolled `<button>` that isn't the `Button` component must independently reach a 44px tall hit target (`h-11` plus `flex items-center` or equivalent), never `py-2`/`py-1.5` alone.
- No new `lucide-react` imports in hand-written page/feature code. This plan introduces zero new icons.
- `PulseRing` (`packages/web/src/components/brand/PulseRing.tsx`, `<PulseRing size="lg" />`) is reserved for full-screen "waiting" moments only (a route that has literally nothing else to render yet) — never a button-level or inline spinner, and never used for a `useQuery` loading state where other content (headings, forms) is already on screen; those use the new `SkeletonRows` component from Task 1 instead.
- **New rule — Tailwind breakpoints:** `packages/web/tailwind.config.ts` has no custom `screens` override, so only the default scale exists: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px). Every responsive class in this plan uses only `sm:`/`md:`/`lg:`/`xl:` prefixes — no custom breakpoints, no arbitrary-value media queries (`min-[900px]:`).
- **New rule — admin list pattern:** every admin list page (Task 4, Task 5) renders two sibling blocks: `<div className="space-y-3 md:hidden">` containing the original card-row markup unchanged, and `<div className="hidden md:block">` containing a `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` (from `packages/web/src/components/ui/table.tsx`) rendering the same data, columns, and row actions as the card version. Never render both at once; never drop a column/action moving from card to table.
- **New rule — `useQuery` failure states:** every page/component in this plan that reads data via `useQuery` must destructure `isLoading`, `isError`, `error`, and `refetch`, and render, in order: `<SkeletonRows />` while `isLoading`; `<ErrorState message={getApiErrorMessage(error, "<page-specific fallback>")} onRetry={() => void refetch()} />` while `isError`; otherwise the existing data/true-empty-state markup. `SkeletonRows` and `ErrorState` are defined in Task 1 (`packages/web/src/components/common/`) — no page may hand-roll its own loading or error block from this point forward.
- Verification for every task: `npm run typecheck --workspace @madamgy/web` must pass with zero errors. `packages/api-client`'s `package.json` `main`/`types` fields point at `dist/`, not `src/` — any task that edits `packages/api-client/src/**` must run `npm run build --workspace @madamgy/api-client` (which regenerates `dist/`) before `packages/web`'s typecheck/dev/build will see the change, and must also run `npm run typecheck --workspace @madamgy/api-client`. Any task that edits `packages/server/src/**` must additionally run `npm run typecheck --workspace @madamgy/server`. No test framework exists in `packages/web` — do not invent one.
- Never add an AI-attribution trailer (e.g. `Co-Authored-By`) to any commit message, and never reference AI/model authorship in commit messages or code comments.
- Do not touch backend contracts, socket event names/payloads, route paths, Zustand store shapes, or any prop signature beyond what a task explicitly describes — every task here is additive UI/copy, not a refactor.
- Use the fish shell for every command in this plan's steps.

---

### Task 1: Shared error-state and skeleton-row components

**Files:**
- Create: `packages/web/src/components/common/ErrorState.tsx`
- Create: `packages/web/src/components/common/SkeletonRows.tsx`

**Interfaces:**
- Consumes: `Alert`, `AlertTitle`, `AlertDescription` from `../ui/alert` (variant prop `"default" | "destructive"`, already vendored); `Button` from `../ui/button` (default variant/size); `Skeleton` from `../ui/skeleton` (already vendored, currently imported nowhere in the app).
- Produces: named export `ErrorState` with props `{ message: string; onRetry: () => void }` — renders a `variant="destructive"` `Alert` with the message and a default-variant `Button` reading "Try again" that calls `onRetry`. Named export `SkeletonRows` with no props — renders exactly 3 placeholder rows shaped `rounded-lg bg-card p-5 shadow-sm` (the app's established list-row convention) each containing two `Skeleton` bars. Every later task in this plan imports both from `packages/web/src/components/common/{ErrorState,SkeletonRows}` (or `../common/{ErrorState,SkeletonRows}` from one level under `components/`).

- [ ] **Step 1: Create `ErrorState.tsx`**

```tsx
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <Alert variant="destructive" className="p-5">
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <Button type="button" onClick={onRetry} className="mt-3 w-fit">
        Try again
      </Button>
    </Alert>
  );
}
```

- [ ] **Step 2: Create `SkeletonRows.tsx`**

```tsx
import { Skeleton } from "../ui/skeleton";

const ROW_COUNT = 3;

export function SkeletonRows() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: ROW_COUNT }).map((_, index) => (
        <div key={index} className="rounded-lg bg-card p-5 shadow-sm">
          <Skeleton className="mb-2 h-4 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 4: Commit**

```fish
git add packages/web/src/components/common/ErrorState.tsx packages/web/src/components/common/SkeletonRows.tsx
git commit -m "feat: add shared error-state and skeleton-row components"
```

---

### Task 2: Validation error messages in api-client schemas

**Files:**
- Modify: `packages/api-client/src/schemas/user.schema.ts`
- Modify: `packages/api-client/src/schemas/account.schema.ts`
- Modify: `packages/api-client/src/schemas/wallet.schema.ts`
- Modify: `packages/api-client/src/schemas/call.schema.ts`
- Modify: `packages/api-client/src/schemas/chat.schema.ts`

**Interfaces:**
- No exported type shapes change (every `z.infer<typeof X>` stays identical) — only `.min()`/`.max()`/`.length()`/`.regex()`/`.positive()` calls gain a string message argument, which Zod v3 accepts as shorthand for `{ message }`.
- `StaffCreateSchema` (`user.schema.ts`) and `RevenueConfigUpdateSchema` (`wallet.schema.ts`) are confirmed (via `grep -rn` across `packages/web/src` and `packages/server/src`) to have **no client-side form** — both are only `.parse()`'d server-side in `packages/server/src/routes/admin.routes.ts`. They still get clean messages because the server's error middleware forwards `issue.message` verbatim (see Task 3's note on `error.middleware.ts`) to any future or server-rendered consumer, and there is no cost to keeping the whole schema layer consistent.
- Task 4 onward does not consume anything new from these files — this task only changes message strings inside schemas already imported by existing pages (`PatientRegisterSchema`, `DoctorRegisterSchema`, `KioskRegisterSchema`, `WithdrawRequestSchema`, etc.), so no downstream task needs updating for this change to take effect.

- [ ] **Step 1: Replace `user.schema.ts`**

Replace the entire contents of `packages/api-client/src/schemas/user.schema.ts` with:

```ts
import { z } from "zod";

const dateOfBirthPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const minDateOfBirthYear = 1900;

function isValidDateOfBirth(value: string): boolean {
  const match = dateOfBirthPattern.exec(value);
  if (!match) {
    return false;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  return (
    year >= minDateOfBirthYear &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date <= todayUtc
  );
}

export const UserRoleSchema = z.enum(["PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const GenderSchema = z.enum(["MALE", "FEMALE", "OTHER"]);
export type Gender = z.infer<typeof GenderSchema>;

export const DateOfBirthSchema = z.string().refine(isValidDateOfBirth, {
  message: "Date of birth must be a valid date in DD/MM/YYYY format",
});

const phoneField = z.string().min(10, "Enter a valid phone number").max(15, "Enter a valid phone number");
const nameField = z.string().min(1, "Enter your name").max(100, "Name is too long");
const otpField = z.string().length(6, "Enter the 6-digit code").regex(/^\d{6}$/, "Enter the 6-digit code");
const pinField = z.string().length(4, "PIN must be 4 digits").regex(/^\d{4}$/, "PIN must be 4 digits");

export const PatientRegisterSchema = z.object({
  phone: phoneField,
  name: nameField,
  dob: DateOfBirthSchema,
  gender: GenderSchema.optional(),
  email: z.string().email("Enter a valid email address").optional(),
  pin: pinField.optional(),
  consent: z.literal(true),
});
export type PatientRegister = z.infer<typeof PatientRegisterSchema>;

export const PatientLoginSchema = z.object({
  phone: phoneField,
  pin: pinField,
});
export type PatientLogin = z.infer<typeof PatientLoginSchema>;

export const PatientLoginOtpInitiateSchema = z.object({
  phone: phoneField,
});
export type PatientLoginOtpInitiate = z.infer<typeof PatientLoginOtpInitiateSchema>;

export const PatientLoginOtpVerifySchema = z.object({
  phone: phoneField,
  otp: otpField,
});
export type PatientLoginOtpVerify = z.infer<typeof PatientLoginOtpVerifySchema>;

export const DoctorRegisterSchema = z.object({
  phone: phoneField,
  name: nameField,
  password: z.string().min(8, "Password must be at least 8 characters"),
  degree: z.string().min(1, "Enter your medical degree"),
  regNumber: z.string().min(1, "Enter your registration number"),
  specialization: z.string().optional(),
});
export type DoctorRegister = z.infer<typeof DoctorRegisterSchema>;

export const DoctorLoginInitiateSchema = z.object({
  phone: phoneField,
  password: z.string().min(1, "Enter your password"),
});
export type DoctorLoginInitiate = z.infer<typeof DoctorLoginInitiateSchema>;

export const DoctorLoginVerifySchema = z.object({
  phone: phoneField,
  otp: otpField,
});
export type DoctorLoginVerify = z.infer<typeof DoctorLoginVerifySchema>;

export const AdminLoginSchema = z.object({
  phone: phoneField,
  password: z.string().min(1, "Enter your password"),
});
export type AdminLogin = z.infer<typeof AdminLoginSchema>;

export const UserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  name: z.string(),
  role: UserRoleSchema,
  disabled: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const StaffCreateSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("ADMIN"),
    phone: phoneField,
    name: nameField,
  }),
  z.object({
    role: z.literal("DOCTOR"),
    phone: phoneField,
    name: nameField,
    degree: z.string().min(1, "Enter your medical degree"),
    regNumber: z.string().min(1, "Enter your registration number"),
    specialization: z.string().optional(),
  }),
]);
export type StaffCreate = z.infer<typeof StaffCreateSchema>;

export const UpdateProfileSchema = z.object({
  name: nameField.optional(),
  heightCm: z.number().positive("Enter a valid height").max(300, "Enter a valid height").optional(),
  weightKg: z.number().positive("Enter a valid weight").max(500, "Enter a valid weight").optional(),
  bloodType: z.string().max(10, "Enter a valid blood type").optional(),
  dob: DateOfBirthSchema.optional(),
});
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;

export const KioskRegisterSchema = z.object({
  deviceId: z.string().min(1, "Enter a device ID"),
  label: z.string().max(100, "Label is too long").optional(),
});
export type KioskRegister = z.infer<typeof KioskRegisterSchema>;

export const KioskSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  adminId: z.string(),
  label: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type Kiosk = z.infer<typeof KioskSchema>;

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

- [ ] **Step 2: Replace `account.schema.ts`**

Replace the entire contents of `packages/api-client/src/schemas/account.schema.ts` with:

```ts
import { z } from "zod";

const phoneField = z.string().min(10, "Enter a valid phone number").max(15, "Enter a valid phone number");
const otpField = z.string().length(6, "Enter the 6-digit code").regex(/^\d{6}$/, "Enter the 6-digit code");

export const AccountDeleteInitiateSchema = z.object({
  phone: phoneField,
});
export type AccountDeleteInitiate = z.infer<typeof AccountDeleteInitiateSchema>;

export const AccountDeleteVerifySchema = z.object({
  phone: phoneField,
  otp: otpField,
  password: z.string().optional(),
});
export type AccountDeleteVerify = z.infer<typeof AccountDeleteVerifySchema>;
```

- [ ] **Step 3: Replace `wallet.schema.ts`**

Replace the entire contents of `packages/api-client/src/schemas/wallet.schema.ts` with:

```ts
import { z } from "zod";

export const TxnTypeSchema = z.enum(["CREDIT", "DEBIT"]);
export const TxnStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);

export const WalletTransactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  callSessionId: z.string().nullable(),
  amount: z.string(),
  type: TxnTypeSchema,
  status: TxnStatusSchema,
  description: z.string().nullable(),
  createdAt: z.string(),
});
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

export const WithdrawRequestSchema = z.object({
  amount: z.number().positive("Enter an amount greater than 0"),
  bankName: z.string().min(1, "Enter your bank name"),
  accountNumber: z.string().min(1, "Enter your account number"),
  ifsc: z.string().min(1, "Enter your IFSC code"),
  holderName: z.string().min(1, "Enter the account holder name"),
});
export type WithdrawRequest = z.infer<typeof WithdrawRequestSchema>;

export const RevenueConfigUpdateSchema = z.object({
  consultationFee: z.number().positive("Enter a consultation fee greater than 0"),
  doctorPct: z.number().min(0, "Must be between 0 and 100").max(100, "Must be between 0 and 100"),
  adminPct: z.number().min(0, "Must be between 0 and 100").max(100, "Must be between 0 and 100"),
  superAdminPct: z.number().min(0, "Must be between 0 and 100").max(100, "Must be between 0 and 100"),
});
export type RevenueConfigUpdate = z.infer<typeof RevenueConfigUpdateSchema>;
```

- [ ] **Step 4: Replace `call.schema.ts`**

Replace the entire contents of `packages/api-client/src/schemas/call.schema.ts` with:

```ts
import { z } from "zod";

export const CallStatusSchema = z.enum([
  "QUEUED",
  "RINGING",
  "ACTIVE",
  "ENDED",
  "MISSED",
  "REJECTED",
  "NO_DOCTOR",
]);
export type CallStatus = z.infer<typeof CallStatusSchema>;

export const CallSessionSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  doctorId: z.string().nullable(),
  status: CallStatusSchema,
  livekitRoom: z.string(),
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CallSession = z.infer<typeof CallSessionSchema>;

export const CallCreateSchema = z.object({
  paymentId: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
});
export type CallCreate = z.infer<typeof CallCreateSchema>;

export const VitalsSchema = z.object({
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  bp: z.string().optional(),
  spo2: z.number().min(0, "SpO2 must be between 0 and 100").max(100, "SpO2 must be between 0 and 100").optional(),
  temp: z.number().optional(),
});
export type Vitals = z.infer<typeof VitalsSchema>;
```

- [ ] **Step 5: Replace `chat.schema.ts`**

Replace the entire contents of `packages/api-client/src/schemas/chat.schema.ts` with:

```ts
import { z } from "zod";
import { VitalsSchema } from "./call.schema.js";

export const MsgTypeSchema = z.enum(["TEXT", "IMAGE", "VITALS"]);
export type MsgType = z.infer<typeof MsgTypeSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  callSessionId: z.string(),
  senderId: z.string(),
  content: z.string().nullable(),
  imageKey: z.string().nullable(),
  vitals: VitalsSchema.nullable(),
  type: MsgTypeSchema,
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SendChatSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TEXT"),
    callSessionId: z.string(),
    content: z.string().min(1, "Message can't be empty").max(2000, "Message is too long"),
  }),
  z.object({
    type: z.literal("IMAGE"),
    callSessionId: z.string(),
    imageKey: z.string(),
  }),
  z.object({
    type: z.literal("VITALS"),
    callSessionId: z.string(),
    vitals: VitalsSchema,
  }),
]);
export type SendChat = z.infer<typeof SendChatSchema>;
```

- [ ] **Step 6: Rebuild api-client**

Run: `npm run build --workspace @madamgy/api-client`
Expected: builds with zero errors, regenerates `packages/api-client/dist/`.

- [ ] **Step 7: Typecheck api-client and web**

Run: `npm run typecheck --workspace @madamgy/api-client`
Expected: no errors.
Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 8: Commit**

```fish
git add packages/api-client/src/schemas/user.schema.ts packages/api-client/src/schemas/account.schema.ts packages/api-client/src/schemas/wallet.schema.ts packages/api-client/src/schemas/call.schema.ts packages/api-client/src/schemas/chat.schema.ts packages/api-client/dist
git commit -m "fix: add human-readable validation messages to api-client schemas"
```

---

### Task 3: Drop the redundant path prefix in the web error formatter

**Files:**
- Modify: `packages/web/src/lib/errors.ts`

**Interfaces:**
- No signature change: named export `getApiErrorMessage(error: unknown, fallback: string): string` stays identical. Every page in this plan (and every page already in the codebase) that imports `getApiErrorMessage` from `../../lib/errors` (or `./lib/errors`) needs no changes for this fix to take effect.
- Confirmed by reading `packages/server/src/middleware/error.middleware.ts`: for a `ZodError` it responds `res.status(400).json({ message: "Invalid request", issues: error.issues })`, i.e. it forwards each Zod issue's `.message` untouched. No server change is needed — once Task 2's schemas carry clean messages, `issue.message` here is already the clean string; this task only removes the `${path}: ` prefix that was being prepended on the client.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/lib/errors.ts` with:

```ts
import axios from "axios";

interface ApiErrorResponse {
  message?: string;
  issues?: Array<{
    message?: string;
    path?: Array<string | number>;
  }>;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const issue = error.response?.data?.issues?.[0];
    if (issue?.message) {
      return issue.message;
    }

    return error.response?.data?.message ?? fallback;
  }

  return fallback;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/lib/errors.ts
git commit -m "fix: show clean validation messages without field-path prefix"
```

---

### Task 4: Admin user/doctor/patient lists — responsive table (part 1)

**Files:**
- Modify: `packages/web/src/pages/admin/Users.tsx`
- Modify: `packages/web/src/pages/admin/Doctors.tsx`
- Modify: `packages/web/src/pages/admin/Patients.tsx`

**Interfaces:**
- Consumes: `Button`, `Badge` from `../../components/ui/{button,badge}`; `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` from `../../components/ui/table`; `ErrorState`, `SkeletonRows` from `../../components/common/{ErrorState,SkeletonRows}` (Task 1); `getApiErrorMessage` from `../../lib/errors` (Task 3, signature unchanged).
- All three keep their existing query keys (`admin-users`, `admin-doctors`) and mutation shapes — restyle/responsiveness and failure-state wiring only, no data-flow changes.

- [ ] **Step 1: Replace `Users.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/Users.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface AdminUser {
  id: string;
  name: string;
  phone: string;
  role: string;
  disabled: boolean;
  createdAt: string;
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const {
    data: users,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/admin/users").then((response) => response.data),
  });
  const toggle = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => api.put(`/admin/users/${id}/disable`, { disabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Updated");
    },
    onError: () => toast.error("Update failed"),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Users</h1>
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load users.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <>
          <div className="space-y-3 md:hidden">
            {users?.map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
                <Link to={`/admin/users/${user.id}`} className="flex-1">
                  <p className="font-bold text-primary hover:underline">{user.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {user.phone} - {user.role} - {format(new Date(user.createdAt), "dd MMM yyyy")}
                  </p>
                </Link>
                <Button
                  variant={user.disabled ? "default" : "destructive"}
                  onClick={() => toggle.mutate({ id: user.id, disabled: !user.disabled })}
                >
                  {user.disabled ? "Enable" : "Disable"}
                </Button>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Link to={`/admin/users/${user.id}`} className="font-bold text-primary hover:underline">
                        {user.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{user.role}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(user.createdAt), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={user.disabled ? "default" : "destructive"}
                        onClick={() => toggle.mutate({ id: user.id, disabled: !user.disabled })}
                      >
                        {user.disabled ? "Enable" : "Disable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `Doctors.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/Doctors.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface Doctor {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  doctorProfile: {
    degree: string;
    regNumber: string;
    specialization: string | null;
    isApproved: boolean;
  };
}

export default function AdminDoctors() {
  const queryClient = useQueryClient();
  const {
    data: doctors,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-doctors"],
    queryFn: () => api.get<Doctor[]>("/admin/doctors").then((response) => response.data),
  });
  const approve = useMutation({
    mutationFn: (id: string) => api.put(`/admin/doctors/${id}/approve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-doctors"] });
      toast.success("Doctor approved");
    },
    onError: () => toast.error("Failed to approve"),
  });
  const pending = doctors?.filter((doctor) => !doctor.doctorProfile.isApproved) ?? [];
  const approved = doctors?.filter((doctor) => doctor.doctorProfile.isApproved) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Doctors</h1>
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load doctors.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <>
          {pending.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display mb-4 text-lg font-semibold text-foreground">Pending approval ({pending.length})</h2>
              <div className="space-y-3 md:hidden">
                {pending.map((doctor) => (
                  <div
                    key={doctor.id}
                    className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-primary/30"
                  >
                    <Link to={`/admin/users/${doctor.id}`} className="flex-1">
                      <p className="font-bold text-primary hover:underline">{doctor.name}</p>
                      <p className="text-muted-foreground">
                        {doctor.phone} - {doctor.doctorProfile.degree} - Reg: {doctor.doctorProfile.regNumber}
                      </p>
                    </Link>
                    <Button onClick={() => approve.mutate(doctor.id)}>Approve</Button>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Degree</TableHead>
                      <TableHead>Reg. number</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((doctor) => (
                      <TableRow key={doctor.id}>
                        <TableCell>
                          <Link to={`/admin/users/${doctor.id}`} className="font-bold text-primary hover:underline">
                            {doctor.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{doctor.phone}</TableCell>
                        <TableCell className="text-muted-foreground">{doctor.doctorProfile.degree}</TableCell>
                        <TableCell className="text-muted-foreground">{doctor.doctorProfile.regNumber}</TableCell>
                        <TableCell className="text-right">
                          <Button onClick={() => approve.mutate(doctor.id)}>Approve</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}

          <h2 className="font-display mb-4 text-lg font-semibold text-foreground">Approved ({approved.length})</h2>
          <div className="space-y-3 md:hidden">
            {approved.map((doctor) => (
              <div key={doctor.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
                <Link to={`/admin/users/${doctor.id}`} className="flex-1">
                  <p className="font-bold text-primary hover:underline">{doctor.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {doctor.phone} - {doctor.doctorProfile.degree}
                  </p>
                </Link>
                <Badge>Approved</Badge>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Degree</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approved.map((doctor) => (
                  <TableRow key={doctor.id}>
                    <TableCell>
                      <Link to={`/admin/users/${doctor.id}`} className="font-bold text-primary hover:underline">
                        {doctor.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{doctor.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{doctor.doctorProfile.degree}</TableCell>
                    <TableCell className="text-right">
                      <Badge>Approved</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace `Patients.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/Patients.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

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
  const {
    data: users,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Patients</h1>
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load patients.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <>
          <div className="space-y-3 md:hidden">
            {patients?.map((patient) => (
              <div key={patient.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
                <div>
                  <p className="font-bold text-foreground">{patient.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {patient.phone} - {format(new Date(patient.createdAt), "dd MMM yyyy")}
                  </p>
                </div>
                <Button
                  variant={patient.disabled ? "default" : "destructive"}
                  onClick={() => toggle.mutate({ id: patient.id, disabled: !patient.disabled })}
                >
                  {patient.disabled ? "Enable" : "Disable"}
                </Button>
              </div>
            ))}
            {patients?.length === 0 && <p className="text-muted-foreground">No patients yet.</p>}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients?.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell className="font-bold text-foreground">{patient.name}</TableCell>
                    <TableCell className="text-muted-foreground">{patient.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(patient.createdAt), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={patient.disabled ? "default" : "destructive"}
                        onClick={() => toggle.mutate({ id: patient.id, disabled: !patient.disabled })}
                      >
                        {patient.disabled ? "Enable" : "Disable"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {patients?.length === 0 && <p className="text-muted-foreground">No patients yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 5: Commit**

```fish
git add packages/web/src/pages/admin/Users.tsx packages/web/src/pages/admin/Doctors.tsx packages/web/src/pages/admin/Patients.tsx
git commit -m "feat: responsive table view and failure states for admin user/doctor/patient lists"
```

---

### Task 5: Admin call/withdrawal/audit lists — responsive table (part 2)

**Files:**
- Modify: `packages/web/src/pages/admin/Calls.tsx`
- Modify: `packages/web/src/pages/admin/Withdrawals.tsx`
- Modify: `packages/web/src/pages/admin/AuditLog.tsx`

**Interfaces:**
- Same shared imports as Task 4: `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` from `../../components/ui/table`; `Badge`, `Button` from `../../components/ui/{badge,button}`; `ErrorState`, `SkeletonRows` from `../../components/common/{ErrorState,SkeletonRows}`; `getApiErrorMessage` from `../../lib/errors`.
- All three keep their existing query keys (`admin-calls`, `admin-withdrawals`, `admin-audit-log`) and mutation shapes.

- [ ] **Step 1: Replace `Calls.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/Calls.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface AdminCall extends CallSession {
  patient: { id: string; name: string };
  doctor: { id: string; name: string } | null;
}

interface CallsResponse {
  calls: AdminCall[];
  total: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ENDED: "default",
  NO_DOCTOR: "destructive",
};

export default function AdminCalls() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-calls"],
    queryFn: () => api.get<CallsResponse>("/admin/calls").then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Call history</h1>
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load call history.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <>
          <div className="space-y-3 md:hidden">
            {data?.calls.map((call) => (
              <div key={call.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
                <div>
                  <p className="font-semibold text-foreground">
                    {call.patient.name} {call.doctor ? `with Dr. ${call.doctor.name}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">{format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}</p>
                </div>
                <Badge variant={STATUS_VARIANT[call.status] ?? "secondary"}>{call.status}</Badge>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.calls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="font-semibold text-foreground">{call.patient.name}</TableCell>
                    <TableCell className="text-muted-foreground">{call.doctor ? call.doctor.name : "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={STATUS_VARIANT[call.status] ?? "secondary"}>{call.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `Withdrawals.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/Withdrawals.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { WalletTransaction } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface WithdrawalRequest extends WalletTransaction {
  user: { id: string; name: string; phone: string; role: "DOCTOR" | "ADMIN" | "PATIENT" | "SUPER_ADMIN" };
}

export default function AdminWithdrawals() {
  const queryClient = useQueryClient();
  const {
    data: withdrawals,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: () => api.get<WithdrawalRequest[]>("/admin/wallet/withdrawals").then((response) => response.data),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["admin-withdrawals"] });
  }

  const complete = useMutation({
    mutationFn: (id: string) => api.put(`/admin/wallet/withdrawals/${id}/complete`),
    onSuccess: () => {
      invalidate();
      toast.success("Withdrawal marked complete");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to complete withdrawal")),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.put(`/admin/wallet/withdrawals/${id}/reject`),
    onSuccess: () => {
      invalidate();
      toast.success("Withdrawal rejected");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to reject withdrawal")),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Withdrawal requests</h1>
      {isLoading && <SkeletonRows />}
      {isError && (
        <ErrorState message={getApiErrorMessage(error, "We couldn't load withdrawal requests.")} onRetry={() => void refetch()} />
      )}
      {!isLoading && !isError && (
        <>
          {withdrawals?.length === 0 && <p className="text-muted-foreground">No pending withdrawal requests.</p>}
          <div className="space-y-3 md:hidden">
            {withdrawals?.map((withdrawal) => (
              <div key={withdrawal.id} className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-primary/30">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-foreground">
                      {withdrawal.user.name} <span className="text-sm font-normal text-muted-foreground">({withdrawal.user.role})</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{withdrawal.user.phone}</p>
                    <p className="mt-2 text-2xl font-bold text-primary">Rs. {withdrawal.amount}</p>
                    <p className="mt-1 text-sm text-foreground">{withdrawal.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{format(new Date(withdrawal.createdAt), "dd MMM yyyy HH:mm")}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => complete.mutate(withdrawal.id)}>Mark paid</Button>
                    <Button variant="destructive" onClick={() => reject.mutate(withdrawal.id)}>
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals?.map((withdrawal) => (
                  <TableRow key={withdrawal.id}>
                    <TableCell>
                      <p className="font-bold text-foreground">{withdrawal.user.name}</p>
                      <p className="text-xs text-muted-foreground">{withdrawal.user.role}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{withdrawal.user.phone}</TableCell>
                    <TableCell className="font-bold text-primary">Rs. {withdrawal.amount}</TableCell>
                    <TableCell className="text-muted-foreground">{withdrawal.description}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(withdrawal.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => complete.mutate(withdrawal.id)}>Mark paid</Button>
                        <Button variant="destructive" onClick={() => reject.mutate(withdrawal.id)}>
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace `AuditLog.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/AuditLog.tsx` with:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { AuditLog } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
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
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-audit-log", page],
    queryFn: () => api.get<AuditLogResponse>("/admin/audit-log", { params: { page } }).then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Audit log</h1>
      {role === "ADMIN" && <p className="mb-8 text-sm text-muted-foreground">Showing your own actions only.</p>}
      {role !== "ADMIN" && <div className="mb-8" />}
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load the audit log.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <>
          <div className="flex flex-col gap-2 md:hidden">
            {data?.logs.map((log) => (
              <div key={log.id} className="rounded-lg bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">
                    {log.action}
                    {role !== "ADMIN" && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        by {log.actor.name} ({log.actor.role})
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{format(new Date(log.createdAt), "dd MMM yyyy HH:mm")}</p>
                </div>
                {log.targetId && <p className="mt-1 text-sm text-muted-foreground">Target: {log.targetId}</p>}
              </div>
            ))}
            {data?.logs.length === 0 && <p className="text-muted-foreground">No audit log entries.</p>}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  {role !== "ADMIN" && <TableHead>Actor</TableHead>}
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium text-foreground">{log.action}</TableCell>
                    {role !== "ADMIN" && (
                      <TableCell className="text-muted-foreground">
                        {log.actor.name} ({log.actor.role})
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">{log.targetId ?? "-"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{format(new Date(log.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data?.logs.length === 0 && <p className="text-muted-foreground">No audit log entries.</p>}
          </div>
        </>
      )}
      {data && data.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.pages}
          </span>
          <Button variant="outline" disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 5: Commit**

```fish
git add packages/web/src/pages/admin/Calls.tsx packages/web/src/pages/admin/Withdrawals.tsx packages/web/src/pages/admin/AuditLog.tsx
git commit -m "feat: responsive table view and failure states for admin call/withdrawal/audit lists"
```

---

### Task 6: Admin user detail page

**Files:**
- Modify: `packages/web/src/pages/admin/UserDetail.tsx`

**Interfaces:**
- Consumes: `PulseRing` from `../../components/brand/PulseRing` (`<PulseRing size="lg" />`, matches the existing full-screen-loading convention in `packages/web/src/pages/kiosk/Prescription.tsx:22-26`); `ErrorState` from `../../components/common/ErrorState`; `getApiErrorMessage` from `../../lib/errors`.
- No shadcn primitives beyond `PulseRing` (sections stay plain divs, unchanged from current markup). No new exports; `AdminUserDetail` remains the default export.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/pages/admin/UserDetail.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ErrorState } from "../../components/common/ErrorState";
import { PulseRing } from "../../components/brand/PulseRing";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface AdminUserDetailData {
  user: {
    id: string;
    phone: string;
    name: string;
    role: "PATIENT" | "DOCTOR" | "ADMIN" | "SUPER_ADMIN";
    disabled: boolean;
    createdAt: string;
    walletBalance: string;
    patientProfile: { heightCm: number | null; weightKg: number | null; bloodType: string | null; dob: string | null } | null;
    doctorProfile: {
      degree: string;
      regNumber: string;
      specialization: string | null;
      isApproved: boolean;
    } | null;
  };
  healthFiles: { id: string; name: string; type: string; sizeBytes: number; createdAt: string }[];
  prescriptions: {
    id: string;
    createdAt: string;
    pdfReady: boolean;
    patient: { id: string; name: string };
    doctor: { id: string; name: string };
  }[];
  callsAsPatient: { id: string; status: string; createdAt: string }[];
  callsAsDoctor: { id: string; status: string; createdAt: string }[];
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-user-detail", id],
    queryFn: () => api.get<AdminUserDetailData>(`/admin/users/${id}`).then((response) => response.data),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PulseRing size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <ErrorState message={getApiErrorMessage(error, "We couldn't load this user.")} onRetry={() => void refetch()} />
      </div>
    );
  }

  const { user, healthFiles, prescriptions, callsAsPatient, callsAsDoctor } = data;
  const calls = user.role === "DOCTOR" ? callsAsDoctor : callsAsPatient;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link to={user.role === "DOCTOR" ? "/admin/doctors" : "/admin/users"} className="mb-4 inline-block text-primary hover:underline">
        &larr; Back
      </Link>
      <h1 className="font-display mb-2 text-2xl font-bold text-foreground">{user.name}</h1>
      <p className="mb-8 text-muted-foreground">
        {user.phone} - {user.role} - Joined {format(new Date(user.createdAt), "dd MMM yyyy")} - {user.disabled ? "Disabled" : "Active"}
      </p>

      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        {user.patientProfile && (
          <section className="mb-8 rounded-xl bg-card p-6 shadow-sm">
            <h2 className="font-display mb-3 text-lg font-semibold text-foreground">Patient profile</h2>
            <p className="text-foreground">
              Height: {user.patientProfile.heightCm ?? "-"} cm, Weight: {user.patientProfile.weightKg ?? "-"} kg, Blood type:{" "}
              {user.patientProfile.bloodType ?? "-"}
            </p>
          </section>
        )}

        {user.doctorProfile && (
          <section className="mb-8 rounded-xl bg-card p-6 shadow-sm">
            <h2 className="font-display mb-3 text-lg font-semibold text-foreground">Doctor profile</h2>
            <p className="text-foreground">
              {user.doctorProfile.degree} - Reg: {user.doctorProfile.regNumber} - {user.doctorProfile.specialization ?? "General"}
            </p>
            <p className="mt-2 text-foreground">
              Approved: {user.doctorProfile.isApproved ? "Yes" : "No"} - Wallet balance: Rs. {user.walletBalance}
            </p>
          </section>
        )}

        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg font-semibold text-foreground">Health folder ({healthFiles.length})</h2>
          <div className="flex flex-col gap-2">
            {healthFiles.map((file) => (
              <div key={file.id} className="rounded-lg bg-card p-4 text-foreground shadow-sm">
                {file.name} - {file.type} - {format(new Date(file.createdAt), "dd MMM yyyy")}
              </div>
            ))}
            {healthFiles.length === 0 && <p className="text-muted-foreground">No files.</p>}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="font-display mb-3 text-lg font-semibold text-foreground">Prescriptions ({prescriptions.length})</h2>
          <div className="flex flex-col gap-2">
            {prescriptions.map((rx) => (
              <div key={rx.id} className="rounded-lg bg-card p-4 text-foreground shadow-sm">
                {rx.patient.name} with Dr. {rx.doctor.name} - {format(new Date(rx.createdAt), "dd MMM yyyy")} -{" "}
                {rx.pdfReady ? "PDF ready" : "Pending"}
              </div>
            ))}
            {prescriptions.length === 0 && <p className="text-muted-foreground">No prescriptions.</p>}
          </div>
        </section>

        <section>
          <h2 className="font-display mb-3 text-lg font-semibold text-foreground">Call history ({calls.length})</h2>
          <div className="flex flex-col gap-2">
            {calls.map((call) => (
              <div key={call.id} className="rounded-lg bg-card p-4 text-foreground shadow-sm">
                {call.status} - {format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}
              </div>
            ))}
            {calls.length === 0 && <p className="text-muted-foreground">No calls.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/pages/admin/UserDetail.tsx
git commit -m "feat: two-column layout, skeleton loading, and error state for admin user detail"
```

---

### Task 7: Admin device management page

**Files:**
- Modify: `packages/web/src/pages/admin/Devices.tsx`

**Interfaces:**
- Consumes: `ErrorState`, `SkeletonRows` from `../../components/common/{ErrorState,SkeletonRows}`; `getApiErrorMessage` from `../../lib/errors`. All other imports (`Badge`, `Button`, `Input`, `Label`) unchanged.
- Outer container widens from `max-w-2xl` to `max-w-5xl` for consistency with the other admin pages after Tasks 4-6; the registration form itself keeps a `max-w-2xl` cap (added directly on the `<form>`) so it doesn't stretch uncomfortably wide inside the new 5xl-wide page.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/pages/admin/Devices.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { KioskRegisterSchema, type Kiosk, type KioskRegister } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function AdminDevices() {
  const queryClient = useQueryClient();
  const {
    data: devices,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">My devices</h1>

      <form onSubmit={handleSubmit((data) => registerDevice.mutate(data))} className="mb-8 max-w-2xl rounded-xl bg-card p-6 shadow-sm">
        <h2 className="font-display mb-4 text-xl font-bold text-foreground">Register a device</h2>
        <div className="mb-4">
          <Label htmlFor="deviceId" className="mb-1.5">
            Device ID
          </Label>
          <Input id="deviceId" {...register("deviceId")} />
          {errors.deviceId && <p className="mt-1 text-sm text-destructive">{errors.deviceId.message}</p>}
        </div>
        <div className="mb-4">
          <Label htmlFor="label" className="mb-1.5">
            Label (optional)
          </Label>
          <Input id="label" {...register("label")} />
          {errors.label && <p className="mt-1 text-sm text-destructive">{errors.label.message}</p>}
        </div>
        <Button type="submit" disabled={registerDevice.isPending} className="w-full">
          {registerDevice.isPending ? "Registering..." : "Register device"}
        </Button>
      </form>

      <h2 className="font-display mb-4 text-xl font-bold text-foreground">Registered devices</h2>
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load devices.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <div className="flex flex-col gap-3">
          {devices?.map((device) => (
            <div key={device.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
              <div>
                <p className="font-bold text-foreground">{device.label || device.deviceId}</p>
                <p className="text-sm text-muted-foreground">{device.deviceId}</p>
                <p className="text-xs text-muted-foreground">Registered {format(new Date(device.createdAt), "dd MMM yyyy")}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={device.active ? "default" : "secondary"}>{device.active ? "Active" : "Inactive"}</Badge>
                {device.active && (
                  <Button variant="destructive" onClick={() => deactivateDevice.mutate(device.deviceId)}>
                    Deactivate
                  </Button>
                )}
              </div>
            </div>
          ))}
          {devices?.length === 0 && <p className="text-muted-foreground">No devices registered yet.</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/pages/admin/Devices.tsx
git commit -m "feat: widen admin devices page and add skeleton/error states"
```

---

### Task 8: Kiosk dashboard — responsive layout, failure state, touch target

**Files:**
- Modify: `packages/web/src/pages/kiosk/Dashboard.tsx`

**Interfaces:**
- Consumes: `ErrorState`, `SkeletonRows` from `../../components/common/{ErrorState,SkeletonRows}`; `getApiErrorMessage` from `../../lib/errors` (already imported). All other imports unchanged.
- The hand-rolled "Delete" button (not the shared `Button` component, since it uses a distinct destructive-ghost pill style not offered by any `Button` variant) is fixed to `h-11` with `flex items-center` instead of `py-2`, matching the touch-target constraint without switching components.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/pages/kiosk/Dashboard.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import type { HealthFile } from "@madamgy/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { logout } from "../../lib/logout";
import { connectSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";

export default function KioskDashboard() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const {
    data: files,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["health-files"],
    queryFn: () => api.get<HealthFile[]>("/health-files").then((response) => response.data),
  });

  useEffect(() => {
    const socket = connectSocket();
    socket.on("prescription:ready", ({ healthFileId }: { healthFileId: string }) => {
      toast.success("Prescription ready!");
      void refetch();
      navigate(`/prescription/${healthFileId}`);
    });

    return () => {
      socket.off("prescription:ready");
    };
  }, [navigate, refetch]);

  async function uploadFile(file: File): Promise<void> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post("/health-files", formData, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Lab report uploaded");
      await refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't upload that file. Try again."));
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(id: string): Promise<void> {
    try {
      await api.delete(`/health-files/${id}`);
      toast.success("Lab report deleted");
      await refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't delete that file. Try again."));
    }
  }

  async function deleteAccount(): Promise<void> {
    try {
      await api.delete("/account/me");
      await logout();
      navigate("/");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't delete your account. Try again."));
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <IdleGuard />
      <div className="mx-auto max-w-md px-6 py-10 sm:max-w-lg lg:max-w-2xl">
        <div className="mb-8 flex flex-col gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Welcome, {user?.name}</h1>
            <p className="text-muted-foreground">Your health folder</p>
          </div>
          <Button onClick={() => navigate("/consult")} className="w-full rounded-full text-lg">
            Consult doctor
          </Button>
        </div>

        <label className="mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-card p-6 text-center">
          <span className="font-semibold text-primary">{uploading ? "Uploading..." : "Upload lab report"}</span>
          <span className="mt-1 text-sm text-muted-foreground">PDF or image, up to 10MB</span>
          <input
            type="file"
            disabled={uploading}
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void uploadFile(file);
              }
            }}
          />
        </label>

        {isLoading && <SkeletonRows />}
        {isError && (
          <ErrorState message={getApiErrorMessage(error, "We couldn't load your health folder.")} onRetry={() => void refetch()} />
        )}
        {!isLoading && !isError && (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
            {files?.length === 0 && (
              <p className="py-12 text-center text-muted-foreground lg:col-span-2">No files yet. Start a consultation.</p>
            )}
            {files?.map((file) => (
              <div key={file.id} className="rounded-lg bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <button type="button" onClick={() => navigate(`/prescription/${file.id}`)} className="text-left">
                    <p className="font-semibold text-foreground">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {file.type === "PRESCRIPTION" ? "Prescription" : "Lab report"} · {format(new Date(file.createdAt), "dd MMM yyyy")}
                    </p>
                  </button>
                  {file.type !== "PRESCRIPTION" && (
                    <button
                      type="button"
                      onClick={() => void deleteFile(file.id)}
                      className="flex h-11 items-center rounded-full bg-destructive/10 px-4 text-sm font-semibold text-destructive"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 border-t border-input pt-6 text-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="text-sm text-destructive underline">
                Delete my account
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>This permanently deletes your account. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void deleteAccount()} className="bg-destructive hover:bg-destructive/90">
                  Yes, delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/pages/kiosk/Dashboard.tsx
git commit -m "feat: responsive layout, failure state, and 44px delete target on kiosk dashboard"
```

---

### Task 9: Kiosk registration and prescription pages — responsive width, touch target

**Files:**
- Modify: `packages/web/src/pages/kiosk/Register.tsx`
- Modify: `packages/web/src/pages/kiosk/Prescription.tsx`

**Interfaces:**
- No new imports in either file — pure className changes.
- `Register.tsx`'s gender-toggle `<button>` pair (not the shared `Button` component, since they need paired-pill active/inactive styling) moves from `py-2` to `h-11` with `flex items-center justify-center` to clear the 44px touch-target floor.

- [ ] **Step 1: Replace `Register.tsx`**

Replace the entire contents of `packages/web/src/pages/kiosk/Register.tsx` with:

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { PatientRegisterSchema, type Gender, type PatientRegister } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { useAuthStore } from "../../store/auth.store";

type RegisterInfo = Omit<PatientRegister, "pin" | "consent" | "gender" | "email">;

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

function formatDateOfBirthInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function KioskRegister() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gender, setGender] = useState<Gender | "">("");
  const [email, setEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInfo>({
    resolver: zodResolver(PatientRegisterSchema.omit({ pin: true, consent: true, gender: true, email: true })),
  });
  const dobRegistration = register("dob");

  async function submit(values: RegisterInfo): Promise<void> {
    setSubmitting(true);
    try {
      const response = await api.post("/auth/patient/register", {
        ...values,
        consent: true,
        ...(gender ? { gender } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setAuth(response.data.accessToken, response.data.user);
      navigate("/dashboard");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't create your account. Check the form and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-6 py-10">
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg">
        <h1 className="mb-6 text-center font-display text-3xl font-bold text-foreground">Create account</h1>
        <Card className="rounded-lg border-none ring-0 shadow-[0_8px_24px_-8px_rgba(219,101,145,0.15)]">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="register-name">Full name</Label>
                <Input id="register-name" {...register("name")} placeholder="Your name" />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="register-phone">Phone number</Label>
                <Input id="register-phone" {...register("phone")} type="tel" placeholder="10-digit phone number" />
                {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="register-dob">Date of birth</Label>
                <Input
                  id="register-dob"
                  {...dobRegistration}
                  onChange={(event) => {
                    event.target.value = formatDateOfBirthInput(event.target.value);
                    void dobRegistration.onChange(event);
                  }}
                  type="text"
                  placeholder="DD/MM/YYYY"
                  autoComplete="bday"
                  inputMode="numeric"
                  maxLength={10}
                />
                {errors.dob && <p className="text-sm text-destructive">{errors.dob.message}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Gender (optional)</Label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setGender(option.value)}
                      className={
                        gender === option.value
                          ? "flex h-11 flex-1 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                          : "flex h-11 flex-1 items-center justify-center rounded-full border border-input text-sm font-semibold text-foreground"
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="register-email">Email (optional)</Label>
                <Input id="register-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" />
              </div>

              <label className="flex items-start gap-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-primary"
                />
                I consent to receiving a teleconsultation and understand my health data will be stored for this purpose.
              </label>

              <Button type="submit" disabled={submitting || !consent} className="mt-2 w-full rounded-full">
                {submitting ? "Creating account..." : "Register"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/" className="font-semibold text-primary">
                  Log in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `Prescription.tsx`**

Replace the entire contents of `packages/web/src/pages/kiosk/Prescription.tsx` with:

```tsx
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { HealthFile } from "@madamgy/api-client";
import { IdleGuard } from "../../components/kiosk/IdleGuard";
import { PulseRing } from "../../components/brand/PulseRing";
import { PrescriptionViewer } from "../../components/prescription/PrescriptionViewer";
import { PrintButton } from "../../components/prescription/PrintButton";
import { api } from "../../lib/api";

export default function KioskPrescription() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const { data: file, isLoading } = useQuery({
    queryKey: ["health-file", id],
    queryFn: () => api.get<HealthFile>(`/health-files/${id}`).then((response) => response.data),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PulseRing size="lg" />
      </div>
    );
  }
  if (!file) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-lg text-destructive">We couldn't find that file.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <IdleGuard />
      <div className="mx-auto max-w-md sm:max-w-lg lg:max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button type="button" onClick={() => navigate("/dashboard")} className="text-primary">
            &larr; Back
          </button>
          <PrintButton targetRef={printRef} />
        </div>
        <PrescriptionViewer ref={printRef} pdfUrl={file.url} name={file.name} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 4: Commit**

```fish
git add packages/web/src/pages/kiosk/Register.tsx packages/web/src/pages/kiosk/Prescription.tsx
git commit -m "feat: responsive width on kiosk register/prescription and 44px gender toggle"
```

---

### Task 10: Doctor dashboard and call history — responsive layout, failure state

**Files:**
- Modify: `packages/web/src/pages/doctor/Dashboard.tsx`
- Modify: `packages/web/src/pages/doctor/History.tsx`

**Interfaces:**
- `Dashboard.tsx` has no `useQuery` calls (its `/users/me` read is an imperative `api.get(...).then()/.catch()` in a `useEffect`, and its incoming-call state comes from sockets) — confirmed by reading the file — so no `ErrorState`/`SkeletonRows` wiring applies here; this task only widens the container and turns the header-plus-incoming-call area into a 2-column layout at `lg:`+.
- `History.tsx` consumes `ErrorState`, `SkeletonRows` from `../../components/common/{ErrorState,SkeletonRows}` and `getApiErrorMessage` from `../../lib/errors` (new import), wired to its existing `call-history` query.

- [ ] **Step 1: Replace `Dashboard.tsx`**

Replace the entire contents of `packages/web/src/pages/doctor/Dashboard.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api";
import { logout } from "../../lib/logout";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket, getSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";
import { useCallStore } from "../../store/call.store";

interface IncomingCall {
  callSession: { id: string; livekitRoom: string };
  patient: { id: string; name: string };
}

interface MeResponse {
  doctorProfile?: { isAvailable: boolean } | null;
}

export default function DoctorDashboard() {
  const user = useAuthStore((state) => state.user);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const navigate = useNavigate();
  const [isAvailable, setIsAvailable] = useState(false);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  useEffect(() => {
    api
      .get<MeResponse>("/users/me")
      .then((response) => setIsAvailable(Boolean(response.data.doctorProfile?.isAvailable)))
      .catch(() => setIsAvailable(false));

    const socket = connectSocket();
    socket.on("call:incoming", (data: IncomingCall) => {
      setIncoming(data);
      toast("Incoming call");
    });
    socket.on("call:accepted", ({ callSessionId, livekitToken }: { callSessionId: string; livekitToken: string }) => {
      setLivekitToken(livekitToken);
      navigate(`/doctor/call/${callSessionId}`);
    });

    return () => {
      socket.off("call:incoming");
      socket.off("call:accepted");
    };
  }, [navigate, setLivekitToken]);

  useEffect(() => {
    getSocket().emit("presence:ping");
    const interval = setInterval(() => {
      getSocket().emit("presence:ping");
    }, 20_000);

    return () => clearInterval(interval);
  }, []);

  function toggleAvailable(): void {
    const next = !isAvailable;
    setIsAvailable(next);
    getSocket().emit("doctor:toggle_available", { isAvailable: next });
  }

  function accept(): void {
    if (!incoming) {
      return;
    }

    getSocket().emit("call:accept", { callSessionId: incoming.callSession.id });
    setIncoming(null);
  }

  function reject(): void {
    if (!incoming) {
      return;
    }

    getSocket().emit("call:reject", { callSessionId: incoming.callSession.id });
    setIncoming(null);
  }

  async function signOut(): Promise<void> {
    await logout();
    navigate("/doctor/login");
  }

  async function deleteAccount(): Promise<void> {
    try {
      await api.delete("/account/me");
      await logout();
      navigate("/doctor/login");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't delete your account. Try again."));
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl lg:max-w-4xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Welcome, Dr. {user?.name}</h1>
            <Button
              type="button"
              onClick={toggleAvailable}
              variant={isAvailable ? "default" : "secondary"}
              className="mt-3 rounded-full"
            >
              {isAvailable ? "Available" : "Unavailable"}
            </Button>
          </div>
          <div className="flex gap-3 lg:justify-end">
            <Button variant="outline" onClick={() => void signOut()}>
              Logout
            </Button>
            <Button variant="outline" asChild>
              <Link to="/doctor/history">History</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/doctor/wallet">Wallet</Link>
            </Button>
          </div>
        </div>

        {incoming && (
          <div className="rounded-xl bg-card p-6 shadow-sm ring-1 ring-primary/30">
            <h2 className="font-display mb-2 text-xl font-bold text-foreground">Incoming call</h2>
            <p className="mb-4 text-foreground">
              Patient: <strong>{incoming.patient.name}</strong>
            </p>
            <div className="flex gap-4">
              <Button onClick={accept} className="flex-1 rounded-full text-lg">
                Accept
              </Button>
              <Button variant="destructive" onClick={reject} className="flex-1 rounded-full text-lg">
                Reject
              </Button>
            </div>
          </div>
        )}

        <div className="mt-8 border-t border-input pt-6 text-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="text-sm text-destructive underline">
                Delete my account
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes your account. Any wallet balance must be withdrawn first. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void deleteAccount()} className="bg-destructive hover:bg-destructive/90">
                  Yes, delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `History.tsx`**

Replace the entire contents of `packages/web/src/pages/doctor/History.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface HistoryResponse {
  calls: (CallSession & { patient: { name: string } })[];
  total: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ENDED: "default",
  NO_DOCTOR: "destructive",
};

export default function DoctorHistory() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["call-history"],
    queryFn: () => api.get<HistoryResponse>("/calls/history").then((response) => response.data),
  });

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl sm:max-w-3xl lg:max-w-4xl">
        <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Call history</h1>
        {isLoading && <SkeletonRows />}
        {isError && (
          <ErrorState message={getApiErrorMessage(error, "We couldn't load your call history.")} onRetry={() => void refetch()} />
        )}
        {!isLoading && !isError && (
          <div className="flex flex-col gap-3">
            {data?.calls.length === 0 && <p className="py-12 text-center text-muted-foreground">No calls yet.</p>}
            {data?.calls.map((call) => (
              <div key={call.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
                <div>
                  <p className="font-semibold text-foreground">{call.patient?.name}</p>
                  <p className="text-sm text-muted-foreground">{format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}</p>
                </div>
                <Badge variant={STATUS_VARIANT[call.status] ?? "secondary"}>{call.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 4: Commit**

```fish
git add packages/web/src/pages/doctor/Dashboard.tsx packages/web/src/pages/doctor/History.tsx
git commit -m "feat: two-column doctor dashboard header and failure state on call history"
```

---

### Task 11: Doctor registration page and shared wallet panel

**Files:**
- Modify: `packages/web/src/pages/doctor/Register.tsx`
- Modify: `packages/web/src/components/wallet/WalletPanel.tsx`

**Interfaces:**
- `Register.tsx`: pure className widening, no import changes.
- `WalletPanel.tsx` consumes `ErrorState`, `SkeletonRows` from `../common/{ErrorState,SkeletonRows}` (note: one directory level up from `components/wallet/`, matching its existing `../ui/badge` style imports) and `getApiErrorMessage` from `../../lib/errors` (already imported). Only the `wallet-transactions` query gets failure-state wiring — the `wallet` (balance) query is left as-is, since it already degrades gracefully to `Rs. -` and wasn't called out by the audit.
- No prop changes: `WalletPanel({ apiBasePath }: { apiBasePath: string })` stays the same, so `packages/web/src/pages/admin/Wallet.tsx` and `packages/web/src/pages/doctor/Wallet.tsx` (both thin wrappers, `<WalletPanel apiBasePath="/admin" />` / `<WalletPanel apiBasePath="/doctor" />`) need zero changes.

- [ ] **Step 1: Replace `Register.tsx`**

Replace the entire contents of `packages/web/src/pages/doctor/Register.tsx` with:

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { DoctorRegisterSchema, type DoctorRegister } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function DoctorRegister() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [licenseDocument, setLicenseDocument] = useState<File | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DoctorRegister>({ resolver: zodResolver(DoctorRegisterSchema) });

  async function submit(data: DoctorRegister): Promise<void> {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("data", JSON.stringify(data));
      if (licenseDocument) {
        formData.append("licenseDocument", licenseDocument);
      }
      await api.post("/auth/doctor/register", formData);
      toast.success("Registration submitted for approval");
      navigate("/doctor/login");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Registration failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <form
        onSubmit={handleSubmit((data) => void submit(data))}
        className="mx-auto max-w-2xl rounded-xl bg-card p-8 shadow-sm lg:max-w-3xl"
      >
        <h1 className="font-display text-2xl font-bold text-foreground">Doctor registration</h1>
        <p className="mb-6 mt-1 text-muted-foreground">Admin approval is required before you can sign in.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name" className="mb-1.5">Full name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="phone" className="mb-1.5">Phone</Label>
            <Input id="phone" type="tel" {...register("phone")} />
            {errors.phone && <p className="mt-1 text-sm text-destructive">{errors.phone.message}</p>}
          </div>
          <div>
            <Label htmlFor="password" className="mb-1.5">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="mt-1 text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div>
            <Label htmlFor="degree" className="mb-1.5">Degree</Label>
            <Input id="degree" {...register("degree")} />
            {errors.degree && <p className="mt-1 text-sm text-destructive">{errors.degree.message}</p>}
          </div>
          <div>
            <Label htmlFor="regNumber" className="mb-1.5">Registration number</Label>
            <Input id="regNumber" {...register("regNumber")} />
            {errors.regNumber && <p className="mt-1 text-sm text-destructive">{errors.regNumber.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="specialization" className="mb-1.5">Specialization</Label>
            <Input id="specialization" {...register("specialization")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="licenseDocument" className="mb-1.5">Degree certificate or medical license (PDF)</Label>
            <input
              id="licenseDocument"
              type="file"
              accept="application/pdf"
              onChange={(event) => setLicenseDocument(event.target.files?.[0] ?? null)}
              className="flex h-11 w-full items-center rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
            />
          </div>
        </div>
        <Button type="submit" disabled={submitting || !licenseDocument} className="mt-6 w-full rounded-full text-lg">
          {submitting ? "Submitting..." : "Submit registration"}
        </Button>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already approved?{" "}
          <Link to="/doctor/login" className="font-semibold text-primary">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Replace `WalletPanel.tsx`**

Replace the entire contents of `packages/web/src/components/wallet/WalletPanel.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { WithdrawRequestSchema, type WalletTransaction, type WithdrawRequest } from "@madamgy/api-client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ErrorState } from "../common/ErrorState";
import { SkeletonRows } from "../common/SkeletonRows";
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

const FIELDS = [
  { name: "amount" as const, label: "Amount (Rs.)", type: "number" },
  { name: "bankName" as const, label: "Bank name", type: "text" },
  { name: "accountNumber" as const, label: "Account number", type: "text" },
  { name: "ifsc" as const, label: "IFSC code", type: "text" },
  { name: "holderName" as const, label: "Account holder name", type: "text" },
];

export default function WalletPanel({ apiBasePath }: WalletPanelProps) {
  const queryClient = useQueryClient();
  const { data: wallet } = useQuery({
    queryKey: ["wallet", apiBasePath],
    queryFn: () => api.get<WalletResponse>(`${apiBasePath}/wallet`).then((response) => response.data),
  });
  const {
    data: transactions,
    isLoading: transactionsLoading,
    isError: transactionsError,
    error: transactionsErrorDetail,
    refetch: refetchTransactions,
  } = useQuery({
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
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Withdrawal request failed")),
  });

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl lg:max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-foreground">Wallet</h1>
        <div className="mb-8 mt-6 rounded-xl bg-card p-6 shadow-sm">
          <p className="mb-1 text-muted-foreground">Available balance</p>
          <p className="text-4xl font-bold text-primary">Rs. {wallet?.balance ?? "-"}</p>
        </div>

        <form onSubmit={handleSubmit((data) => withdraw.mutate(data))} className="mb-8 rounded-xl bg-card p-6 shadow-sm">
          <h2 className="font-display mb-4 text-xl font-bold text-foreground">Request withdrawal</h2>
          <div className="flex flex-col gap-4">
            {FIELDS.map((field) => (
              <div key={field.name}>
                <Label htmlFor={field.name} className="mb-1.5">
                  {field.label}
                </Label>
                <Input
                  id={field.name}
                  type={field.type}
                  {...register(field.name, { valueAsNumber: field.type === "number" })}
                />
                {errors[field.name] && <p className="mt-1 text-sm text-destructive">{errors[field.name]?.message}</p>}
              </div>
            ))}
          </div>
          <Button type="submit" disabled={withdraw.isPending} className="mt-6 w-full rounded-full text-lg">
            {withdraw.isPending ? "Submitting..." : "Request withdrawal"}
          </Button>
        </form>

        <h2 className="font-display mb-4 text-xl font-bold text-foreground">Transactions</h2>
        {transactionsLoading && <SkeletonRows />}
        {transactionsError && (
          <ErrorState
            message={getApiErrorMessage(transactionsErrorDetail, "We couldn't load your transactions.")}
            onRetry={() => void refetchTransactions()}
          />
        )}
        {!transactionsLoading && !transactionsError && (
          <div className="flex flex-col gap-2">
            {transactions?.transactions.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">No transactions yet.</p>
            )}
            {transactions?.transactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-4 shadow-sm">
                <div>
                  <p className="font-medium text-foreground">{transaction.description || transaction.type}</p>
                  <p className="text-sm text-muted-foreground">{format(new Date(transaction.createdAt), "dd MMM yyyy HH:mm")}</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${transaction.type === "CREDIT" ? "text-primary" : "text-destructive"}`}>
                    {transaction.type === "CREDIT" ? "+" : "-"}Rs. {transaction.amount}
                  </p>
                  <Badge variant="outline" className="mt-1">
                    {transaction.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 4: Commit**

```fish
git add packages/web/src/pages/doctor/Register.tsx packages/web/src/components/wallet/WalletPanel.tsx
git commit -m "feat: widen doctor register and add transaction failure state to wallet panel"
```

---

### Task 12: Doctor call screen — video pane height at wide viewports

**Files:**
- Modify: `packages/web/src/pages/doctor/Call.tsx`

**Interfaces:**
- No new imports, no new exports, no prop changes. `DoctorCall` remains the default export. This file has no `useQuery` calls (confirmed by reading it — only `useEditor` and socket listeners), so there is no failure state to wire; this task is a single className change on the video-pane wrapper `<div>`.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/pages/doctor/Call.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import toast from "react-hot-toast";
import { CallChatPanel } from "../../components/call/CallChatPanel";
import { PatientHistoryPanel } from "../../components/call/PatientHistoryPanel";
import { DoctorCallView } from "../../components/video/DoctorCallView";
import { Button } from "../../components/ui/button";
import { PulseRing } from "../../components/brand/PulseRing";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket } from "../../lib/socket";
import { useImmersiveStatusBar } from "../../hooks/useImmersiveStatusBar";
import { useCallStore } from "../../store/call.store";

export default function DoctorCall() {
  const { id: callSessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const storedLivekitToken = useCallStore((state) => state.livekitToken);
  const setLivekitToken = useCallStore((state) => state.setLivekitToken);
  const clearCall = useCallStore((state) => state.clearCall);
  const [submitting, setSubmitting] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"chat" | "history">("chat");

  useImmersiveStatusBar();

  const editor = useEditor({
    extensions: [StarterKit],
    content: "<p>Patient complaint:<br>Diagnosis:<br>Medications:<br>Advice:</p>",
  });

  useEffect(() => {
    const socket = connectSocket();
    socket.on(
      "call:accepted",
      ({ callSessionId: acceptedId, livekitToken, patientId: acceptedPatientId }: { callSessionId: string; livekitToken: string; patientId?: string }) => {
        if (acceptedId === callSessionId) {
          setLivekitToken(livekitToken);
          if (acceptedPatientId) {
            setPatientId(acceptedPatientId);
          }
        }
      },
    );
    socket.on("call:ended", () => {
      clearCall();
      navigate("/doctor");
    });

    return () => {
      socket.off("call:accepted");
      socket.off("call:ended");
    };
  }, [callSessionId, clearCall, navigate, setLivekitToken]);

  async function submitPrescription(): Promise<void> {
    if (!editor || !callSessionId) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/prescriptions", { callSessionId, content: editor.getJSON() });
      toast.success("Prescription submitted");
      clearCall();
      navigate("/doctor");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Submission failed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!storedLivekitToken) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
        <PulseRing size="lg" />
        <p className="text-center text-xl text-foreground">Waiting for connection...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="h-[55vh] lg:h-[70vh]">
        <DoctorCallView
          token={storedLivekitToken}
          serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
          onDisconnected={() => navigate("/doctor")}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 border-t border-input bg-background p-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex min-h-0 flex-col">
          <h3 className="font-display mb-2 text-lg font-semibold text-foreground">Prescription</h3>
          <div className="min-h-[120px] flex-1 rounded-lg border border-input bg-card p-3 text-foreground">
            <EditorContent editor={editor} />
          </div>
          <Button
            type="button"
            onClick={() => void submitPrescription()}
            disabled={submitting}
            className="mt-3 w-full text-lg"
          >
            {submitting ? "Submitting..." : "Submit prescription"}
          </Button>
        </div>
        <div className="flex min-h-0 flex-col rounded-xl bg-card shadow-sm">
          <div className="flex border-b border-input">
            <button
              type="button"
              onClick={() => setRightTab("chat")}
              className={`flex-1 rounded-tl-xl py-3 text-sm font-semibold ${
                rightTab === "chat" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setRightTab("history")}
              className={`flex-1 rounded-tr-xl py-3 text-sm font-semibold ${
                rightTab === "history" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              }`}
            >
              Patient history
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {rightTab === "chat" && callSessionId && <CallChatPanel callSessionId={callSessionId} />}
            {rightTab === "history" &&
              (patientId ? (
                <PatientHistoryPanel patientId={patientId} />
              ) : (
                <p className="p-4 text-sm text-muted-foreground">Patient not identified yet.</p>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/pages/doctor/Call.tsx
git commit -m "fix: taller video pane on doctor call screen at wide viewports"
```
