import { describe, expect, it } from "vitest";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DateOfBirthSchema, DoctorRegisterSchema, PatientLoginSchema,
  PatientRegisterInitiateSchema, PrescriptionSchema, SubmitPrescriptionSchema,
} from "@madamgy/api-client";

const doctor = {
  phone: "9900000123", name: "Synthetic Doctor", password: "password123",
  degree: "MBBS", regNumber: "TEST-123", regYear: "2015", regType: "Test council",
  email: "doctor+test@example.com", gender: "FEMALE" as const, dob: "29/02/1992",
  experienceYears: "5", city: "Pune", state: "Maharashtra", address: "Test clinic",
  about: "Synthetic registration", specializations: ["General Medicine"],
  educations: [{ degree: "MBBS", institution: "Test college", year: "2015" }],
};
const options = { fields: {}, shouldUseNativeValidation: false } as const;

describe("shared validation and form contracts", () => {
  it("returns login field errors instead of rejecting the resolver promise", async () => {
    const result = await zodResolver(PatientLoginSchema)({ phone: "12", pin: "abcd" }, {}, options);
    expect(result.values).toEqual({});
    expect(result.errors.phone?.message).toBe("Enter a valid phone number");
    expect(result.errors.pin?.message).toBe("PIN must be 4 digits");
  });

  it("keeps the required message for an unselected doctor gender", () => {
    const { gender: _gender, ...input } = doctor;
    const result = DoctorRegisterSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ["gender"], message: "Required" }));
  });

  it("coerces the doctor's numeric input and preserves nested registration values", async () => {
    const result = await zodResolver(DoctorRegisterSchema)(doctor, {}, options);
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ ...doctor, experienceYears: 5 });
  });

  it("maps nested qualification and experience errors to their form fields", async () => {
    const result = await zodResolver(DoctorRegisterSchema)({
      ...doctor, experienceYears: "-1", educations: [{ degree: "", institution: "" }],
    }, {}, options);
    expect(result.errors.experienceYears?.message).toBe("Enter years of experience");
    expect(result.errors.educations?.[0]?.degree?.message).toBe("Enter the degree");
    expect(result.errors.educations?.[0]?.institution?.message).toBe("Enter the institution");
  });

  it("rejects impossible dates and keeps the existing date message", () => {
    expect(DateOfBirthSchema.parse("29/02/1992")).toBe("29/02/1992");
    for (const value of ["29/02/1991", "31/04/1990", "1990-01-01", "01/01/1899", "01/01/2999"]) {
      const result = DateOfBirthSchema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toBe("Date of birth must be a valid date in DD/MM/YYYY format");
    }
  });

  it("requires consent and preserves custom email validation", () => {
    const result = PatientRegisterInitiateSchema.safeParse({
      phone: "9900000123", name: "Synthetic Patient", dob: "01/01/1990",
      email: "invalid", consent: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ["email"], message: "Enter a valid email address" }),
        expect.objectContaining({ path: ["consent"] }),
      ]));
    }
  });

  it("round-trips arbitrary nested prescription content through request and response schemas", () => {
    const content = { diagnosis: "Test", medicines: [{ name: "Test tablet", dose: "1", days: 3 }],
      flags: [true, null], extra: { "a+b %": "Unicode: α" } };
    const request = SubmitPrescriptionSchema.parse({ callSessionId: "call-1", content });
    expect(request).toEqual({ callSessionId: "call-1", content });
    expect(PrescriptionSchema.parse({
      ...request, id: "rx-1", patientId: "patient-1", doctorId: "doctor-1",
      objectKey: null, pdfReady: false, createdAt: "2026-11-12T00:00:00Z",
    }).content).toEqual(content);
    for (const invalid of [null, [], "text"]) {
      expect(SubmitPrescriptionSchema.safeParse({ callSessionId: "call-1", content: invalid }).success).toBe(false);
    }
  });
});
