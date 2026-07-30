import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { StaffCreateSchema, type StaffCreate } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
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

const ROLE_OPTIONS: { value: StaffCreate["role"]; label: string }[] = [
  { value: "PATIENT", label: "Patient" },
  { value: "DOCTOR", label: "Doctor" },
  { value: "ADMIN", label: "Kiosk Owner" },
];

function CreateUserDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<StaffCreate["role"]>("PATIENT");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [degree, setDegree] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (data: StaffCreate) => api.post<{ role: string; tempPin: string | null }>("/admin/staff", data),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-doctors"] });
      toast.success(
        response.data.tempPin
          ? `User created. Temporary password: ${response.data.tempPin}`
          : "User created. They can log in with an OTP to their phone.",
        { duration: response.data.tempPin ? 15000 : 4000 },
      );
      setOpen(false);
      setPhone("");
      setName("");
      setDegree("");
      setRegNumber("");
      setSpecialization("");
      setRole("PATIENT");
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create user")),
  });

  function submit(): void {
    setFieldError(null);
    const payload =
      role === "DOCTOR"
        ? { role, phone, name, degree, regNumber, specialization: specialization || undefined }
        : { role, phone, name };
    const parsed = StaffCreateSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Check the form fields");
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a user</DialogTitle>
          <DialogDescription>Add a patient, doctor, or kiosk owner directly, bypassing OTP.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label className="mb-1.5">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as StaffCreate["role"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="create-user-name" className="mb-1.5">
              Name
            </Label>
            <Input id="create-user-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="create-user-phone" className="mb-1.5">
              Phone
            </Label>
            <Input id="create-user-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
          {role === "DOCTOR" && (
            <>
              <div>
                <Label htmlFor="create-user-degree" className="mb-1.5">
                  Medical degree
                </Label>
                <Input id="create-user-degree" value={degree} onChange={(event) => setDegree(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="create-user-reg" className="mb-1.5">
                  Registration number
                </Label>
                <Input id="create-user-reg" value={regNumber} onChange={(event) => setRegNumber(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="create-user-spec" className="mb-1.5">
                  Specialization (optional)
                </Label>
                <Input
                  id="create-user-spec"
                  value={specialization}
                  onChange={(event) => setSpecialization(event.target.value)}
                />
              </div>
            </>
          )}
          {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={create.isPending} className="w-full">
            {create.isPending ? "Creating..." : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-foreground">Users</h1>
        <CreateUserDialog />
      </div>
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
