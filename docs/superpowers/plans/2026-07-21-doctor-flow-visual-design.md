# Doctor Flow Visual Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the doctor-facing pages and shared call/wallet components up to the same visual design system already shipped for the patient/kiosk flow — no raw Tailwind defaults (`blue-600`, `gray-50`), no new behavior.

**Architecture:** Pure restyle pass. Every file keeps its existing props, hooks, socket events, and data flow exactly as-is; only JSX markup and class names change, swapping raw Tailwind utility colors for the design-system's semantic tokens and vendored shadcn primitives (`Button`, `Input`, `Label`, `Badge`, `AlertDialog`).

**Tech Stack:** React 18.3.1 + Vite (ESM), Tailwind CSS v3.4.19, shadcn/ui primitives already vendored in `packages/web/src/components/ui/`, `react-hook-form` + `zod` for forms, `@tanstack/react-query` for data fetching, Zustand for `auth.store`/`call.store`.

## Global Constraints

- Color/spacing/radius tokens, fonts, and the `hsl(var(--x) / <alpha-value>)` token architecture are already finalized in `packages/web/src/index.css` and `packages/web/tailwind.config.ts` — do not add new tokens or raw hex/named-color Tailwind classes (`blue-600`, `gray-50`, `red-500`, etc). Use only: `background`, `foreground`, `card`, `card-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `destructive`, `input`, `ring`, `popover`, `popover-foreground`.
- `Button`/`Input`/`Select` default size is `h-11` (44px, WCAG/HIG touch-target minimum) — use the default size for every primary interactive control. The `icon`/`icon-sm`/`icon-lg`/`xs`/`sm` size variants are deliberately compact and are fine for dense controls (e.g. the chat attach button).
- Destructive actions/errors/negative states use `text-destructive` / `bg-destructive` / `bg-destructive/10` / `hover:bg-destructive/90` — never raw `text-red-*`/`bg-red-*`.
- No new `lucide-react` imports in hand-written page/feature code. Existing imports already in a file (e.g. `Paperclip` in `CallChatPanel.tsx`) may stay — they predate the policy and are functional (attach-file affordance), not decorative. Prefer `Badge` (color + text) over an icon+label pairing for status displays (call status, doctor availability, transaction status).
- List-style "card" rows (a row of data in a list, not a form container) use the plain-div pattern already established in `packages/web/src/pages/kiosk/Dashboard.tsx`: `rounded-lg bg-card p-5 shadow-sm` (no `Card` component wrapper, no ring). Form/panel containers use `rounded-xl bg-card p-6 shadow-sm` (or `p-8` for a single large form like registration).
- `PulseRing` (`packages/web/src/components/brand/PulseRing.tsx`, `import { PulseRing } from "../../components/brand/PulseRing"`) is the signature loading element — full-screen "waiting to connect" moments only, never a button-level or inline spinner. `<PulseRing size="lg" />`.
- Headings use `font-display` (`text-2xl font-bold text-foreground` for page `h1`, `text-xl font-bold text-foreground` or `text-lg font-semibold text-foreground` for section headers) — body text uses the default `font-sans` (Manrope), no explicit class needed.
- No test framework exists in `packages/web`. Verification for every task is: `npm run typecheck --workspace @madamgy/web` (must pass with zero errors) plus a manual read-through of the diff against this plan's target code. Do not invent a test framework.
- Never add a `Co-Authored-By: Claude` or any AI-attribution trailer to any commit message.
- Do not touch backend contracts, socket event names/payloads, route paths, Zustand store shapes, or any prop signature — every task is markup/class-only.

---

### Task 1: Doctor registration page

**Files:**
- Modify: `packages/web/src/pages/doctor/Register.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Label` from `packages/web/src/components/ui/{button,input,label}.tsx` (all already vendored, no changes needed).
- No new exports; `DoctorRegister` remains the default export, same props (none — it's a route page).

- [ ] **Step 1: Replace the file content**

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
        className="mx-auto max-w-2xl rounded-xl bg-card p-8 shadow-sm"
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/pages/doctor/Register.tsx
git commit -m "feat: restyle doctor registration page"
```

---

### Task 2: Doctor dashboard

**Files:**
- Modify: `packages/web/src/pages/doctor/Dashboard.tsx`

