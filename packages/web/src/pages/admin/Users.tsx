import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ErrorState } from "../../components/common/ErrorState";
import { SkeletonRows } from "../../components/common/SkeletonRows";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

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
  const {
    data: users,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display mb-8 text-2xl font-bold text-foreground">Users</h1>
      {isLoading && <SkeletonRows />}
      {isError && <ErrorState message={getApiErrorMessage(error, "We couldn't load users.")} onRetry={() => void refetch()} />}
      {!isLoading && !isError && (
        <>
          <div className="space-y-3 md:hidden">
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
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Link to={`/admin/users/${user.id}`} className="font-bold text-primary hover:underline">
                        {user.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.phone}</TableCell>
                    <TableCell className="text-muted-foreground">{user.role}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(user.createdAt), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={user.disabled ? "default" : "destructive"}
                        onClick={() => toggle.mutate({ id: user.id, disabled: !user.disabled })}
                      >
                        {user.disabled ? "Enable" : "Disable"}
                      </Button>
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
