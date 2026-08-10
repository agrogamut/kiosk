import type { Vitals } from "@madamgy/api-client";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface VitalsFormProps {
  value: Vitals;
  onChange: (value: Vitals) => void;
}

interface NumericField {
  key: "weightKg" | "heightCm" | "spo2" | "temp";
  label: string;
  unit: string;
  min: number;
  max: number;
  step: string;
}

// Ranges are wide on purpose -- they exist to catch a slipped digit (700 kg, an SpO2 of 985), not
// to second-guess a real reading. SpO2's bounds in particular are enforced by VitalsSchema on the
// server, and the socket handler drops anything that fails to parse without telling anyone, so
// without a matching check here an out-of-range entry just silently never arrives.
const NUMERIC_FIELDS: NumericField[] = [
  { key: "weightKg", label: "Weight", unit: "kg", min: 1, max: 400, step: "0.1" },
  { key: "heightCm", label: "Height", unit: "cm", min: 30, max: 250, step: "0.1" },
  { key: "spo2", label: "SpO2", unit: "%", min: 0, max: 100, step: "1" },
  { key: "temp", label: "Temperature", unit: "°C", min: 30, max: 45, step: "0.1" },
];

function parseBloodPressure(bp: string | undefined): { systolic: string; diastolic: string } {
  const [systolic = "", diastolic = ""] = (bp ?? "").split("/");
  return { systolic: systolic.trim(), diastolic: diastolic.trim() };
}

export function VitalsForm({ value, onChange }: VitalsFormProps) {
  const { systolic, diastolic } = parseBloodPressure(value.bp);

  function setNumber(field: NumericField, rawValue: string): void {
    onChange({ ...value, [field.key]: rawValue ? Number(rawValue) : undefined });
  }

  function outOfRange(field: NumericField): boolean {
    const current = value[field.key];
    return current !== undefined && (current < field.min || current > field.max);
  }

  // Stored as one "120/80" string because that is what the server and every existing record
  // expect, but entered as two fields: systolic and diastolic are separate measurements with
  // separate reference ranges, and typed as free text they arrive as 120\80, 120 - 80 and
  // "120 over 80" in roughly equal measure.
  function setBloodPressure(part: "systolic" | "diastolic", rawValue: string): void {
    const digits = rawValue.replace(/\D/g, "").slice(0, 3);
    const next = part === "systolic" ? { systolic: digits, diastolic } : { systolic, diastolic: digits };
    const combined = next.systolic || next.diastolic ? `${next.systolic}/${next.diastolic}` : undefined;
    onChange({ ...value, bp: combined });
  }

  const bloodPressureIncomplete = Boolean(systolic) !== Boolean(diastolic);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {NUMERIC_FIELDS.map((field) => (
        <div key={field.key}>
          <Label htmlFor={`vitals-${field.key}`} className="mb-1.5">
            {field.label} ({field.unit})
          </Label>
          <Input
            id={`vitals-${field.key}`}
            // Not type="number": the scroll wheel silently changes a committed value, and the
            // spinners are unusable on a kiosk touchscreen. inputMode still brings up the numeric
            // keypad on the phone.
            inputMode="decimal"
            step={field.step}
            value={value[field.key] ?? ""}
            onChange={(event) => setNumber(field, event.target.value)}
            aria-invalid={outOfRange(field)}
          />
          {outOfRange(field) && (
            <p className="mt-1 text-xs text-destructive">
              Enter a value between {field.min} and {field.max} {field.unit}.
            </p>
          )}
        </div>
      ))}

      <div className="sm:col-span-2">
        <Label htmlFor="vitals-bp-systolic" className="mb-1.5">
          Blood pressure (mmHg)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="vitals-bp-systolic"
            inputMode="numeric"
            value={systolic}
            onChange={(event) => setBloodPressure("systolic", event.target.value)}
            placeholder="120"
            aria-label="Systolic blood pressure"
            className="flex-1"
          />
          <span aria-hidden="true" className="text-lg text-muted-foreground">
            /
          </span>
          <Input
            id="vitals-bp-diastolic"
            inputMode="numeric"
            value={diastolic}
            onChange={(event) => setBloodPressure("diastolic", event.target.value)}
            placeholder="80"
            aria-label="Diastolic blood pressure"
            className="flex-1"
          />
        </div>
        {bloodPressureIncomplete && (
          <p className="mt-1 text-xs text-destructive">Enter both the upper and lower reading.</p>
        )}
      </div>
    </div>
  );
}

export function hasInvalidVitals(value: Vitals): boolean {
  const numericOutOfRange = NUMERIC_FIELDS.some((field) => {
    const current = value[field.key];
    return current !== undefined && (current < field.min || current > field.max);
  });

  const { systolic, diastolic } = parseBloodPressure(value.bp);
  return numericOutOfRange || Boolean(systolic) !== Boolean(diastolic);
}
