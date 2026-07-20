import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { DoctorRegisterSchema, type DoctorRegister } from "@madamgy/api-client";
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
    <div className="min-h-screen bg-blue-50 p-8">
      <form onSubmit={handleSubmit((data) => void submit(data))} className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-3xl font-bold text-blue-950">Doctor Registration</h1>
        <p className="mb-6 text-blue-700">Admin approval is required before login.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-600">Full Name</span>
            <input {...register("name")} className="w-full rounded-xl border-2 p-3" />
            {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-600">Phone</span>
            <input {...register("phone")} type="tel" className="w-full rounded-xl border-2 p-3" />
            {errors.phone && <p className="mt-1 text-sm text-red-500">{errors.phone.message}</p>}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-600">Password</span>
            <input {...register("password")} type="password" className="w-full rounded-xl border-2 p-3" />
            {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password.message}</p>}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-600">Degree</span>
            <input {...register("degree")} className="w-full rounded-xl border-2 p-3" />
            {errors.degree && <p className="mt-1 text-sm text-red-500">{errors.degree.message}</p>}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-600">Registration Number</span>
            <input {...register("regNumber")} className="w-full rounded-xl border-2 p-3" />
            {errors.regNumber && <p className="mt-1 text-sm text-red-500">{errors.regNumber.message}</p>}
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-600">Specialization</span>
            <input {...register("specialization")} className="w-full rounded-xl border-2 p-3" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-600">Degree certificate or medical license (PDF)</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setLicenseDocument(event.target.files?.[0] ?? null)}
              className="w-full rounded-xl border-2 p-3"
            />
          </label>
        </div>
        <button type="submit" disabled={submitting || !licenseDocument} className="mt-6 w-full rounded-xl bg-blue-600 py-4 font-semibold text-white disabled:opacity-50">
          {submitting ? "Submitting..." : "Submit Registration"}
        </button>
        <p className="mt-4 text-center text-sm text-gray-600">
          Already approved? <Link to="/doctor/login" className="font-semibold text-blue-700">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
