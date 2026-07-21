# Admin Panel & Legal Pages Visual Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the admin panel (11 pages) and the two public legal pages up to the same visual design system already shipped for the patient/kiosk flow and the doctor flow — no raw Tailwind defaults (`blue-700`, `gray-50`, `red-600`, `amber-200`, `green-600`), no new behavior.

**Architecture:** Pure restyle pass, same as the doctor-flow plan it follows. Every file keeps its existing props, hooks, query keys, and mutations exactly as-is; only JSX markup and class names change, swapping raw Tailwind utility colors for the design system's semantic tokens and vendored shadcn primitives (`Button`, `Input`, `Label`, `Badge`). `packages/web/src/pages/admin/Wallet.tsx` needs no changes — it's a thin wrapper around `WalletPanel`, which was already restyled by the doctor-flow plan (`packages/web/src/components/wallet/WalletPanel.tsx`).

**Tech Stack:** Same as the doctor-flow plan — React 18.3.1 + Vite (ESM), Tailwind CSS v3.4.19, shadcn/ui primitives already vendored in `packages/web/src/components/ui/`, `react-hook-form` + `zod`, `@tanstack/react-query`, Zustand.

## Global Constraints

- Color/spacing/radius tokens are finalized — use only: `background`, `foreground`, `card`, `card-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `destructive`, `input`, `ring`, `popover`, `popover-foreground`. No raw hex/named-color classes (`blue-*`, `gray-*`, `red-*`, `green-*`, `amber-*`, `slate-*`).
- `Button`/`Input` default size is `h-11` (44px touch target) — use the default size for primary interactive controls.
- Destructive/negative actions (disable user, reject withdrawal, deactivate device, delete account) use `variant="destructive"` on `Button` or `text-destructive`/`bg-destructive` — never raw `text-red-*`/`bg-red-*`. Positive/approve/enable actions use the default `Button` variant (primary token) — never raw `bg-green-*`.
- No new `lucide-react` imports. Prefer `Badge` (color + text) over raw colored `<span>` pills for status displays (doctor approval status, device active/inactive, call status).
- List-style "card" rows use the plain-div pattern: `rounded-lg bg-card p-5 shadow-sm` (no `Card` component wrapper, no ring) — `p-4` for denser rows (audit log, health-file/prescription/call rows in user detail). Form/panel containers use `rounded-xl bg-card p-6 shadow-sm`.
- A row that needs visual emphasis (pending doctor approval, pending withdrawal) uses `ring-1 ring-primary/30` added to the row's classes, matching the doctor-flow plan's incoming-call-card convention — never a raw colored border like `border-2 border-amber-200`.
- Headings: page `h1` is `font-display text-2xl font-bold text-foreground`; section `h2` is `text-lg font-semibold text-foreground` (or `text-xl font-bold text-foreground` for a form's own heading, matching the doctor-flow plan's `WalletPanel` convention) — body text uses the default `font-sans`, no explicit class.
- Page wrapper is `min-h-screen bg-background px-6 py-10` (or `mx-auto max-w-4xl px-6 py-10` / `mx-auto max-w-2xl px-6 py-10` for list/detail pages that were already width-constrained with `max-w-4xl`/`max-w-2xl` in the original) — never `bg-gray-50`.
- This is a **pure restyle**: do not add confirmation dialogs, status badges, or any other element the original file didn't have. Toggle/action buttons that already communicated state via color+label in the original (e.g. "Disable" in red, "Enable" in green) keep doing exactly that, just via `variant="destructive"`/default instead of raw colors — do not also add a redundant status `Badge` next to them.
- No test framework exists in `packages/web`. Verification for every task is `npm run typecheck --workspace @madamgy/web` (zero errors) plus a manual diff read against this plan's target code.
- Never add a `Co-Authored-By: Claude` or any AI-attribution trailer to any commit message.
- Do not touch backend contracts, route paths, Zustand store shapes, or any prop signature.

---

### Task 1: Admin dashboard (nav hub)

**Files:**
- Modify: `packages/web/src/pages/admin/Dashboard.tsx`

**Interfaces:**
- Consumes: `Button` from `../../components/ui/button` (already vendored).

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/pages/admin/Dashboard.tsx` with:

