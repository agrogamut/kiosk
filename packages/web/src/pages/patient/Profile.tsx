import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { KioskHeader } from "../../components/layout/KioskHeader";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";
import { logout } from "../../lib/logout";
import { useAuthStore } from "../../store/auth.store";

// Deliberately string-slice rather than parse into a Date: the server stores/reads dob
// in UTC (parseDateOfBirth uses Date.UTC), so this stays timezone-safe without needing
// a Date object at all. Don't "simplify" this into new Date(iso) — that reintroduces
// local-timezone off-by-one drift.
function isoToDdMmYyyy(iso: string | null): string {
  if (!iso) return "";
  const [yyyy, mm, dd] = iso.slice(0, 10).split("-");
  return `${dd}/${mm}/${yyyy}`;
}

interface PatientProfileResponse {
  phone: string;
  name: string;
  patientProfile: {
    heightCm: number | null;
    weightKg: number | null;
    bloodType: string | null;
    dob: string | null;
  } | null;
}

interface FormState {
  name: string;
  heightCm: string;
  weightKg: string;
  bloodType: string;
  dob: string;
}

const EMPTY_FORM: FormState = { name: "", heightCm: "", weightKg: "", bloodType: "", dob: "" };

export default function Profile() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<PatientProfileResponse>("/users/me")
      .then((response) => {
        const { data } = response;
        setPhone(data.phone);
        setForm({
          name: data.name,
          heightCm: data.patientProfile?.heightCm?.toString() ?? "",
          weightKg: data.patientProfile?.weightKg?.toString() ?? "",
          bloodType: data.patientProfile?.bloodType ?? "",
          dob: isoToDdMmYyyy(data.patientProfile?.dob ?? null),
        });
      })
      .catch((error) => toast.error(getApiErrorMessage(error, "We couldn't load your profile.")))
      .finally(() => setLoading(false));
  }, []);

  async function save(): Promise<void> {
    setSaving(true);
    try {
      await api.put("/users/me", {
        name: form.name || undefined,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        bloodType: form.bloodType || undefined,
        dob: form.dob || undefined,
      });
      useAuthStore.setState((s) => (s.user ? { user: { ...s.user, name: form.name } } : {}));
      toast.success("Profile updated");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "We couldn't save your profile. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function signOut(): Promise<void> {
    await logout();
    navigate("/");
  }

  if (loading) {
    return (
      <div>
        <KioskHeader />
        <div className="mx-auto max-w-md px-6 py-10 text-center text-muted-foreground">Loading your profile...</div>
      </div>
    );
  }

  return (
    <div>
      <KioskHeader />
      <div className="mx-auto max-w-md px-6 py-10 sm:max-w-lg">
        <h1 className="mb-8 font-display text-2xl font-bold text-foreground">Profile</h1>

        <div className="flex flex-col gap-5">
          <div>
            <Label>Phone number</Label>
            <Input value={phone} disabled className="mt-1.5" />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" />
          </div>
          <div>
            <Label>Date of birth (DD/MM/YYYY)</Label>
            <Input
              value={form.dob}
              placeholder="DD/MM/YYYY"
              onChange={(e) => setForm({ ...form, dob: e.target.value })}
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Height (cm)</Label>
              <Input
                type="number"
                value={form.heightCm}
                onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Weight (kg)</Label>
              <Input
                type="number"
                value={form.weightKg}
                onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label>Blood type</Label>
            <Input value={form.bloodType} onChange={(e) => setForm({ ...form, bloodType: e.target.value })} className="mt-1.5" />
          </div>

          <Button onClick={() => void save()} disabled={saving} className="mt-2 w-full rounded-full">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 border-t border-input pt-6">
          <Button variant="outline" onClick={() => void signOut()} className="w-full">
            Log out
          </Button>
          <button type="button" onClick={() => navigate("/delete-account")} className="text-sm text-destructive underline">
            Delete my account
          </button>
        </div>
      </div>
    </div>
  );
}
