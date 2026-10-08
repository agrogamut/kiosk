// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveCallResponse } from "../../lib/activeCall";
import { useCallStore } from "../../store/call.store";

const mocks = vi.hoisted(() => ({ fetchActiveCall: vi.fn(), error: vi.fn() }));
vi.mock("../../lib/activeCall", () => ({ fetchActiveCall: mocks.fetchActiveCall }));
vi.mock("../../lib/socket", () => ({ connectSocket: () => ({ on: vi.fn(), off: vi.fn() }) }));
vi.mock("../../hooks/useDoctorPresenceHeartbeat", () => ({ useDoctorPresenceHeartbeat: vi.fn() }));
vi.mock("../../hooks/useImmersiveStatusBar", () => ({ useImmersiveStatusBar: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { error: mocks.error } }));
vi.mock("../../components/call/CallChatPanel", () => ({ CallChatPanel: () => null }));
vi.mock("../../components/call/PatientHistoryPanel", () => ({ PatientHistoryPanel: () => null }));
vi.mock("../../components/video/DoctorCallView", () => ({
  DoctorCallView: ({ peerName, startedAt }: { peerName: string; startedAt: string }) => (
    <div data-testid="call">{peerName} {startedAt}</div>
  ),
}));
import DoctorCall from "./Call";

function deferred() {
  let resolve!: (value: ActiveCallResponse) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ActiveCallResponse>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function active(id = "call-1"): ActiveCallResponse {
  return {
    callSession: {
      id, patientId: "patient-1", doctorId: "doctor-1", status: "ACTIVE", livekitRoom: id,
      startedAt: "2026-10-03T00:00:00.000Z", endedAt: null, createdAt: "2026-10-03T00:00:00.000Z",
      queuedAt: "2026-10-03T00:00:00.000Z",
      patient: { id: "patient-1", name: `Patient ${id}` },
    },
    livekitToken: `token-${id}`,
  };
}

let root: Root;
let container: HTMLDivElement;
let navigate: ReturnType<typeof useNavigate>;
function Navigation() { navigate = useNavigate(); return null; }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  useCallStore.getState().clearCall();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function mount() {
  await act(async () => root.render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/doctor/call/call-1"]}>
        <Navigation />
        <Routes>
          <Route path="/doctor/call/:id" element={<DoctorCall />} />
          <Route path="/doctor" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  ));
}

describe("doctor call hydration", () => {
  it("recovers token, patient and start time after StrictMode cancels the first setup", async () => {
    const cancelled = deferred();
    mocks.fetchActiveCall.mockReturnValueOnce(cancelled.promise).mockResolvedValue(active());
    await mount();
    expect(useCallStore.getState().livekitToken).toBe("token-call-1");
    expect(container.textContent).toContain("Patient call-1 2026-10-03T00:00:00.000Z");
    expect(mocks.fetchActiveCall).toHaveBeenCalledTimes(2);
    await act(async () => cancelled.resolve(active("stale")));
    expect(useCallStore.getState().livekitToken).toBe("token-call-1");
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("ignores an old route response while hydrating the next call", async () => {
    const old = deferred();
    mocks.fetchActiveCall.mockReturnValue(old.promise);
    await mount();
    mocks.fetchActiveCall.mockResolvedValue(active("call-2"));
    await act(async () => navigate("/doctor/call/call-2"));
    await act(async () => old.resolve(active()));
    expect(useCallStore.getState().livekitToken).toBe("token-call-2");
    expect(container.textContent).toContain("Patient call-2");
  });

  it("ignores a cancelled request rejection after recovery", async () => {
    const cancelled = deferred();
    mocks.fetchActiveCall.mockReturnValueOnce(cancelled.promise).mockResolvedValue(active());
    await mount();
    await act(async () => cancelled.reject(new Error("offline")));
    expect(mocks.error).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Patient call-1");
  });

  it("does not hydrate or navigate after leaving the call route", async () => {
    const request = deferred();
    mocks.fetchActiveCall.mockReturnValue(request.promise);
    await mount();
    await act(async () => navigate("/doctor"));
    await act(async () => request.resolve(active()));
    expect(useCallStore.getState().livekitToken).toBeNull();
    expect(container.textContent).toBe("Dashboard");
  });

  it("leaves a call whose active response no longer matches", async () => {
    mocks.fetchActiveCall.mockResolvedValue(active("other-call"));
    await mount();
    expect(container.textContent).toBe("Dashboard");
    expect(useCallStore.getState().livekitToken).toBeNull();
  });
});
