import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { RevenueConfigUpdateSchema, type RevenueConfigUpdate } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

interface RevenueConfigResponse {
  consultationFee: string;
  doctorPct: string;
  adminPct: string;
  superAdminPct: string;
}

const FIELDS: { name: keyof RevenueConfigUpdate; label: string; step: string }[] = [
  { name: "consultationFee", label: "Per-call consultation fee (Rs.)", step: "1" },
  { name: "doctorPct", label: "Doctor share (%)", step: "0.01" },
  { name: "adminPct", label: "Admin share (%)", step: "0.01" },
  { name: "superAdminPct", label: "Super admin share (%)", step: "0.01" },
];

export default function AdminPricing() {
  const queryClient = useQueryClient();
  const {
    data: config,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-revenue-config"],
    queryFn: () => api.get<RevenueConfigResponse>("/admin/revenue-config").then((response) => response.data),
  });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<RevenueConfigUpdate>({ resolver: zodResolver(RevenueConfigUpdateSchema) });

  useEffect(() => {
    if (config) {
      reset({
        consultationFee: Number(config.consultationFee),
        doctorPct: Number(config.doctorPct),
        adminPct: Number(config.adminPct),
        superAdminPct: Number(config.superAdminPct),
      });
    }
  }, [config, reset]);

  const update = useMutation({
    mutationFn: (data: RevenueConfigUpdate) => api.put("/admin/revenue-config", data),
    onSuccess: () => {
      toast.success("Pricing updated");
      void queryClient.invalidateQueries({ queryKey: ["admin-revenue-config"] });
    },
    onError: (mutationError: unknown) => toast.error(getApiErrorMessage(mutationError, "Failed to update pricing")),
  });

  const values = watch();
  const pctSum = (values.doctorPct ?? 0) + (values.adminPct ?? 0) + (values.superAdminPct ?? 0);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Pricing</h1>
      <p className="mb-8 text-muted-foreground">Set the per-call consultation fee and how it splits between doctor, admin, and super admin.</p>
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load pricing.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <form onSubmit={handleSubmit((data) => update.mutate(data))} className="rounded-xl bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            {FIELDS.map((field) => (
              <div key={field.name}>
                <Label htmlFor={field.name} className="mb-1.5">
                  {field.label}
                </Label>
                <Input
                  id={field.name}
                  type="number"
                  step={field.step}
                  {...register(field.name, { valueAsNumber: true })}
                />
                {errors[field.name] && <p className="mt-1 text-sm text-destructive">{errors[field.name]?.message}</p>}
              </div>
            ))}
          </div>
          <p className={`mt-4 text-sm ${pctSum === 100 ? "text-muted-foreground" : "text-destructive"}`}>
            Splits total {pctSum}% (must equal 100%)
          </p>
          <Button type="submit" disabled={update.isPending || pctSum !== 100} className="mt-6 w-full rounded-full text-lg">
            {update.isPending ? "Saving..." : "Save pricing"}
          </Button>
        </form>
      )}
    </div>
  );
}
