import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../../components/brand/Logo";
import { Card, CardContent } from "../../components/ui/card";
import { PatientRegisterForm } from "../../components/patient/PatientRegisterForm";
import { useAuthStore } from "../../store/auth.store";

export default function KioskRegister() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-6 py-10">
      <Logo className="mb-8 h-10 w-auto" />
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg">
        <h1 className="mb-6 text-center font-display text-3xl font-bold text-foreground">Create account</h1>
        <Card className="rounded-lg border-none ring-0 shadow-[0_8px_24px_-8px_rgba(219,101,145,0.15)]">
          <CardContent className="p-6">
            <PatientRegisterForm
              onSuccess={(response) => {
                setAuth(response.accessToken, response.user);
                navigate("/dashboard");
              }}
              // Login lives on the entry screen, so hand the number over in navigation state
              // rather than making someone type it a second time to be told they already exist.
              onExistingAccount={(existingPhone) => {
                navigate("/", { state: { patientPhone: existingPhone } });
              }}
              footer={
                <p className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/" className="font-semibold text-primary">
                    Log in
                  </Link>
                </p>
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
