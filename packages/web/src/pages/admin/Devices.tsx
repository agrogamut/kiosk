import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { KioskRegisterSchema, type Kiosk, type KioskRegister } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function AdminDevices() {
  const queryClient = useQueryClient();
  const { data: devices } = useQuery({
    queryKey: ["admin-kiosk-devices"],
    queryFn: () => api.get<Kiosk[]>("/admin/kiosk-devices").then((response) => response.data),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<KioskRegister>({ resolver: zodResolver(KioskRegisterSchema) });

  const registerDevice = useMutation({
    mutationFn: (data: KioskRegister) => api.post("/admin/kiosk-devices", data),
    onSuccess: () => {
      toast.success("Device registered");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["admin-kiosk-devices"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to register device")),
  });

  const deactivateDevice = useMutation({
    mutationFn: (deviceId: string) => api.delete(`/admin/kiosk-devices/${deviceId}`),
    onSuccess: () => {
      toast.success("Device deactivated");
      void queryClient.invalidateQueries({ queryKey: ["admin-kiosk-devices"] });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to deactivate device")),
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">My devices</h1>

      <form onSubmit={handleSubmit((data) => registerDevice.mutate(data))} className="mb-8 rounded-xl bg-card p-6 shadow-sm">
        <h2 className="font-display mb-4 text-xl font-bold text-foreground">Register a device</h2>
        <div className="mb-4">
          <Label htmlFor="deviceId" className="mb-1.5">
            Device ID
          </Label>
          <Input id="deviceId" {...register("deviceId")} />
          {errors.deviceId && <p className="mt-1 text-sm text-destructive">{errors.deviceId.message}</p>}
        </div>
        <div className="mb-4">
          <Label htmlFor="label" className="mb-1.5">
            Label (optional)
          </Label>
          <Input id="label" {...register("label")} />
          {errors.label && <p className="mt-1 text-sm text-destructive">{errors.label.message}</p>}
        </div>
        <Button type="submit" disabled={registerDevice.isPending} className="w-full">
          {registerDevice.isPending ? "Registering..." : "Register device"}
        </Button>
      </form>

      <h2 className="font-display mb-4 text-xl font-bold text-foreground">Registered devices</h2>
      <div className="flex flex-col gap-3">
        {devices?.map((device) => (
          <div key={device.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
            <div>
              <p className="font-bold text-foreground">{device.label || device.deviceId}</p>
              <p className="text-sm text-muted-foreground">{device.deviceId}</p>
              <p className="text-xs text-muted-foreground">Registered {format(new Date(device.createdAt), "dd MMM yyyy")}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={device.active ? "default" : "secondary"}>{device.active ? "Active" : "Inactive"}</Badge>
              {device.active && (
                <Button variant="destructive" onClick={() => deactivateDevice.mutate(device.deviceId)}>
                  Deactivate
                </Button>
              )}
            </div>
          </div>
        ))}
        {devices?.length === 0 && <p className="text-muted-foreground">No devices registered yet.</p>}
      </div>
    </div>
  );
}
