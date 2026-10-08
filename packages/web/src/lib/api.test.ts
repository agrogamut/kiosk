import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      post,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
  },
}));

const { refreshAccessToken } = await import("./api");
const { useAuthStore } = await import("../store/auth.store");

const patient = { id: "patient-1", name: "Patient", role: "PATIENT" as const };

beforeEach(() => {
  post.mockReset();
  useAuthStore.setState({ accessToken: null, user: patient });
});

describe("refreshAccessToken", () => {
  it("shares one refresh between callers that arrive while it is in flight", async () => {
    let answer: (value: unknown) => void = () => {};
    post.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const fromSocket = refreshAccessToken();
    const fromInterceptor = refreshAccessToken();
    answer({ data: { accessToken: "fresh", user: patient } });

    await expect(fromSocket).resolves.toBe("fresh");
    await expect(fromInterceptor).resolves.toBe("fresh");
    expect(post).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe("fresh");
  });

  it("makes a new request once the previous refresh has settled", async () => {
    post.mockResolvedValue({ data: { accessToken: "first", user: patient } });
    await refreshAccessToken();
    post.mockResolvedValue({ data: { accessToken: "second", user: patient } });

    await expect(refreshAccessToken()).resolves.toBe("second");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("signs the user out when the refresh fails", async () => {
    post.mockRejectedValue(new Error("401"));

    await expect(refreshAccessToken()).rejects.toThrow();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("signs the user out when the refresh cookie belongs to a different account", async () => {
    post.mockResolvedValue({ data: { accessToken: "theirs", user: { ...patient, id: "someone-else" } } });

    await expect(refreshAccessToken()).rejects.toThrow();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
