import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { api } from "../../lib/api";

interface AdminUser {
  id: string;
  name: string;
  phone: string;
  role: string;
  disabled: boolean;
  createdAt: string;
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/admin/users").then((response) => response.data),
  });
  const toggle = useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => api.put(`/admin/users/${id}/disable`, { disabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Updated");
    },
    onError: () => toast.error("Update failed"),
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Users</h1>
      <div className="flex flex-col gap-3">
        {users?.map((user) => (
          <div key={user.id} className="flex items-center justify-between gap-4 rounded-lg bg-card p-5 shadow-sm">
            <Link to={`/admin/users/${user.id}`} className="flex-1">
              <p className="font-bold text-primary hover:underline">{user.name}</p>
              <p className="text-sm text-muted-foreground">
                {user.phone} - {user.role} - {format(new Date(user.createdAt), "dd MMM yyyy")}
              </p>
            </Link>
            <Button
              variant={user.disabled ? "default" : "destructive"}
              onClick={() => toggle.mutate({ id: user.id, disabled: !user.disabled })}
            >
              {user.disabled ? "Enable" : "Disable"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
