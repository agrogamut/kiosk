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