```tsx
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
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
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-foreground">Admin panel</h1>
        <Button variant="outline" onClick={() => void signOut()}>
          Logout
        </Button>
      </div>
      <div className="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
        {links.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="rounded-lg bg-card p-6 text-center text-lg font-semibold text-primary shadow-sm transition-shadow hover:shadow-md"
          >
            {item.label}
          </Link>
        ))}
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
git add packages/web/src/pages/admin/Dashboard.tsx
git commit -m "feat: restyle admin dashboard"
```

---

### Task 2: Doctor approval queue

**Files:**
- Modify: `packages/web/src/pages/admin/Doctors.tsx`

**Interfaces:**
- Consumes: `Badge`, `Button` from `../../components/ui/{badge,button}`.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/pages/admin/Doctors.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api";

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
  const { data: doctors } = useQuery({
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
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Doctors</h1>
      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Pending approval ({pending.length})</h2>
          <div className="flex flex-col gap-3">
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
        </section>
      )}

      <h2 className="mb-4 text-lg font-semibold text-foreground">Approved ({approved.length})</h2>
      <div className="flex flex-col gap-3">
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
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/pages/admin/Doctors.tsx
git commit -m "feat: restyle admin doctor approval queue"
```

---

### Task 3: User and patient lists

**Files:**
- Modify: `packages/web/src/pages/admin/Users.tsx`
- Modify: `packages/web/src/pages/admin/Patients.tsx`

**Interfaces:**
- Both consume: `Button` from `../../components/ui/button`.
- Both keep the same `/admin/users` query key and the same `disable`-toggle mutation shape — restyle only.

- [ ] **Step 1: Replace `Users.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/Users.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api";

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
  const { data: users } = useQuery({
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
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Users</h1>
      <div className="flex flex-col gap-3">
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
    </div>
  );
}
```

- [ ] **Step 2: Replace `Patients.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/Patients.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
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
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Patients</h1>
      <div className="flex flex-col gap-3">
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
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 4: Commit**

```fish
git add packages/web/src/pages/admin/Users.tsx packages/web/src/pages/admin/Patients.tsx
git commit -m "feat: restyle admin user and patient lists"
```

---

### Task 4: User detail page

**Files:**
- Modify: `packages/web/src/pages/admin/UserDetail.tsx`

