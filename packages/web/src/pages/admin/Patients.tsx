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
