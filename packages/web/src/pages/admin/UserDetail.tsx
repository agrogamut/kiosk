import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { DoctorProfileUpdateSchema, UserUpdateSchema, type DoctorProfileUpdate, type UserUpdate } from "@madamgy/api-client";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
      licenseDocKey: string | null;
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

function EditUserDialog({ id, name, phone }: { id: string; name: string; phone: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name, phone });
  const [fieldError, setFieldError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (data: UserUpdate) => api.put(`/admin/users/${id}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-user-detail", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User updated");
      setOpen(false);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to update user")),
  });

  function submit(): void {
    setFieldError(null);
    const parsed = UserUpdateSchema.safeParse(form);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Check the form fields");
      return;
    }
    update.mutate(parsed.data);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setForm({ name, phone });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="edit-user-name" className="mb-1.5">
              Name
            </Label>
            <Input
              id="edit-user-name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="edit-user-phone" className="mb-1.5">
              Phone
            </Label>
            <Input
              id="edit-user-phone"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </div>
          {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={update.isPending} className="w-full">
            {update.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDoctorProfileDialog({
  userId,
  degree,
  regNumber,
  specialization,
}: {
  userId: string;
  degree: string;
  regNumber: string;
  specialization: string | null;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ degree, regNumber, specialization: specialization ?? "" });
  const [fieldError, setFieldError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (data: DoctorProfileUpdate) => api.put(`/admin/doctors/${userId}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-doctors"] });
      toast.success("Doctor profile updated");
      setOpen(false);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to update doctor profile")),
  });

  function submit(): void {
    setFieldError(null);
    const parsed = DoctorProfileUpdateSchema.safeParse({
      degree: form.degree,
      regNumber: form.regNumber,
      specialization: form.specialization || undefined,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Check the form fields");
      return;
    }
    update.mutate(parsed.data);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setForm({ degree, regNumber, specialization: specialization ?? "" });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Edit profile</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit doctor profile</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="edit-doctor-degree" className="mb-1.5">
              Medical degree
            </Label>
            <Input
              id="edit-doctor-degree"
              value={form.degree}
              onChange={(event) => setForm((prev) => ({ ...prev, degree: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="edit-doctor-reg" className="mb-1.5">
              Registration number
            </Label>
            <Input
              id="edit-doctor-reg"
              value={form.regNumber}
              onChange={(event) => setForm((prev) => ({ ...prev, regNumber: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="edit-doctor-spec" className="mb-1.5">
              Specialization (optional)
            </Label>
            <Input
              id="edit-doctor-spec"
              value={form.specialization}
              onChange={(event) => setForm((prev) => ({ ...prev, specialization: event.target.value }))}
            />
          </div>
          {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={update.isPending} className="w-full">
            {update.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewLicenseButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);

  async function viewLicense(): Promise<void> {
    setLoading(true);
    try {
      const response = await api.get<{ url: string }>(`/admin/doctors/${userId}/license`);
      window.open(response.data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not load the license document"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" disabled={loading} onClick={() => void viewLicense()}>
      {loading ? "Loading..." : "View license"}
    </Button>
  );
}

function DeleteUserButton({ id, role }: { id: string; role: string }) {
  const navigate = useNavigate();

  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      toast.success("User deleted");
      navigate("/admin/users");
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to delete user")),
  });

  if (role === "SUPER_ADMIN") {
    return null;
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this account?</AlertDialogTitle>
          <AlertDialogDescription>
            This anonymizes the account -- name, phone, and profile details are cleared, and they can no longer log in. Medical
            and financial records tied to them are kept, unchanged. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-user-detail", id],
    queryFn: () => api.get<AdminUserDetailData>(`/admin/users/${id}`).then((response) => response.data),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <PulseRing size="lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl">
        <ErrorState message={getApiErrorMessage(error, "We couldn't load this user.")} onRetry={() => void refetch()} />
      </div>
    );
  }

  const { user, healthFiles, prescriptions, callsAsPatient, callsAsDoctor } = data;
  const calls = user.role === "DOCTOR" ? callsAsDoctor : callsAsPatient;

  return (
    <div className="mx-auto max-w-5xl">
      <Link to={user.role === "DOCTOR" ? "/admin/doctors" : "/admin/users"} className="mb-4 inline-block text-primary hover:underline">
        &larr; Back
      </Link>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-foreground">{user.name}</h1>
        <div className="flex items-center gap-3">
          <EditUserDialog id={user.id} name={user.name} phone={user.phone} />
          <DeleteUserButton id={user.id} role={user.role} />
        </div>
      </div>
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
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="font-display text-lg font-semibold text-foreground">Doctor profile</h2>
              <div className="flex items-center gap-3">
                {user.doctorProfile.licenseDocKey && <ViewLicenseButton userId={user.id} />}
                <EditDoctorProfileDialog
                  userId={user.id}
                  degree={user.doctorProfile.degree}
                  regNumber={user.doctorProfile.regNumber}
                  specialization={user.doctorProfile.specialization}
                />
              </div>
            </div>
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