**Interfaces:**
- No shadcn primitives needed (plain sections/rows with token classes).

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/pages/admin/UserDetail.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { api } from "../../lib/api";

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
  const { data } = useQuery({
    queryKey: ["admin-user-detail", id],
    queryFn: () => api.get<AdminUserDetailData>(`/admin/users/${id}`).then((response) => response.data),
  });

  if (!data) {
    return <div className="p-8 text-foreground">Loading...</div>;
  }

  const { user, healthFiles, prescriptions, callsAsPatient, callsAsDoctor } = data;
  const calls = user.role === "DOCTOR" ? callsAsDoctor : callsAsPatient;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link to={user.role === "DOCTOR" ? "/admin/doctors" : "/admin/users"} className="mb-4 inline-block text-primary hover:underline">
        &larr; Back
      </Link>
      <h1 className="font-display mb-2 text-2xl font-bold text-foreground">{user.name}</h1>
      <p className="mb-8 text-muted-foreground">
        {user.phone} - {user.role} - Joined {format(new Date(user.createdAt), "dd MMM yyyy")} - {user.disabled ? "Disabled" : "Active"}
      </p>

      {user.patientProfile && (
        <section className="mb-8 rounded-xl bg-card p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Patient profile</h2>
          <p className="text-foreground">
            Height: {user.patientProfile.heightCm ?? "-"} cm, Weight: {user.patientProfile.weightKg ?? "-"} kg, Blood type:{" "}
            {user.patientProfile.bloodType ?? "-"}
          </p>
        </section>
      )}

      {user.doctorProfile && (
        <section className="mb-8 rounded-xl bg-card p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-foreground">Doctor profile</h2>
          <p className="text-foreground">
            {user.doctorProfile.degree} - Reg: {user.doctorProfile.regNumber} - {user.doctorProfile.specialization ?? "General"}
          </p>
          <p className="mt-2 text-foreground">
            Approved: {user.doctorProfile.isApproved ? "Yes" : "No"} - Wallet balance: Rs. {user.walletBalance}
          </p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Health folder ({healthFiles.length})</h2>
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
        <h2 className="mb-3 text-lg font-semibold text-foreground">Prescriptions ({prescriptions.length})</h2>
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
        <h2 className="mb-3 text-lg font-semibold text-foreground">Call history ({calls.length})</h2>
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
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/pages/admin/UserDetail.tsx
git commit -m "feat: restyle admin user detail page"
```

---

### Task 5: Stats dashboard and call history

**Files:**
- Modify: `packages/web/src/pages/admin/Stats.tsx`
- Modify: `packages/web/src/pages/admin/Calls.tsx`

**Interfaces:**
- `Calls.tsx` consumes `Badge` from `../../components/ui/badge`, same `STATUS_VARIANT` mapping pattern already used in the doctor-flow plan's `packages/web/src/pages/doctor/History.tsx`.
- `Stats.tsx` needs no shadcn primitives (plain stat cards).

- [ ] **Step 1: Replace `Stats.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/Stats.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface Stats {
  totalPatients: number;
  totalDoctors: number;
  totalCalls: number;
  activeCalls: number;
  totalRx: number;
}

export default function AdminStats() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<Stats>("/admin/stats").then((response) => response.data),
    refetchInterval: 30_000,
  });
  const cards = [
    { label: "Patients", value: data?.totalPatients },
    { label: "Doctors", value: data?.totalDoctors },
    { label: "Total calls", value: data?.totalCalls },
    { label: "Active calls", value: data?.activeCalls },
    { label: "Prescriptions", value: data?.totalRx },
  ];

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-card p-6 shadow-sm">
            <p className="mb-2 text-muted-foreground">{card.label}</p>
            <p className="text-4xl font-bold text-primary">{card.value ?? "-"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `Calls.tsx`**

Replace the entire contents of `packages/web/src/pages/admin/Calls.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { CallSession } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { api } from "../../lib/api";

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
  const { data } = useQuery({
    queryKey: ["admin-calls"],
    queryFn: () => api.get<CallsResponse>("/admin/calls").then((response) => response.data),
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Call history</h1>
      <div className="flex flex-col gap-3">
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
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 4: Commit**

```fish
git add packages/web/src/pages/admin/Stats.tsx packages/web/src/pages/admin/Calls.tsx
git commit -m "feat: restyle admin stats and call history"
```

---

### Task 6: Withdrawal requests

**Files:**
- Modify: `packages/web/src/pages/admin/Withdrawals.tsx`

**Interfaces:**
- Consumes: `Button` from `../../components/ui/button`.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/pages/admin/Withdrawals.tsx` with:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { WalletTransaction } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface WithdrawalRequest extends WalletTransaction {
  user: { id: string; name: string; phone: string; role: "DOCTOR" | "ADMIN" | "PATIENT" | "SUPER_ADMIN" };
}

export default function AdminWithdrawals() {
  const queryClient = useQueryClient();
  const { data: withdrawals } = useQuery({
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
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Withdrawal requests</h1>
      {withdrawals?.length === 0 && <p className="text-muted-foreground">No pending withdrawal requests.</p>}
      <div className="flex flex-col gap-3">
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
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/pages/admin/Withdrawals.tsx
git commit -m "feat: restyle admin withdrawal requests"
```

---

### Task 7: Kiosk device management

**Files:**
- Modify: `packages/web/src/pages/admin/Devices.tsx`

**Interfaces:**
- Consumes: `Badge`, `Button`, `Input`, `Label` from `../../components/ui/{badge,button,input,label}`.

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
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">My devices</h1>

      <form onSubmit={handleSubmit((data) => registerDevice.mutate(data))} className="mb-8 rounded-xl bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-foreground">Register a device</h2>
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

      <h2 className="mb-4 text-xl font-bold text-foreground">Registered devices</h2>
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
git commit -m "feat: restyle admin device management"
```

---

### Task 8: Audit log

**Files:**
- Modify: `packages/web/src/pages/admin/AuditLog.tsx`

**Interfaces:**
- Consumes: `Button` from `../../components/ui/button` for the pagination controls.

- [ ] **Step 1: Replace the file content**

Replace the entire contents of `packages/web/src/pages/admin/AuditLog.tsx` with:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { AuditLog } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
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
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Audit log</h1>
      {role === "ADMIN" && <p className="mb-8 text-sm text-muted-foreground">Showing your own actions only.</p>}
      {role !== "ADMIN" && <div className="mb-8" />}
      <div className="flex flex-col gap-2">
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```fish
git add packages/web/src/pages/admin/AuditLog.tsx
git commit -m "feat: restyle admin audit log"
```

---

### Task 9: Legal pages (delete account, privacy policy)

**Files:**
- Modify: `packages/web/src/pages/legal/DeleteAccount.tsx`
- Modify: `packages/web/src/pages/legal/PrivacyPolicy.tsx`

**Interfaces:**
- `DeleteAccount.tsx` consumes `Button`, `Input` from `../../components/ui/{button,input}`.
- `PrivacyPolicy.tsx` needs no shadcn primitives (static text page).
- Both routes are public and unauthenticated (`packages/web/src/App.tsx:59-60`, `<Route path="/delete-account" .../>` / `<Route path="/privacy-policy" .../>`, outside any `RequireRole` wrapper and outside the app's normal nav) — they stay standalone pages, do not add any shared layout/nav around them.

- [ ] **Step 1: Replace `DeleteAccount.tsx`**

Replace the entire contents of `packages/web/src/pages/legal/DeleteAccount.tsx` with:

```tsx
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function DeleteAccount() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"phone" | "otp" | "done">("phone");
  const [submitting, setSubmitting] = useState(false);

  async function initiate(): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/account/delete/initiate", { phone });
      setStep("otp");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Something went wrong"));
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(): Promise<void> {
    setSubmitting(true);
    try {
      const payload: { phone: string; otp: string; password?: string } = { phone, otp };
      if (password) {
        payload.password = password;
      }
      await api.post("/account/delete/verify", payload);
      setStep("done");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Invalid or expired OTP"));
      setOtp("");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Account deleted</h1>
        <p className="text-muted-foreground">
          Your MadamGy account and personal details have been removed. Any consultation or payment
          records tied to your account are retained only as required for medical record-keeping and
          financial audit.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-background p-8">
      <div>
        <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Delete your MadamGy account</h1>
        <p className="text-muted-foreground">
          This permanently removes your name, contact details, and health profile from MadamGy. This
          cannot be undone. You don't need the app installed to do this.
        </p>
      </div>
      {step === "phone" ? (
        <div className="flex flex-col gap-4">
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number used to register" type="tel" />
          <Button
            variant="destructive"
            disabled={submitting || phone.length < 10}
            onClick={() => void initiate()}
            className="w-full text-lg"
          >
            {submitting ? "Sending..." : "Send verification code"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Input
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            inputMode="numeric"
            className="text-center text-2xl tracking-widest"
          />
          <Input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password (only required for doctor accounts)"
            type="password"
          />
          <Button variant="destructive" disabled={submitting || otp.length !== 6} onClick={() => void verify()} className="w-full text-lg">
            {submitting ? "Deleting..." : "Confirm deletion"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `PrivacyPolicy.tsx`**

Replace the entire contents of `packages/web/src/pages/legal/PrivacyPolicy.tsx` with:

```tsx
export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-2xl bg-background px-6 py-10 text-foreground">
      <h1 className="font-display mb-6 text-2xl font-bold text-foreground">Privacy policy</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Last updated: check this date against the actual publish date before submitting to Play Console.
      </p>

      <h2 className="mb-2 mt-8 text-xl font-bold text-foreground">What we collect</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>
          <strong>Account details:</strong> phone number, full name, date of birth.
        </li>
        <li>
          <strong>Optional profile details:</strong> gender, email address, height, weight, blood type.
        </li>
        <li>
          <strong>Health information:</strong> lab reports and other files you upload, prescriptions issued during a consultation, and
          vitals shared during a call.
        </li>
        <li>
          <strong>Consultation content:</strong> chat messages (text, images, and documents) exchanged with your doctor during a call.
        </li>
        <li>
          <strong>Payment metadata:</strong> consultation fee amount and payment status, processed via Razorpay. We do not store your
          card, UPI, or bank details — Razorpay handles that directly.
        </li>
        <li>
          <strong>For doctors:</strong> degree, registration number, specialization, and license document, used for admin verification
          before approval.
        </li>
      </ul>

      <h2 className="mb-2 mt-8 text-xl font-bold text-foreground">Who can access it</h2>
      <ul className="mb-4 list-disc space-y-2 pl-6">
        <li>The doctor assigned to your consultation can see your health profile, uploaded files, and prior prescriptions with MadamGy, so they can treat you safely.</li>
        <li>Platform administrators can access account and consultation records for support, safety, and compliance purposes.</li>
        <li>We do not sell your personal or health data to third parties.</li>
      </ul>

      <h2 className="mb-2 mt-8 text-xl font-bold text-foreground">How long we keep it</h2>
      <p className="mb-4">
        We retain consultation and prescription records for as long as required by applicable medical
        record-keeping regulations, even after you delete your account, so your treating doctor's
        records remain complete and auditable. Your personal identifying details (name, phone, email,
        and profile information) are removed when you delete your account; consultation records
        associated with your account are retained but no longer linked to your identifying information
        beyond what's necessary for that retention requirement.
      </p>

      <h2 className="mb-2 mt-8 text-xl font-bold text-foreground">Deleting your account</h2>
      <p className="mb-4">
        You can delete your account and personal data at any time from within the app, or without
        installing the app at{" "}
        <a href="/delete-account" className="text-primary underline">
          /delete-account
        </a>
        .
      </p>

      <h2 className="mb-2 mt-8 text-xl font-bold text-foreground">Contact</h2>
      <p className="mb-4">Replace this line with a real support contact email before publishing.</p>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace @madamgy/web`
Expected: no errors.

- [ ] **Step 4: Commit**

```fish
git add packages/web/src/pages/legal/DeleteAccount.tsx packages/web/src/pages/legal/PrivacyPolicy.tsx
git commit -m "feat: restyle legal pages"
```

---

### Task 10: Whole-branch review and fix round

**Files:** None pre-specified — scope is whatever Tasks 1-9 touched, plus a check that `packages/web/src/pages/admin/Wallet.tsx` needed zero changes (thin wrapper around the already-restyled `WalletPanel`).

- [ ] **Step 1: Production build**

Run: `npx vite build` from `packages/web/`
Expected: builds with zero errors.

- [ ] **Step 2: Dispatch a final code-reviewer subagent**

Use `superpowers:requesting-code-review`'s `code-reviewer.md` template. Point it at the diff for the full range this plan covers (`git merge-base main HEAD` through `HEAD`, generated via this skill's `scripts/review-package`). Give it this plan's Global Constraints section verbatim as its attention lens. It should specifically check:
- No raw Tailwind color utilities (`blue-*`, `red-*`, `gray-*`, `green-*`, `amber-*`, `slate-*`) remain in any of the 12 touched files.
- Every primary interactive control is the default `h-11` size.
- Destructive/positive actions consistently map to `variant="destructive"`/default `Button`, never raw colors.
- No status `Badge` or other element was added beyond what the original file rendered (pure restyle, no scope creep).
- The two legal pages (`DeleteAccount.tsx`, `PrivacyPolicy.tsx`) remain fully standalone — no accidental coupling to authenticated app layout/nav.

- [ ] **Step 3: Fix any Critical/Important findings**

Dispatch one fix subagent with the complete findings list. Re-run `npm run typecheck --workspace @madamgy/web` and `npx vite build` after fixes land, then re-review.

- [ ] **Step 4: Hand off**

Once the review is clean, use `superpowers:finishing-a-development-branch` to close out (this project's established precedent: direct commits on `main`, then push to `origin/main` once confirmed with the user).
