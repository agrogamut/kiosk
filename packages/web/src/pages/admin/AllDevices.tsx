import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import type { Kiosk } from "@madamgy/api-client";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

type KioskWithOwner = Kiosk & { admin: { id: string; name: string; phone: string } };

export default function AdminAllDevices() {
  const queryClient = useQueryClient();
  const {
    data: devices,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-all-kiosk-devices"],
    queryFn: () => api.get<KioskWithOwner[]>("/admin/kiosk-devices/all").then((response) => response.data),
  });

  const forceDeactivate = useMutation({
    mutationFn: (deviceId: string) => api.delete(`/admin/kiosk-devices/${deviceId}/force`),
    onSuccess: () => {
      toast.success("Device deactivated");
      void queryClient.invalidateQueries({ queryKey: ["admin-all-kiosk-devices"] });
    },
    onError: (mutationError: unknown) => toast.error(getApiErrorMessage(mutationError, "Failed to deactivate device")),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display mb-2 text-2xl font-bold text-foreground">Kiosk devices</h1>
      <p className="mb-8 text-muted-foreground">Every kiosk device registered across all kiosk owners.</p>
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load devices.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <div className="flex flex-col gap-3">
          {devices?.map((device) => (
            <div key={device.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
              <div>
                <p className="font-bold text-foreground">{device.label || device.deviceId}</p>
                <p className="text-sm text-muted-foreground">{device.deviceId}</p>
                <p className="text-xs text-muted-foreground">
                  Owner:{" "}
                  <Link to={`/admin/users/${device.admin.id}`} className="text-primary hover:underline">
                    {device.admin.name}
                  </Link>{" "}
                  ({device.admin.phone}) - Registered {format(new Date(device.createdAt), "dd MMM yyyy")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={device.active ? "default" : "secondary"}>{device.active ? "Active" : "Inactive"}</Badge>
                {device.active && (
                  <Button variant="destructive" onClick={() => forceDeactivate.mutate(device.deviceId)}>
                    Deactivate
                  </Button>
                )}
              </div>
            </div>
          ))}
          {devices?.length === 0 && <p className="text-muted-foreground">No kiosk devices registered yet.</p>}
        </div>
      )}
    </div>
  );
}
