import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { DoctorRegisterSchema, type DoctorRegister } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

export default function DoctorRegister() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [licenseDocument, setLicenseDocument] = useState<File | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DoctorRegister>({ resolver: zodResolver(DoctorRegisterSchema) });

  async function submit(data: DoctorRegister): Promise<void> {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("data", JSON.stringify(data));
      if (licenseDocument) {
        formData.append("licenseDocument", licenseDocument);
      }
      await api.post("/auth/doctor/register", formData);
      toast.success("Registration submitted for approval");
      navigate("/doctor/login");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Registration failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <form
        onSubmit={handleSubmit((data) => void submit(data))}
        className="mx-auto max-w-2xl rounded-xl bg-card p-8 shadow-sm"
      >
        <h1 className="font-display text-2xl font-bold text-foreground">Doctor registration</h1>
        <p className="mb-6 mt-1 text-muted-foreground">Admin approval is required before you can sign in.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name" className="mb-1.5">Full name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="phone" className="mb-1.5">Phone</Label>
            <Input id="phone" type="tel" {...register("phone")} />
            {errors.phone && <p className="mt-1 text-sm text-destructive">{errors.phone.message}</p>}
          </div>
          <div>
            <Label htmlFor="password" className="mb-1.5">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="mt-1 text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div>
            <Label htmlFor="degree" className="mb-1.5">Degree</Label>
            <Input id="degree" {...register("degree")} />
            {errors.degree && <p className="mt-1 text-sm text-destructive">{errors.degree.message}</p>}
          </div>
          <div>
            <Label htmlFor="regNumber" className="mb-1.5">Registration number</Label>
            <Input id="regNumber" {...register("regNumber")} />
            {errors.regNumber && <p className="mt-1 text-sm text-destructive">{errors.regNumber.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="specialization" className="mb-1.5">Specialization</Label>
            <Input id="specialization" {...register("specialization")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="licenseDocument" className="mb-1.5">Degree certificate or medical license (PDF)</Label>
            <input
              id="licenseDocument"
              type="file"
              accept="application/pdf"
              onChange={(event) => setLicenseDocument(event.target.files?.[0] ?? null)}
              className="flex h-11 w-full items-center rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
            />
          </div>
        </div>
        <Button type="submit" disabled={submitting || !licenseDocument} className="mt-6 w-full rounded-full text-lg">
          {submitting ? "Submitting..." : "Submit registration"}
        </Button>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already approved?{" "}
          <Link to="/doctor/login" className="font-semibold text-primary">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
