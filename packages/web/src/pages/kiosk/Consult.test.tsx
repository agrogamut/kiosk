// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveCallResponse } from "../../lib/activeCall";
import { useCallStore } from "../../store/call.store";
import { useAuthStore } from "../../store/auth.store";

const mocks = vi.hoisted(() => ({
  fetchActiveCall: vi.fn(), post: vi.fn(), error: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock("../../lib/activeCall", () => ({ fetchActiveCall: mocks.fetchActiveCall }));
vi.mock("../../lib/api", () => ({ api: { post: mocks.post } }));
vi.mock("../../lib/socket", () => ({
  connectSocket: () => ({
    on: (event: string, handler: (...args: unknown[]) => void) => mocks.handlers.set(event, handler),
    off: (event: string) => mocks.handlers.delete(event),
  }),
}));
vi.mock("../../hooks/useImmersiveStatusBar", () => ({ useImmersiveStatusBar: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { error: mocks.error }) }));
vi.mock("../../components/call/CallChatPanel", () => ({ CallChatPanel: () => null }));
vi.mock("../../components/video/KioskCallView", () => ({
  KioskCallView: ({ token }: { token: string }) => <div>Media {token}</div>,
}));
import KioskConsult from "./Consult";
import { useCallListener } from "../../hooks/useCall";

function deferred() {
  let resolve!: (value: ActiveCallResponse) => void;
  const promise = new Promise<ActiveCallResponse>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function active(id = "call-1"): ActiveCallResponse {
  return {
    callSession: {
      id, patientId: "patient-1", doctorId: "doctor-1", status: "ACTIVE", livekitRoom: id,
      startedAt: "2026-10-03T00:00:00.000Z", endedAt: null, createdAt: "2026-10-03T00:00:00.000Z",
      queuedAt: "2026-10-03T00:00:00.000Z",
    },
    livekitToken: `token-${id}`,
  };
}
const none = { callSession: null, livekitToken: null };
let root: Root;
let container: HTMLDivElement;
let navigate: ReturnType<typeof useNavigate>;
function Navigation() { navigate = useNavigate(); return null; }
function Listener() { useCallListener(); return null; }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  mocks.handlers.clear();
  useCallStore.getState().clearCall();
  useAuthStore.getState().setAuth("access", { id: "patient-1", name: "Patient", role: "PATIENT" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function mount(listenerOnly = false, startRequested = false, initialPath = "/consult") {
  await act(async () => root.render(
    <StrictMode>
      <MemoryRouter initialEntries={[{ pathname: initialPath, state: { start: startRequested } }]}>
        <Navigation />
        <Listener />
        <Routes>
          <Route path="/consult" element={listenerOnly ? <div>Media route</div> : <KioskConsult />} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route path="/dashboard/locker" element={<div>Locker</div>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  ));
}
async function fire(event: string, payload?: unknown) {
  await act(async () => mocks.handlers.get(event)?.(payload));
}

describe("patient call recovery", () => {
  it("recovers an active call from an empty store", async () => {
    mocks.fetchActiveCall.mockResolvedValue(active());
    await mount(true, false, "/dashboard");
    await fire("connect");
    expect(useCallStore.getState().callSession?.id).toBe("call-1");
    expect(useCallStore.getState().livekitToken).toBe("token-call-1");
    expect(container.textContent).toBe("Media route");
  });

  it.each([
    { action: "clear", status: "ACTIVE" },
    { action: "clear", status: "RINGING" },
    { action: "switch", status: "ACTIVE" },
    { action: "switch", status: "RINGING" },
  ] as const)("discards a $status reconnect snapshot after a local call $action", async ({ action, status }) => {
    const request = deferred();
    mocks.fetchActiveCall.mockReturnValue(request.promise);
    useCallStore.getState().setCall({ ...active().callSession!, status: "RINGING" });
    await mount(true, false, "/dashboard");
    await fire("connect");
    await act(async () => {
      if (action === "clear") useCallStore.getState().clearCall();
      else useCallStore.getState().setCall({ ...active("call-2").callSession!, status: "RINGING" });
    });
    await act(async () => request.resolve({
      callSession: { ...active().callSession!, status },
      livekitToken: status === "ACTIVE" ? "stale-token" : null,
    }));
    expect(useCallStore.getState().callSession?.id ?? null).toBe(action === "clear" ? null : "call-2");
    expect(useCallStore.getState().livekitToken).toBeNull();
    expect(container.textContent).toBe("Dashboard");
  });

  it("keeps Minimize unavailable until the requested search exists", async () => {
    const request = deferred();
    mocks.fetchActiveCall.mockReturnValue(request.promise);
    const queued = { ...active().callSession!, status: "QUEUED" as const };
    mocks.post.mockResolvedValue({ data: queued });
    await mount(false, true);
    const minimize = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Minimize")!;
    expect(minimize.disabled).toBe(true);
    await act(async () => minimize.click());
    await act(async () => request.resolve(none));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    const ready = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Minimize")!;
    expect(ready.disabled).toBe(false);
    await act(async () => ready.click());
    expect(container.textContent).toBe("Dashboard");
    expect(useCallStore.getState().callSession?.id).toBe("call-1");
  });

  it("enters media when reconnect recovers an acceptance while minimized", async () => {
    mocks.fetchActiveCall.mockResolvedValue(active());
    useCallStore.getState().setCall({ ...active().callSession!, status: "RINGING" });
    await mount(true, false, "/dashboard");
    await fire("connect");
    expect(container.textContent).toBe("Media route");
    expect(useCallStore.getState().livekitToken).toBe("token-call-1");
  });

  it.each(["QUEUED", "RINGING"] as const)("keeps a recovered %s search minimized", async (status) => {
    mocks.fetchActiveCall.mockResolvedValue({ callSession: { ...active().callSession!, status }, livekitToken: null });
    await mount(true, false, "/dashboard");
    await fire("connect");
    expect(container.textContent).toBe("Dashboard");
    expect(useCallStore.getState().callSession?.status).toBe(status);
  });

  it("keeps a pending reconnect across ordinary patient navigation", async () => {
    const request = deferred();
    mocks.fetchActiveCall.mockReturnValue(request.promise);
    useCallStore.getState().setCall({ ...active().callSession!, status: "RINGING" });
    await mount(true, false, "/dashboard");
    await fire("connect");
    await act(async () => navigate("/dashboard/locker"));
    await act(async () => request.resolve(active()));
    expect(container.textContent).toBe("Media route");
    expect(useCallStore.getState().livekitToken).toBe("token-call-1");
  });

  it("discards a pending reconnect when the authenticated role changes", async () => {
    const request = deferred();
    mocks.fetchActiveCall.mockReturnValue(request.promise);
    await mount(true, false, "/dashboard");
    await fire("connect");
    await act(async () => useAuthStore.getState().setAuth("access", { id: "doctor-1", name: "Doctor", role: "DOCTOR" }));
    await act(async () => request.resolve(active()));
    expect(useCallStore.getState().callSession).toBeNull();
    expect(container.textContent).toBe("Dashboard");
  });

  it("creates one requested consultation while consuming its navigation intent", async () => {
    mocks.fetchActiveCall.mockResolvedValue(none);
    mocks.post.mockResolvedValue({ data: active().callSession });
    await mount(false, true);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith("/calls", expect.any(Object));
    expect(useCallStore.getState().callSession?.id).toBe("call-1");
  });

  it("does not start a consultation from a history entry without explicit intent", async () => {
    mocks.fetchActiveCall.mockResolvedValue(none);
    await mount();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(container.textContent).toBe("Dashboard");
  });

  it("keeps the global patient listener inactive for a doctor", async () => {
    useAuthStore.getState().setAuth("access", { id: "doctor-1", name: "Doctor", role: "DOCTOR" });
    await mount(true);
    expect(mocks.handlers.size).toBe(0);
    expect(mocks.fetchActiveCall).not.toHaveBeenCalled();
  });

  it("recovers in StrictMode without allowing the cancelled bootstrap to overwrite it", async () => {
    const old = deferred();
    mocks.fetchActiveCall.mockReturnValueOnce(old.promise).mockResolvedValue(active());
    await mount();
    expect(container.textContent).toContain("Media token-call-1");
    await act(async () => old.resolve(active("stale")));
    expect(useCallStore.getState().livekitToken).toBe("token-call-1");
  });

  it("does not create a second call from a cancelled StrictMode bootstrap", async () => {
    const old = deferred();
    mocks.fetchActiveCall.mockReturnValueOnce(old.promise).mockResolvedValue(active());
    await mount();
    await act(async () => old.resolve(none));
    expect(mocks.post).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Media token-call-1");
  });

  it("ignores bootstrap results after leaving the consultation", async () => {
    const request = deferred();
    mocks.fetchActiveCall.mockReturnValue(request.promise);
    await mount();
    await act(async () => navigate("/dashboard"));
    await act(async () => request.resolve(active()));
    expect(useCallStore.getState().callSession).toBeNull();
    expect(useCallStore.getState().livekitToken).toBeNull();
  });

  it("does not start another consultation when hangup clears the call before navigation commits", async () => {
    mocks.fetchActiveCall.mockResolvedValue(none);
    mocks.post.mockResolvedValue({ data: active("replacement").callSession });
    useCallStore.getState().setCall(active().callSession!);
    useCallStore.getState().setLivekitToken("token-call-1");
    await mount();
    await act(async () => useCallStore.getState().clearCall());
    expect(mocks.post).not.toHaveBeenCalled();
    expect(useCallStore.getState().callSession).toBeNull();
    await act(async () => navigate("/dashboard"));
    expect(container.textContent).toBe("Dashboard");
  });

  it("ignores reconnect responses after the call ends", async () => {
    const request = deferred();
    mocks.fetchActiveCall.mockReturnValue(request.promise);
    useCallStore.getState().setCall(active().callSession!);
    await mount(true);
    await fire("connect");
    await fire("call:ended");
    await act(async () => request.resolve(active()));
    expect(useCallStore.getState().callSession).toBeNull();
    expect(useCallStore.getState().livekitToken).toBeNull();
    expect(container.textContent).toBe("Dashboard");
  });

  it("does not downgrade a live acceptance with an older reconnect response", async () => {
    const request = deferred();
    mocks.fetchActiveCall.mockReturnValue(request.promise);
    const queued = { ...active().callSession!, status: "RINGING" as const };
    useCallStore.getState().setCall(queued);
    await mount(true);
    await fire("connect");
    await fire("call:accepted", { callSessionId: queued.id, livekitToken: "accepted-token" });
    await act(async () => request.resolve({ callSession: queued, livekitToken: null }));
    expect(useCallStore.getState().callSession?.status).toBe("ACTIVE");
    expect(useCallStore.getState().livekitToken).toBe("accepted-token");
  });

  it("keeps the newest reconnect result when requests finish out of order", async () => {
    const old = deferred();
    mocks.fetchActiveCall.mockReturnValueOnce(old.promise).mockResolvedValue(active());
    await mount(true);
    await fire("connect");
    await fire("connect");
    await act(async () => old.resolve(active("stale")));
    expect(useCallStore.getState().livekitToken).toBe("token-call-1");
  });
});
