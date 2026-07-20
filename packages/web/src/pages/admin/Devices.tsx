import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { KioskRegisterSchema, type Kiosk, type KioskRegister } from "@madamgy/api-client";
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
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-3xl font-bold">My Devices</h1>

      <form
        onSubmit={handleSubmit((data) => registerDevice.mutate(data))}
        className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-bold">Register a Device</h2>
        <div className="mb-4">
          <label className="mb-1 block text-sm text-gray-600">Device ID</label>
          <input {...register("deviceId")} className="w-full rounded-xl border-2 p-3" />
          {errors.deviceId && <p className="mt-1 text-sm text-red-500">{errors.deviceId.message}</p>}
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-sm text-gray-600">Label (optional)</label>
          <input {...register("label")} className="w-full rounded-xl border-2 p-3" />
          {errors.label && <p className="mt-1 text-sm text-red-500">{errors.label.message}</p>}
        </div>
        <button
          type="submit"
          disabled={registerDevice.isPending}
          className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {registerDevice.isPending ? "Registering..." : "Register Device"}
        </button>
      </form>

      <h2 className="mb-4 text-xl font-bold">Registered Devices</h2>
      <div className="flex flex-col gap-3">
        {devices?.map((device) => (
          <div key={device.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div>
              <p className="font-bold">{device.label || device.deviceId}</p>
              <p className="text-sm text-gray-500">{device.deviceId}</p>
              <p className="text-xs text-gray-400">Registered {format(new Date(device.createdAt), "dd MMM yyyy")}</p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${device.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
              >
                {device.active ? "Active" : "Inactive"}
              </span>
              {device.active && (
                <button
                  type="button"
                  onClick={() => deactivateDevice.mutate(device.deviceId)}
                  className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white"
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>
        ))}
        {devices?.length === 0 && <p className="text-gray-500">No devices registered yet.</p>}
      </div>
    </div>
  );
}
