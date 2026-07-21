import { useAuthStore } from "../../store/auth.store";

export default function AdminDashboard() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-foreground">Welcome, {user?.name}</h1>
      <p className="mt-2 text-muted-foreground">Use the navigation to manage the platform.</p>
    </div>
  );
}
