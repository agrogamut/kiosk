import { DateOfBirthSchema } from "@madamgy/api-client";

export function parseDateOfBirth(value: string): Date {
  const [day, month, year] = DateOfBirthSchema.parse(value).split("/");

  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}