**Interfaces:**
- Consumes: `Button` from `../../components/ui/button`; `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogTrigger` from `../../components/ui/alert-dialog` (same usage pattern as `packages/web/src/pages/kiosk/Dashboard.tsx:141-159`, already vendored, no changes needed).
- No new exports; `DoctorDashboard` remains the default export.
- Replaces the inline `confirmingDelete` state + manual confirm UI with `AlertDialog` — the `deleteAccount()` function's body and the `/account/me` DELETE call are unchanged, only how the user reaches it changes.

- [ ] **Step 1: Replace the file content**

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
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
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
          <div className="flex gap-3">
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
            <h2 className="mb-2 text-xl font-bold text-foreground">Incoming call</h2>
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/pages/doctor/Dashboard.tsx
git commit -m "feat: restyle doctor dashboard"
```

---

### Task 3: Doctor call history

**Files:**
- Modify: `packages/web/src/pages/doctor/History.tsx`

**Interfaces:**
- Consumes: `Badge` from `../../components/ui/badge` (variant prop: `"default" | "secondary" | "destructive" | "outline" | "ghost" | "link"`, already vendored, no changes needed).
- No new exports; `DoctorHistory` remains the default export.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/pages/doctor/History.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { api } from "../../lib/api";

interface HistoryResponse {
  calls: (CallSession & { patient: { name: string } })[];
  total: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ENDED: "default",
  NO_DOCTOR: "destructive",
};

export default function DoctorHistory() {
  const { data } = useQuery({
    queryKey: ["call-history"],
    queryFn: () => api.get<HistoryResponse>("/calls/history").then((response) => response.data),
  });

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Call history</h1>
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
git add packages/web/src/pages/doctor/History.tsx
git commit -m "feat: restyle doctor call history"
```

---

### Task 4: Wallet panel (shared by doctor, consumed via `doctor/Wallet.tsx`)

**Files:**
- Modify: `packages/web/src/components/wallet/WalletPanel.tsx`

**Interfaces:**
- Consumes: `Badge`, `Button`, `Input`, `Label` from `../ui/{badge,button,input,label}` (already vendored).
- No new exports; default export `WalletPanel`, same `{ apiBasePath: string }` props. `packages/web/src/pages/doctor/Wallet.tsx` (`export default function DoctorWallet() { return <WalletPanel apiBasePath="/doctor" />; }`) needs no changes — verify it still renders correctly after this task, but do not modify it.

- [ ] **Step 1: Replace the file content**

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
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Withdrawal request failed")),
  });

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-2xl font-bold text-foreground">Wallet</h1>
        <div className="mb-8 mt-6 rounded-xl bg-card p-6 shadow-sm">
          <p className="mb-1 text-muted-foreground">Available balance</p>
          <p className="text-4xl font-bold text-primary">Rs. {wallet?.balance ?? "-"}</p>
        </div>

        <form onSubmit={handleSubmit((data) => withdraw.mutate(data))} className="mb-8 rounded-xl bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-foreground">Request withdrawal</h2>
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

        <h2 className="mb-4 text-xl font-bold text-foreground">Transactions</h2>
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
git add packages/web/src/components/wallet/WalletPanel.tsx
git commit -m "feat: restyle wallet panel"
```

---

### Task 5: Call chat cluster (vitals form, chat panel, chat image message)

**Files:**
- Modify: `packages/web/src/components/kiosk/VitalsForm.tsx`
- Modify: `packages/web/src/components/call/CallChatPanel.tsx`
- Modify: `packages/web/src/components/call/ChatImageMessage.tsx`

**Interfaces:**
- `VitalsForm` consumes `Input` from `../ui/input`. Props unchanged: `{ value: Vitals; onChange: (value: Vitals) => void }`, named export `VitalsForm`.
- `CallChatPanel` consumes `Button`, `Input` from `../ui/{button,input}`, `VitalsForm` from `../kiosk/VitalsForm`, `ChatImageMessage` from `./ChatImageMessage` (all unchanged signatures). Props unchanged: `{ callSessionId: string }`, named export `CallChatPanel`. This component is shared by both `packages/web/src/pages/doctor/Call.tsx` (Task 7) and the already-restyled `packages/web/src/pages/kiosk/Consult.tsx` — restyling it here updates both call screens.
- `ChatImageMessage` has no consumed UI primitives (plain `<img>`/`<a>` with token classes). Props unchanged: `{ imageKey: string }`, named export `ChatImageMessage`.
- The existing `import { Paperclip } from "lucide-react"` in `CallChatPanel.tsx` stays — it predates the icon policy and is a functional attach-file affordance, not decoration.

- [ ] **Step 1: Replace `VitalsForm.tsx`**

Replace the entire contents of `packages/web/src/components/kiosk/VitalsForm.tsx` with:

```tsx
import type { Vitals } from "@madamgy/api-client";
import { Input } from "../ui/input";

