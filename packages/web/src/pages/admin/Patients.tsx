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
