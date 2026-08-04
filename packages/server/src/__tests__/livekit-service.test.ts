import { afterEach, describe, expect, it, vi } from "vitest";

const createRoomMock = vi.fn();

vi.mock("livekit-server-sdk", async () => {
  const actual = await vi.importActual<typeof import("livekit-server-sdk")>("livekit-server-sdk");
  return {
    ...actual,
    RoomServiceClient: class {
      createRoom = createRoomMock;
    },
  };
});

describe("livekitService.createRoom", () => {
  afterEach(() => {
    createRoomMock.mockReset();
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
});
