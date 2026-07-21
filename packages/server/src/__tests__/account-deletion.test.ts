import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { anonymizeUser } from "../services/account-deletion.service.js";

async function makeTestPatient(phoneSuffix: string) {
  return prisma.user.create({
    data: {
      phone: `77770${phoneSuffix}`,
      name: "Delete Me",
      role: "PATIENT",
      patientProfile: { create: { email: "deleteme@example.com", gender: "OTHER" } },
    },
    include: { patientProfile: true },
  });
}

describe("anonymizeUser", () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.patientProfile.deleteMany({ where: { userId: { in: createdIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
  });

  it("scrubs identity fields and sets deletedAt/disabled", async () => {
    const user = await makeTestPatient("00001");
    createdIds.push(user.id);

    await anonymizeUser(user.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { patientProfile: true } });
    expect(updated.name).toBe("Deleted User");
    expect(updated.phone).toBe(`deleted-${user.id}`);
    expect(updated.disabled).toBe(true);
    expect(updated.deletedAt).not.toBeNull();
    expect(updated.patientProfile?.email).toBeNull();
    expect(updated.patientProfile?.gender).toBeNull();
  });

  it("rejects a second deletion of the same user", async () => {
    const user = await makeTestPatient("00002");
    createdIds.push(user.id);

    await anonymizeUser(user.id);
    await expect(anonymizeUser(user.id)).rejects.toThrow("User not found");
  });

  it("blocks deletion when walletBalance is positive", async () => {
    const user = await prisma.user.create({
      data: { phone: "7777000003", name: "Rich Doctor", role: "DOCTOR", walletBalance: 500 },
    });
    createdIds.push(user.id);

    await expect(anonymizeUser(user.id)).rejects.toThrow("Withdraw your wallet balance");
  });
});
