import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { getRevenueConfig, updateRevenueConfig } from "../services/revenue-config.service.js";

describe("revenue-config.service", () => {
  let superAdminId: string;

  beforeAll(async () => {
    const superAdmin = await prisma.user.create({
      data: { phone: "9999400001", name: "Config Test Super Admin", role: "SUPER_ADMIN", passwordHash: "x" },
    });
    superAdminId = superAdmin.id;
  });

  afterAll(async () => {
    // Test 2 re-points RevenueConfig.updatedById at this ephemeral user (no onDelete
    // action on that FK), so deleting the user here would violate the constraint unless
    // we repoint it first. Guard on superAdminId too, in case beforeAll itself failed —
    // deleteMany({ where: { id: undefined } }) has no id filter and would target every user.
    if (!superAdminId) return;
    const fallback = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN", id: { not: superAdminId } } });
    if (fallback) {
      await prisma.revenueConfig.updateMany({ where: { updatedById: superAdminId }, data: { updatedById: fallback.id } });
    }
    await prisma.user.deleteMany({ where: { id: superAdminId } });
  });

  it("returns the seeded config", async () => {
    const config = await getRevenueConfig();
    expect(Number(config.doctorPct) + Number(config.adminPct) + Number(config.superAdminPct)).toBe(100);
  });

  it("updates the config when percentages sum to 100", async () => {
    const updated = await updateRevenueConfig(superAdminId, {
      consultationFee: 500,
      doctorPct: 70,
      adminPct: 20,
      superAdminPct: 10,
    });
    expect(Number(updated.consultationFee)).toBe(500);
    expect(updated.updatedById).toBe(superAdminId);

    await updateRevenueConfig(superAdminId, {
      consultationFee: 200,
      doctorPct: 65,
      adminPct: 25,
      superAdminPct: 10,
    });
  });

  it("rejects an update whose percentages do not sum to 100", async () => {
    await expect(
      updateRevenueConfig(superAdminId, {
        consultationFee: 200,
        doctorPct: 70,
        adminPct: 25,
        superAdminPct: 10,
      }),
    ).rejects.toThrow("Split percentages must sum to 100");
  });
});
