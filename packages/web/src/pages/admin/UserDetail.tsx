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
    return <div className="p-8">Loading...</div>;
  }

  const { user, healthFiles, prescriptions, callsAsPatient, callsAsDoctor } = data;
  const calls = user.role === "DOCTOR" ? callsAsDoctor : callsAsPatient;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link to={user.role === "DOCTOR" ? "/admin/doctors" : "/admin/users"} className="mb-4 inline-block text-blue-700 hover:underline">
        &larr; Back
      </Link>
      <h1 className="mb-2 text-3xl font-bold">{user.name}</h1>
      <p className="mb-8 text-gray-500">
        {user.phone} - {user.role} - Joined {format(new Date(user.createdAt), "dd MMM yyyy")} - {user.disabled ? "Disabled" : "Active"}
      </p>

      {user.patientProfile && (
        <section className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold">Patient Profile</h2>
          <p className="text-gray-700">
            Height: {user.patientProfile.heightCm ?? "-"} cm, Weight: {user.patientProfile.weightKg ?? "-"} kg, Blood Type:{" "}
            {user.patientProfile.bloodType ?? "-"}
          </p>
        </section>
      )}

      {user.doctorProfile && (
        <section className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold">Doctor Profile</h2>
          <p className="text-gray-700">
            {user.doctorProfile.degree} - Reg: {user.doctorProfile.regNumber} - {user.doctorProfile.specialization ?? "General"}
          </p>
          <p className="mt-2 text-gray-700">
            Approved: {user.doctorProfile.isApproved ? "Yes" : "No"} - Wallet Balance: Rs. {user.walletBalance}
          </p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Health Folder ({healthFiles.length})</h2>
        <div className="flex flex-col gap-2">
          {healthFiles.map((file) => (
            <div key={file.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              {file.name} - {file.type} - {format(new Date(file.createdAt), "dd MMM yyyy")}
            </div>
          ))}
          {healthFiles.length === 0 && <p className="text-gray-500">No files.</p>}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Prescriptions ({prescriptions.length})</h2>
        <div className="flex flex-col gap-2">
          {prescriptions.map((rx) => (
            <div key={rx.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              {rx.patient.name} with Dr. {rx.doctor.name} - {format(new Date(rx.createdAt), "dd MMM yyyy")} -{" "}
              {rx.pdfReady ? "PDF ready" : "Pending"}
            </div>
          ))}
          {prescriptions.length === 0 && <p className="text-gray-500">No prescriptions.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Call History ({calls.length})</h2>
        <div className="flex flex-col gap-2">
          {calls.map((call) => (
            <div key={call.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              {call.status} - {format(new Date(call.createdAt), "dd MMM yyyy HH:mm")}
            </div>
          ))}
          {calls.length === 0 && <p className="text-gray-500">No calls.</p>}
        </div>
      </section>
    </div>
  );
}
