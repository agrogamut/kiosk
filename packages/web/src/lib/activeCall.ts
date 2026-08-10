import type { CallSession } from "@madamgy/api-client";
import { api } from "./api";

export interface ActiveCallResponse {
  callSession: (CallSession & { patient?: { id: string; name: string } }) | null;
  livekitToken: string | null;
}

export async function fetchActiveCall(): Promise<ActiveCallResponse> {
  const response = await api.get<ActiveCallResponse>("/calls/active");
  return response.data;
}
