import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { forceDeactivateKioskDevice, registerKioskDevice } from "../services/kiosk.service.js";

describe("kiosk.service", () => {
  let adminAId: string;
  let adminBId: string;

  beforeAll(async () => {
    const adminA = await prisma.user.create({
      data: { phone: "9999500001", name: "Kiosk Admin A", role: "ADMIN", passwordHash: "x" },
    });
    adminAId = adminA.id;
    const adminB = await prisma.user.create({
      data: { phone: "9999500002", name: "Kiosk Admin B", role: "ADMIN", passwordHash: "x" },
    });
    adminBId = adminB.id;
  });

  afterAll(async () => {
    await prisma.kiosk.deleteMany({ where: { adminId: { in: [adminAId, adminBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminAId, adminBId] } } });
  });

  it("registers a new device to an admin", async () => {
    const kiosk = await registerKioskDevice(adminAId, "device-kiosk-test-1", "Front desk tablet");
    expect(kiosk.adminId).toBe(adminAId);
    expect(kiosk.active).toBe(true);
  });

  it("is idempotent when the same admin re-registers their own device", async () => {
    const kiosk = await registerKioskDevice(adminAId, "device-kiosk-test-1", "Renamed tablet");
    expect(kiosk.label).toBe("Renamed tablet");

    const count = await prisma.kiosk.count({ where: { deviceId: "device-kiosk-test-1" } });
    expect(count).toBe(1);
  });

  it("rejects a different admin claiming a device that is active under someone else", async () => {
    await expect(registerKioskDevice(adminBId, "device-kiosk-test-1")).rejects.toThrow(
      "Device already registered to another admin",
    );
  });

  it("allows claiming a device once the original admin deactivates it", async () => {
    await prisma.kiosk.updateMany({
      where: { deviceId: "device-kiosk-test-1" },
      data: { active: false },
    });

    const kiosk = await registerKioskDevice(adminBId, "device-kiosk-test-1");
    expect(kiosk.adminId).toBe(adminBId);
    expect(kiosk.active).toBe(true);
  });

  it("lets a SUPER_ADMIN force-deactivate a device regardless of owner", async () => {
    const kiosk = await forceDeactivateKioskDevice("device-kiosk-test-1");
    expect(kiosk.active).toBe(false);

    await expect(forceDeactivateKioskDevice("device-kiosk-test-nonexistent")).rejects.toThrow(
      "Kiosk device not found",
    );
  });
});
