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
    { label: "Total Calls", value: data?.totalCalls },
    { label: "Active Calls", value: data?.activeCalls },
    { label: "Prescriptions", value: data?.totalRx },
  ];

  return (
    <div className="p-8">
      <h1 className="mb-8 text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="mb-2 text-gray-500">{card.label}</p>
            <p className="text-4xl font-bold text-blue-700">{card.value ?? "-"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
