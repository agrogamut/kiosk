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
    <div className="mx-auto max-w-5xl">
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
