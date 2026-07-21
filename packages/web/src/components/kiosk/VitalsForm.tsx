import type { Vitals } from "@madamgy/api-client";
import { Input } from "../ui/input";

interface VitalsFormProps {
  value: Vitals;
  onChange: (value: Vitals) => void;
}

export function VitalsForm({ value, onChange }: VitalsFormProps) {
  function setNumber(key: keyof Vitals, rawValue: string): void {
    onChange({ ...value, [key]: rawValue ? Number(rawValue) : undefined });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        type="number"
        value={value.weightKg ?? ""}
        onChange={(event) => setNumber("weightKg", event.target.value)}
        placeholder="Weight (kg)"
      />
      <Input
        type="number"
        value={value.heightCm ?? ""}
        onChange={(event) => setNumber("heightCm", event.target.value)}
        placeholder="Height (cm)"
      />
      <Input
        value={value.bp ?? ""}
        onChange={(event) => onChange({ ...value, bp: event.target.value || undefined })}
        placeholder="Blood pressure"
      />
      <Input
        type="number"
        value={value.spo2 ?? ""}
        onChange={(event) => setNumber("spo2", event.target.value)}
        placeholder="SpO2"
      />
    </div>
  );
}