interface VitalsFormProps {
  value: Vitals;
  onChange: (value: Vitals) => void;
}

export function VitalsForm({ value, onChange }: VitalsFormProps) {
  function setNumber(key: keyof Vitals, rawValue: string): void {
    onChange({ ...value, [key]: rawValue ? Number(rawValue) : undefined });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        type="number"
        value={value.weightKg ?? ""}
        onChange={(event) => setNumber("weightKg", event.target.value)}
        placeholder="Weight (kg)"
      />
      <Input
        type="number"
        value={value.heightCm ?? ""}
        onChange={(event) => setNumber("heightCm", event.target.value)}
        placeholder="Height (cm)"
      />
      <Input
        value={value.bp ?? ""}
        onChange={(event) => onChange({ ...value, bp: event.target.value || undefined })}
        placeholder="Blood pressure"
      />
      <Input
        type="number"
        value={value.spo2 ?? ""}
        onChange={(event) => setNumber("spo2", event.target.value)}
        placeholder="SpO2"
      />
    </div>
  );
}
```

- [ ] **Step 2: Replace `CallChatPanel.tsx`**

Replace the entire contents of `packages/web/src/components/call/CallChatPanel.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Vitals } from "@madamgy/api-client";
import { Paperclip } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { VitalsForm } from "../kiosk/VitalsForm";
import { ChatImageMessage } from "./ChatImageMessage";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { connectSocket, getSocket } from "../../lib/socket";
import { useAuthStore } from "../../store/auth.store";

type ChatMessageWithSender = ChatMessage & { sender?: { id: string; name: string } };

interface CallChatPanelProps {
  callSessionId: string;
}

const emptyVitals: Vitals = {};

