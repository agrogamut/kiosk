import type { Vitals } from "@madamgy/api-client";

interface VitalsFormProps {
  value: Vitals;
  onChange: (value: Vitals) => void;
}

export function VitalsForm({ value, onChange }: VitalsFormProps) {
  function setNumber(key: keyof Vitals, rawValue: string): void {
    onChange({ ...value, [key]: rawValue ? Number(rawValue) : undefined });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <input
        type="number"
        value={value.weightKg ?? ""}
        onChange={(event) => setNumber("weightKg", event.target.value)}
        placeholder="Weight (kg)"
        className="rounded-2xl border-2 p-4 text-lg"
      />
      <input
        type="number"
        value={value.heightCm ?? ""}
        onChange={(event) => setNumber("heightCm", event.target.value)}
        placeholder="Height (cm)"
        className="rounded-2xl border-2 p-4 text-lg"
      />
      <input
        value={value.bp ?? ""}
        onChange={(event) => onChange({ ...value, bp: event.target.value || undefined })}
        placeholder="Blood pressure"
        className="rounded-2xl border-2 p-4 text-lg"
      />
      <input
        type="number"
        value={value.spo2 ?? ""}
        onChange={(event) => setNumber("spo2", event.target.value)}
        placeholder="SpO2"
        className="rounded-2xl border-2 p-4 text-lg"
      />
    </div>
  );
}
