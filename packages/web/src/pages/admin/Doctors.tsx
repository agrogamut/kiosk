import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
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
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-8 text-3xl font-bold">Doctors</h1>
      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-amber-700">Pending Approval ({pending.length})</h2>
          <div className="flex flex-col gap-3">
            {pending.map((doctor) => (
              <div key={doctor.id} className="flex items-center justify-between rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-sm">
                <div>
                  <p className="text-lg font-bold">{doctor.name}</p>
                  <p className="text-gray-500">
                    {doctor.phone} - {doctor.doctorProfile.degree} - Reg: {doctor.doctorProfile.regNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => approve.mutate(doctor.id)}
                  className="rounded-xl bg-green-600 px-6 py-2 font-semibold text-white hover:bg-green-700"
                >
                  Approve
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <h2 className="mb-4 text-xl font-semibold text-gray-700">Approved ({approved.length})</h2>
      <div className="flex flex-col gap-3">
        {approved.map((doctor) => (
          <div key={doctor.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div>
              <p className="font-bold">{doctor.name}</p>
              <p className="text-sm text-gray-500">
                {doctor.phone} - {doctor.doctorProfile.degree}
              </p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">Approved</span>
          </div>
        ))}
      </div>
    </div>
  );
}
