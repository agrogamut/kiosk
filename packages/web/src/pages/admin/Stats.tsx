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
    <div className="mx-auto max-w-5xl">
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
