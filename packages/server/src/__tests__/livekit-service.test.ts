import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRoomMock = vi.fn();
const deleteRoomMock = vi.fn();
let shouldThrowOnConstructor = false;

vi.mock("livekit-server-sdk", async () => {
  const actual = await vi.importActual<typeof import("livekit-server-sdk")>("livekit-server-sdk");
  return {
    ...actual,
    RoomServiceClient: class {
      constructor() {
        if (shouldThrowOnConstructor) {
          throw new Error("Failed to construct RoomServiceClient");
        }
      }
      createRoom = createRoomMock;
      deleteRoom = deleteRoomMock;
    },
  };
});

describe("livekitService.createRoom", () => {
  beforeEach(() => {
    shouldThrowOnConstructor = false;
  });

  afterEach(() => {
    createRoomMock.mockReset();
    deleteRoomMock.mockReset();
    shouldThrowOnConstructor = false;
  });

  it("creates the room with a 2-minute departure timeout", async () => {
    createRoomMock.mockResolvedValueOnce(undefined);
    const { livekitService } = await import("../services/livekit.service.js");

    await livekitService.createRoom("room-test-1");

    expect(createRoomMock).toHaveBeenCalledWith({ name: "room-test-1", departureTimeout: 120 });
  });

  it("swallows errors instead of throwing", async () => {
    createRoomMock.mockRejectedValueOnce(new Error("connection refused"));
    const { livekitService } = await import("../services/livekit.service.js");

    await expect(livekitService.createRoom("room-test-2")).resolves.toBeUndefined();
  });

  it("swallows constructor errors on lazy initialization", async () => {
    shouldThrowOnConstructor = true;
    const { livekitService } = await import("../services/livekit.service.js");

    await expect(livekitService.createRoom("room-test-3")).resolves.toBeUndefined();
  });
});

describe("livekitService.deleteRoom", () => {
  beforeEach(() => {
    shouldThrowOnConstructor = false;
  });

  afterEach(() => {
    createRoomMock.mockReset();
    deleteRoomMock.mockReset();
    shouldThrowOnConstructor = false;
  });

  it("deletes the room", async () => {
    deleteRoomMock.mockResolvedValueOnce(undefined);
    const { livekitService } = await import("../services/livekit.service.js");

    await livekitService.deleteRoom("room-test-4");

    expect(deleteRoomMock).toHaveBeenCalledWith("room-test-4");
  });

  it("swallows errors instead of throwing", async () => {
    deleteRoomMock.mockRejectedValueOnce(new Error("connection refused"));
    const { livekitService } = await import("../services/livekit.service.js");

    await expect(livekitService.deleteRoom("room-test-5")).resolves.toBeUndefined();
  });
});
