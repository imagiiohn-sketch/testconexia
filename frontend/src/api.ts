import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "conexia_session_token";

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(KEY, token); } catch { /* ignore */ }
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }
  return await SecureStore.getItemAsync(KEY);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { ...init, headers });
}

export const api = {
  async createSession(sessionId: string) {
    const r = await fetch(`${BASE}/api/auth/session`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!r.ok) throw new Error("session failed");
    return r.json();
  },
  async devLogin() {
    const r = await fetch(`${BASE}/api/auth/dev-login`, { method: "POST" });
    if (!r.ok) throw new Error("dev login failed");
    return r.json();
  },
  async me() {
    const r = await authedFetch(`/api/auth/me`);
    if (!r.ok) throw new Error("me failed");
    return r.json();
  },
  async logout() {
    await authedFetch(`/api/auth/logout`, { method: "POST" });
  },
  async seed() {
    return (await fetch(`${BASE}/api/seed`, { method: "POST" })).json();
  },
  async dashboard() {
    const r = await authedFetch(`/api/dashboard`);
    if (!r.ok) throw new Error("dashboard failed");
    return r.json();
  },
  async listContracts(status?: string) {
    const qs = status && status !== "all" ? `?status=${status}` : "";
    const r = await authedFetch(`/api/contracts${qs}`);
    if (!r.ok) throw new Error("contracts failed");
    return r.json();
  },
  async getContract(id: string) {
    const r = await authedFetch(`/api/contracts/${id}`);
    if (!r.ok) throw new Error("contract failed");
    return r.json();
  },
  async createContract(body: any) {
    const r = await authedFetch(`/api/contracts`, { method: "POST", body: JSON.stringify(body) });
    if (!r.ok) throw new Error("create failed");
    return r.json();
  },
  async workflowDecision(id: string, step: string, decision: "approved" | "rejected", note = "") {
    const r = await authedFetch(`/api/contracts/${id}/workflow`, {
      method: "POST", body: JSON.stringify({ step, decision, note }),
    });
    if (!r.ok) throw new Error("workflow failed");
    return r.json();
  },
  async sign(id: string) {
    const r = await authedFetch(`/api/contracts/${id}/sign`, { method: "POST" });
    if (!r.ok) throw new Error("sign failed");
    return r.json();
  },
  async addAddendum(id: string, body: any) {
    const r = await authedFetch(`/api/contracts/${id}/addenda`, { method: "POST", body: JSON.stringify(body) });
    if (!r.ok) throw new Error("addendum failed");
    return r.json();
  },
  async listEvidence(contractId?: string) {
    const qs = contractId ? `?contract_id=${contractId}` : "";
    const r = await authedFetch(`/api/evidence${qs}`);
    if (!r.ok) throw new Error("evidence failed");
    return r.json();
  },
  async getEvidence(id: string) {
    const r = await authedFetch(`/api/evidence/${id}`);
    if (!r.ok) throw new Error("evidence failed");
    return r.json();
  },
  async createEvidence(body: any) {
    const r = await authedFetch(`/api/evidence`, { method: "POST", body: JSON.stringify(body) });
    if (!r.ok) throw new Error("create evidence failed");
    return r.json();
  },
  async aiAnalyze(body: { contract_id?: string; contract_text: string }) {
    const r = await authedFetch(`/api/ai/analyze`, { method: "POST", body: JSON.stringify(body) });
    if (!r.ok) throw new Error("ai analyze failed");
    return r.json();
  },
};
