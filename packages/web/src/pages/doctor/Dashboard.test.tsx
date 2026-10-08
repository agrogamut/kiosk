// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveCallResponse } from "../../lib/activeCall";
import { useAuthStore } from "../../store/auth.store";
import { useCallStore } from "../../store/call.store";

const mocks = vi.hoisted(() => ({
  fetchActiveCall: vi.fn(), get: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock("../../lib/activeCall", () => ({ fetchActiveCall: mocks.fetchActiveCall }));
vi.mock("../../lib/api", () => ({ api: { get: mocks.get } }));
vi.mock("../../lib/socket", () => ({
  connectSocket: () => ({
    on: (event: string, handler: (...args: unknown[]) => void) => mocks.handlers.set(event, handler),
    off: (event: string) => mocks.handlers.delete(event),
  }),
}));
vi.mock("react-hot-toast", () => ({ default: vi.fn() }));
import DoctorDashboard from "./Dashboard";

const none = { callSession: null, livekitToken: null };
function ringing(): ActiveCallResponse {
  return {
    callSession: {
      id: "call-1", patientId: "patient-1", doctorId: "doctor-1", status: "RINGING", livekitRoom: "room-1",
      startedAt: null, endedAt: null, createdAt: "2026-10-08T00:00:00.000Z", queuedAt: "2026-10-08T00:00:00.000Z",
      patient: { id: "patient-1", name: "Returning Patient" },
    },
    livekitToken: null,
  };
}
function deferred() {
  let resolve!: (value: ActiveCallResponse) => void;
  const promise = new Promise<ActiveCallResponse>((yes) => { resolve = yes; });
  return { promise, resolve };
}
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let navigate: ReturnType<typeof useNavigate>;
function Navigation() { navigate = useNavigate(); return null; }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  mocks.handlers.clear();
  mocks.get.mockResolvedValue({ data: { calls: [], balance: "0", doctorProfile: null } });
  useAuthStore.getState().setAuth("access", { id: "doctor-1", name: "Doctor", role: "DOCTOR" });
  useCallStore.getState().clearCall();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});
async function mount() {
  await act(async () => root.render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/doctor"]}>
          <Navigation />
          <Routes>
            <Route path="/doctor" element={<DoctorDashboard />} />
            <Route path="/elsewhere" element={<div>Elsewhere</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  ));
}
async function fire(event: string, payload?: unknown) {
  await act(async () => mocks.handlers.get(event)?.(payload));
}
describe("doctor dashboard recovery", () => {
  it("recovers an incoming ring missed before reconnect", async () => {
    mocks.fetchActiveCall.mockResolvedValue(none);
    await mount();
    mocks.fetchActiveCall.mockResolvedValue(ringing());
    await fire("connect");
    expect(container.textContent).toContain("Returning Patient");
    expect(container.textContent).toContain("Accept");
  });

  it("does not revive a ring from a snapshot superseded by hangup", async () => {
    const request = deferred();
    mocks.fetchActiveCall.mockReturnValue(request.promise);
    await mount();
    await fire("call:ended", { callSessionId: "call-1" });
    await act(async () => request.resolve(ringing()));
    expect(container.textContent).not.toContain("Returning Patient");
  });

  it("ignores active-call recovery after leaving the dashboard", async () => {
    const request = deferred();
    mocks.fetchActiveCall.mockReturnValue(request.promise);
    await mount();
    await act(async () => navigate("/elsewhere"));
    await act(async () => request.resolve({
      callSession: { ...ringing().callSession!, status: "ACTIVE" }, livekitToken: "late-token",
    }));
    expect(useCallStore.getState().livekitToken).toBeNull();
    expect(container.textContent).toBe("Elsewhere");
  });
});
