import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { DoctorRegisterSchema, type DoctorRegister, type Gender } from "@madamgy/api-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { api } from "../../lib/api";
import { getApiErrorMessage } from "../../lib/errors";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

function formatDateOfBirthInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function DoctorRegister() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [licenseDocument, setLicenseDocument] = useState<File | null>(null);
  const [gender, setGender] = useState<Gender | "">("");
  const [specializationInput, setSpecializationInput] = useState("");
  const [specializations, setSpecializations] = useState<string[]>([]);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<DoctorRegister>({
    resolver: zodResolver(DoctorRegisterSchema),
    defaultValues: {
      educations: [{ degree: "", institution: "", year: "" }],
      experiences: [],
      hospitals: [],
      specializations: [],
    },
  });
  const dobRegistration = register("dob");

  const educationArray = useFieldArray({ control, name: "educations" });
  const experienceArray = useFieldArray({ control, name: "experiences" });
  const hospitalArray = useFieldArray({ control, name: "hospitals" });

  function selectGender(value: Gender): void {
    setGender(value);
    setValue("gender", value, { shouldValidate: true });
  }

  function addSpecialization(): void {
    const value = specializationInput.trim();
    if (!value || specializations.includes(value)) {
      setSpecializationInput("");
      return;
    }
    const next = [...specializations, value];
    setSpecializations(next);
    setValue("specializations", next, { shouldValidate: true });
    setSpecializationInput("");
  }

  function removeSpecialization(value: string): void {
    const next = specializations.filter((item) => item !== value);
    setSpecializations(next);
    setValue("specializations", next, { shouldValidate: true });
  }

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
    <div className="min-h-dvh bg-background px-6 py-10">
      <form
        onSubmit={handleSubmit((data) => void submit(data))}
        className="mx-auto max-w-2xl rounded-xl bg-card p-8 shadow-sm lg:max-w-3xl"
      >
        <h1 className="font-display text-2xl font-bold text-foreground">Doctor registration</h1>
        <p className="mb-6 mt-1 text-muted-foreground">Admin approval is required before you can sign in.</p>

        <h2 className="mb-3 font-display text-lg font-semibold text-foreground">Account</h2>
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
            <Label htmlFor="email" className="mb-1.5">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="mt-1 text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div>
            <Label htmlFor="altMobile" className="mb-1.5">Alternate mobile (optional)</Label>
            <Input id="altMobile" type="tel" {...register("altMobile")} />
          </div>
          <div>
            <Label htmlFor="dob" className="mb-1.5">Date of birth</Label>
            <Input
              id="dob"
              {...dobRegistration}
              onChange={(event) => {
                event.target.value = formatDateOfBirthInput(event.target.value);
                void dobRegistration.onChange(event);
              }}
              placeholder="DD/MM/YYYY"
              inputMode="numeric"
              maxLength={10}
            />
            {errors.dob && <p className="mt-1 text-sm text-destructive">{errors.dob.message}</p>}
          </div>
          <div>
            <Label className="mb-1.5">Gender</Label>
            <div className="flex gap-2">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectGender(option.value)}
                  className={
                    gender === option.value
                      ? "flex h-11 flex-1 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                      : "flex h-11 flex-1 items-center justify-center rounded-full border border-input text-sm font-semibold text-foreground"
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            {errors.gender && <p className="mt-1 text-sm text-destructive">{errors.gender.message}</p>}
          </div>
        </div>

        <h2 className="mb-3 mt-8 font-display text-lg font-semibold text-foreground">Professional details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="degree" className="mb-1.5">Primary degree</Label>
            <Input id="degree" {...register("degree")} />
            {errors.degree && <p className="mt-1 text-sm text-destructive">{errors.degree.message}</p>}
          </div>
          <div>
            <Label htmlFor="experienceYears" className="mb-1.5">Years of experience</Label>
            <Input id="experienceYears" type="number" min={0} {...register("experienceYears")} />
            {errors.experienceYears && <p className="mt-1 text-sm text-destructive">{errors.experienceYears.message}</p>}
          </div>
          <div>
            <Label htmlFor="regNumber" className="mb-1.5">Registration number</Label>
            <Input id="regNumber" {...register("regNumber")} />
            {errors.regNumber && <p className="mt-1 text-sm text-destructive">{errors.regNumber.message}</p>}
          </div>
          <div>
            <Label htmlFor="regYear" className="mb-1.5">Registration year</Label>
            <Input id="regYear" {...register("regYear")} />
            {errors.regYear && <p className="mt-1 text-sm text-destructive">{errors.regYear.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="regType" className="mb-1.5">Registration council/type</Label>
            <Input id="regType" placeholder="e.g. Medical Council of India" {...register("regType")} />
            {errors.regType && <p className="mt-1 text-sm text-destructive">{errors.regType.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5">Specializations</Label>
            <div className="flex gap-2">
              <Input
                value={specializationInput}
                onChange={(event) => setSpecializationInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSpecialization();
                  }
                }}
                placeholder="e.g. Cardiology"
              />
              <Button type="button" variant="outline" onClick={addSpecialization} className="shrink-0">
                Add
              </Button>
            </div>
            {specializations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {specializations.map((item) => (
                  <span key={item} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm text-foreground">
                    {item}
                    <button type="button" onClick={() => removeSpecialization(item)} className="text-muted-foreground hover:text-foreground">
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            {errors.specializations && <p className="mt-1 text-sm text-destructive">{errors.specializations.message}</p>}
          </div>
        </div>

        <h2 className="mb-3 mt-8 font-display text-lg font-semibold text-foreground">Location</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="city" className="mb-1.5">City</Label>
            <Input id="city" {...register("city")} />
            {errors.city && <p className="mt-1 text-sm text-destructive">{errors.city.message}</p>}
          </div>
          <div>
            <Label htmlFor="state" className="mb-1.5">State</Label>
            <Input id="state" {...register("state")} />
            {errors.state && <p className="mt-1 text-sm text-destructive">{errors.state.message}</p>}
          </div>
          <div>
            <Label htmlFor="pincode" className="mb-1.5">Pincode (optional)</Label>
            <Input id="pincode" {...register("pincode")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="address" className="mb-1.5">Practice address</Label>
            <Textarea id="address" {...register("address")} />
            {errors.address && <p className="mt-1 text-sm text-destructive">{errors.address.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="about" className="mb-1.5">About you</Label>
            <Textarea id="about" placeholder="A short bio patients will see" {...register("about")} />
            {errors.about && <p className="mt-1 text-sm text-destructive">{errors.about.message}</p>}
          </div>
        </div>

        <h2 className="mb-3 mt-8 font-display text-lg font-semibold text-foreground">Education</h2>
        <div className="flex flex-col gap-4">
          {educationArray.fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
              <div>
                <Label className="mb-1.5">Degree</Label>
                <Input {...register(`educations.${index}.degree`)} />
              </div>
              <div>
                <Label className="mb-1.5">Institution</Label>
                <Input {...register(`educations.${index}.institution`)} />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="mb-1.5">Year (optional)</Label>
                  <Input {...register(`educations.${index}.year`)} />
                </div>
                {educationArray.fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => educationArray.remove(index)}
                    className="h-11 shrink-0 px-2 text-sm font-semibold text-destructive"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          {errors.educations && !Array.isArray(errors.educations) && (
            <p className="text-sm text-destructive">{errors.educations.message}</p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => educationArray.append({ degree: "", institution: "", year: "" })}
            className="w-fit"
          >
            Add qualification
          </Button>
        </div>

        <h2 className="mb-3 mt-8 font-display text-lg font-semibold text-foreground">Work experience (optional)</h2>
        <div className="flex flex-col gap-4">
          {experienceArray.fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
              <div>
                <Label className="mb-1.5">Organization</Label>
                <Input {...register(`experiences.${index}.organization`)} />
              </div>
              <div>
                <Label className="mb-1.5">Role (optional)</Label>
                <Input {...register(`experiences.${index}.role`)} />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="mb-1.5">Years (optional)</Label>
                  <Input {...register(`experiences.${index}.years`)} placeholder="e.g. 2018-2022" />
                </div>
                <button
                  type="button"
                  onClick={() => experienceArray.remove(index)}
                  className="h-11 shrink-0 px-2 text-sm font-semibold text-destructive"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => experienceArray.append({ organization: "", role: "", years: "" })}
            className="w-fit"
          >
            Add work experience
          </Button>
        </div>

        <h2 className="mb-3 mt-8 font-display text-lg font-semibold text-foreground">Hospital / clinic affiliations (optional)</h2>
        <div className="flex flex-col gap-4">
          {hospitalArray.fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label className="mb-1.5">Name</Label>
                <Input {...register(`hospitals.${index}.name`)} />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="mb-1.5">Address (optional)</Label>
                  <Input {...register(`hospitals.${index}.address`)} />
                </div>
                <button
                  type="button"
                  onClick={() => hospitalArray.remove(index)}
                  className="h-11 shrink-0 px-2 text-sm font-semibold text-destructive"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => hospitalArray.append({ name: "", address: "" })}
            className="w-fit"
          >
            Add affiliation
          </Button>
        </div>

        <h2 className="mb-3 mt-8 font-display text-lg font-semibold text-foreground">Verification</h2>
        <div>
          <Label htmlFor="licenseDocument" className="mb-1.5">Degree certificate or medical license (PDF)</Label>
          <input
            id="licenseDocument"
            type="file"
            accept="application/pdf"
            onChange={(event) => setLicenseDocument(event.target.files?.[0] ?? null)}
            className="flex h-11 w-full items-center rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
          />
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
