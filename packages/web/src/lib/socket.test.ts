import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (...args: unknown[]) => void;
type AuthOption = (cb: (data: { token: string | null }) => void) => void;

class FakeSocket {
  active = false;
  connected = false;
  private handlers = new Map<string, Handler[]>();
  connect = vi.fn(() => {
    this.active = true;
  });
  disconnect = vi.fn();

  on(event: string, handler: Handler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }

  fire(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }

  /** The server refused the handshake: socket.io destroys the socket, so it is no longer active. */
  refuse(): void {
    this.active = false;
    this.fire("connect_error", new Error("Unauthorized"));
  }
}

const mocks = vi.hoisted(() => ({
  refreshAccessToken: vi.fn<() => Promise<string>>(),
  sockets: [] as { socket: unknown; auth: unknown }[],
}));

vi.mock("./api", () => ({ refreshAccessToken: mocks.refreshAccessToken }));
vi.mock("socket.io-client", () => ({
  io: vi.fn((_url: string, options: { auth: unknown }) => {
    const socket = new FakeSocket();
    mocks.sockets.push({ socket, auth: options.auth });
    return socket;
  }),
}));

const { connectSocket, disconnectSocket, getSocket } = await import("./socket");
const { useAuthStore } = await import("../store/auth.store");

function latest(): { socket: FakeSocket; auth: AuthOption } {
  const entry = mocks.sockets[mocks.sockets.length - 1];
  return { socket: entry.socket as FakeSocket, auth: entry.auth as AuthOption };
}

function tokenSentBy(auth: AuthOption): string | null {
  let token: string | null = "unset";
  auth((data) => {
    token = data.token;
  });
  return token;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  disconnectSocket();
  mocks.sockets.length = 0;
  mocks.refreshAccessToken.mockReset();
  useAuthStore.setState({ accessToken: null, user: { id: "patient-1", name: "Patient", role: "PATIENT" } });
});

describe("socket authentication", () => {
  it("sends the access token current at each connection attempt, not the one it was built with", () => {
    getSocket();
    const { auth } = latest();

    expect(tokenSentBy(auth)).toBeNull();
    useAuthStore.setState({ accessToken: "restored-after-reload" });
    expect(tokenSentBy(auth)).toBe("restored-after-reload");
  });

  it("refreshes the token and reconnects after the server refuses the handshake", async () => {
    mocks.refreshAccessToken.mockResolvedValue("fresh");
    connectSocket();
    const { socket } = latest();
    socket.connect.mockClear();

    socket.refuse();
    await flush();

    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("leaves a transport failure to socket.io's own retry", async () => {
    connectSocket();
    const { socket } = latest();
    socket.connect.mockClear();

    socket.active = true;
    socket.fire("connect_error", new Error("xhr poll error"));
    await flush();

    expect(mocks.refreshAccessToken).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("does not reconnect when the session can no longer be refreshed", async () => {
    mocks.refreshAccessToken.mockRejectedValue(new Error("refresh cookie expired"));
    connectSocket();
    const { socket } = latest();
    socket.connect.mockClear();

    socket.refuse();
    await flush();

    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("stops after repeated refusals and starts counting again once a connection succeeds", async () => {
    mocks.refreshAccessToken.mockResolvedValue("fresh");
    connectSocket();
    const { socket } = latest();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      socket.refuse();
      await flush();
    }
    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(3);

    socket.fire("connect");
    socket.refuse();
    await flush();
    expect(mocks.refreshAccessToken).toHaveBeenCalledTimes(4);
  });

  it("does not revive a socket that was discarded while its refresh was in flight", async () => {
    let finishRefresh: (token: string) => void = () => {};
    mocks.refreshAccessToken.mockReturnValue(
      new Promise((resolve) => {
        finishRefresh = resolve;
      }),
    );
    connectSocket();
    const { socket } = latest();
    socket.connect.mockClear();

    socket.refuse();
    disconnectSocket();
    finishRefresh("fresh");
    await flush();

    expect(socket.connect).not.toHaveBeenCalled();
  });
});