export function CallChatPanel({ callSessionId }: CallChatPanelProps) {
  const user = useAuthStore((state) => state.user);
  const [messages, setMessages] = useState<ChatMessageWithSender[]>([]);
  const [text, setText] = useState("");
  const [showVitals, setShowVitals] = useState(false);
  const [vitals, setVitals] = useState<Vitals>(emptyVitals);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const socket = connectSocket();
    socket.on("chat:message", (message: ChatMessageWithSender) => {
      if (message.callSessionId === callSessionId) {
        setMessages((current) => [...current, message]);
      }
    });

    return () => {
      socket.off("chat:message");
    };
  }, [callSessionId]);

  function sendText(): void {
    const content = text.trim();
    if (!content) {
      return;
    }

    getSocket().emit("chat:send", { type: "TEXT", callSessionId, content });
    setText("");
  }

  function sendVitals(): void {
    const hasVitals = Object.values(vitals).some((value) => value !== undefined && value !== "");
    if (!hasVitals) {
      return;
    }

    getSocket().emit("chat:send", { type: "VITALS", callSessionId, vitals });
    setVitals(emptyVitals);
    setShowVitals(false);
  }

  async function sendImage(file: File): Promise<void> {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("callSessionId", callSessionId);
      const response = await api.post<{ imageKey: string }>("/chat/upload", formData);
      getSocket().emit("chat:send", { type: "IMAGE", callSessionId, imageKey: response.data.imageKey });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't send that file. Try again."));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl bg-card shadow-sm">
      <div className="border-b border-input px-4 py-3">
        <h3 className="font-semibold text-foreground">Call chat</h3>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No messages yet</p>}
        {messages.map((message) => {
          const own = message.senderId === user?.id;
          return (
            <div
              key={message.id}
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                own ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted text-foreground"
              }`}
            >
              <p className="mb-1 text-xs opacity-70">{own ? "You" : message.sender?.name ?? "Participant"}</p>
              {message.type === "TEXT" && <p>{message.content}</p>}
              {message.type === "IMAGE" && message.imageKey && <ChatImageMessage imageKey={message.imageKey} />}
              {message.type === "VITALS" && (
                <div className="text-sm">
                  <p className="font-semibold">Vitals</p>
                  {message.vitals?.weightKg && <p>Weight: {message.vitals.weightKg} kg</p>}
                  {message.vitals?.heightCm && <p>Height: {message.vitals.heightCm} cm</p>}
                  {message.vitals?.bp && <p>BP: {message.vitals.bp}</p>}
                  {message.vitals?.spo2 && <p>SpO2: {message.vitals.spo2}%</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showVitals && (
        <div className="border-t border-input p-4">
          <VitalsForm value={vitals} onChange={setVitals} />
          <Button type="button" onClick={sendVitals} className="mt-3 w-full">
            Send vitals
          </Button>
        </div>
      )}
      <div className="flex gap-2 border-t border-input p-3">
        <Button type="button" variant="outline" onClick={() => setShowVitals((current) => !current)}>
          Vitals
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              void sendImage(file);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              sendText();
            }
          }}
          placeholder="Type message"
          className="min-w-0 flex-1"
        />
        <Button type="button" onClick={sendText}>
          Send
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `ChatImageMessage.tsx`**

Replace the entire contents of `packages/web/src/components/call/ChatImageMessage.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface ChatImageMessageProps {
  imageKey: string;
}

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

function isImageKey(key: string): boolean {
  const lower = key.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function ChatImageMessage({ imageKey }: ChatImageMessageProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["chat-image-url", imageKey],
    queryFn: () => api.get<{ url: string }>("/chat/image-url", { params: { key: imageKey } }).then((response) => response.data.url),
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading attachment...</p>;
  }

  if (isImageKey(imageKey)) {
    return <img src={data} alt="Shared attachment" className="max-w-full rounded-lg" />;
  }

  return (
    <a href={data} target="_blank" rel="noreferrer" className="underline">
      View document
    </a>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 5: Commit**

```fish
git add packages/web/src/components/kiosk/VitalsForm.tsx packages/web/src/components/call/CallChatPanel.tsx packages/web/src/components/call/ChatImageMessage.tsx
git commit -m "feat: restyle vitals form and call chat panel"
```

---

### Task 6: Patient history panel

**Files:**
- Modify: `packages/web/src/components/call/PatientHistoryPanel.tsx`

**Interfaces:**
- No shadcn primitives needed (plain `<a>`/`<details>` with token classes). No new exports; named export `PatientHistoryPanel`, props unchanged: `{ patientId: string }`. Consumed by `packages/web/src/pages/doctor/Call.tsx` (Task 7).

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/components/call/PatientHistoryPanel.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import axios from "axios";
import type { HealthFile, Prescription } from "@madamgy/api-client";
import { api } from "../../lib/api";

interface PatientRecords {
  healthFiles: HealthFile[];
  prescriptions: Prescription[];
}

interface PatientHistoryPanelProps {
  patientId: string;
}

function extractPlainText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const typed = node as { type?: string; text?: string; content?: unknown[] };
  if (typed.type === "text" && typeof typed.text === "string") {
    return typed.text;
  }
  if (Array.isArray(typed.content)) {
    return typed.content.map(extractPlainText).join(" ");
  }

  return "";
}

export function PatientHistoryPanel({ patientId }: PatientHistoryPanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["patient-records", patientId],
    queryFn: () => api.get<PatientRecords>(`/doctor/patients/${patientId}/records`).then((response) => response.data),
    retry: false,
  });

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading history...</p>;
  }

  if (axios.isAxiosError(error) && error.response?.status === 403) {
    return <p className="p-4 text-sm text-muted-foreground">No prior consultation history with this patient.</p>;
  }

  if (error || !data) {
    return <p className="p-4 text-sm text-destructive">We couldn't load patient history.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h4 className="mb-2 font-semibold text-foreground">Health files</h4>
        {data.healthFiles.length === 0 && <p className="text-sm text-muted-foreground">No health files.</p>}
        <div className="flex flex-col gap-2">
          {data.healthFiles.map((file) => (
            <a
              key={file.id}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-input p-3 text-sm hover:bg-muted"
            >
              <p className="font-medium text-foreground">{file.name}</p>
              <p className="text-muted-foreground">
                {file.type === "PRESCRIPTION" ? "Prescription" : file.type === "LAB_REPORT" ? "Lab report" : "Other"} -{" "}
                {format(new Date(file.createdAt), "dd MMM yyyy")}
              </p>
            </a>
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-2 font-semibold text-foreground">Past prescriptions</h4>
        {data.prescriptions.length === 0 && <p className="text-sm text-muted-foreground">No past prescriptions.</p>}
        <div className="flex flex-col gap-2">
          {data.prescriptions.map((prescription) => (
            <details key={prescription.id} className="rounded-lg border border-input p-3 text-sm">
              <summary className="cursor-pointer font-medium text-foreground">
                {format(new Date(prescription.createdAt), "dd MMM yyyy")}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{extractPlainText(prescription.content) || "No content"}</p>
            </details>
          ))}
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
git add packages/web/src/components/call/PatientHistoryPanel.tsx
git commit -m "feat: restyle patient history panel"
```

---

### Task 7: Doctor call screen (video + prescription editor + chat/history tabs)

**Files:**
- Modify: `packages/web/src/pages/doctor/Call.tsx`

**Interfaces:**
- Consumes: `Button` from `../../components/ui/button`; `PulseRing` from `../../components/brand/PulseRing` (`<PulseRing size="lg" />`, full-screen waiting-for-connection state — mirrors the existing `PulseRing` usage in `packages/web/src/pages/kiosk/Consult.tsx:137,165` for the patient side of the same call, just the doctor's view of it); `CallChatPanel` (Task 5), `PatientHistoryPanel` (Task 6) — both already restyled by this point, no changes needed to how `Call.tsx` invokes them. `DoctorCallView` (`packages/web/src/components/video/DoctorCallView.tsx`) needs no changes — it has no hand-authored Tailwind classes of its own (LiveKit styles come from `@livekit/components-styles`).
- No shadcn `Tabs` primitive is vendored in this project — the chat/history switcher stays hand-rolled buttons, restyled with token classes instead of raw Tailwind colors.
- No new exports; `DoctorCall` remains the default export.

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
      <div className="h-[55vh]">
        <DoctorCallView
          token={storedLivekitToken}
          serverUrl={import.meta.env.VITE_LIVEKIT_URL ?? "ws://localhost:7880"}
          onDisconnected={() => navigate("/doctor")}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 border-t border-input bg-background p-4 lg:grid-cols-[1fr_24rem]">
        <div className="flex min-h-0 flex-col">
          <h3 className="mb-2 text-lg font-semibold text-foreground">Prescription</h3>
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
git commit -m "feat: restyle doctor call screen"
```

---

### Task 8: Whole-branch review and fix round

**Files:** None pre-specified — scope is whatever Tasks 1-7 touched, plus a check of `packages/web/src/pages/doctor/Wallet.tsx` (should need zero changes since it's a thin wrapper around Task 4's `WalletPanel`).

- [ ] **Step 1: Production build**

Run: `npx vite build` from `packages/web/`
Expected: builds with zero errors. This is the step that has historically caught invalid-CSS issues (e.g. v4-only Tailwind syntax) that typecheck alone misses — re-verify no such syntax was introduced, though Tasks 1-7 only use classes already proven-compatible by the earlier patient-flow pass.

- [ ] **Step 2: Dispatch a final code-reviewer subagent**

Use `superpowers:requesting-code-review`'s `code-reviewer.md` template. Point it at the diff for the full range this plan covers (`git merge-base main HEAD` through `HEAD`, generated via this skill's `scripts/review-package`). Give it this plan's Global Constraints section verbatim as its attention lens. It should specifically check:
- No raw Tailwind color utilities (`blue-*`, `red-*`, `gray-*`, `green-*`) remain in any of the 8 touched files.
- Every primary interactive control (buttons, inputs) is the default `h-11` size, not a hand-rolled smaller touch target.
- No new `lucide-react` imports were introduced beyond the pre-existing `Paperclip` in `CallChatPanel.tsx`.
- `PulseRing` appears only in the one full-screen waiting state in `Call.tsx`, not anywhere else.
- The `AlertDialog`-based delete-account flow in `Dashboard.tsx` calls the same `/account/me` DELETE endpoint the original inline-confirm version called, with no behavior change.

- [ ] **Step 3: Fix any Critical/Important findings**

Dispatch one fix subagent with the complete findings list (not one per finding). Re-run `npm run typecheck --workspace @madamgy/web` and `npx vite build` after fixes land, then re-review.

- [ ] **Step 4: Hand off**

Once the review is clean, use `superpowers:finishing-a-development-branch` to close out (this project's established precedent from the patient-flow plan: direct commits on `main`, then push to `origin/main` once confirmed with the user — do not create a separate feature branch unless asked).
