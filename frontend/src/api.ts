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

async function jsonOrThrow(r: Response) {
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      detail = j.detail || detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return r.json();
}

export const api = {
  // auth
  createSession: (sessionId: string) =>
    fetch(`${BASE}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId }) }).then(jsonOrThrow),
  register: (body: { email: string; name: string; password: string; department?: string }) =>
    fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  loginEmail: (body: { email: string; password: string }) =>
    fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  devLogin: () => fetch(`${BASE}/api/auth/dev-login`, { method: "POST" }).then(jsonOrThrow),
  me: () => authedFetch(`/api/auth/me`).then(jsonOrThrow),
  logout: async () => { await authedFetch(`/api/auth/logout`, { method: "POST" }); },
  setLocale: (locale: "es" | "en") =>
    authedFetch(`/api/auth/locale`, { method: "POST", body: JSON.stringify({ locale }) }).then(jsonOrThrow),
  setAvatar: (image_base64: string) =>
    authedFetch(`/api/auth/avatar`, { method: "POST", body: JSON.stringify({ image_base64 }) }).then(jsonOrThrow),
  adminListUsers: () => authedFetch(`/api/admin/users`).then(jsonOrThrow),
  adminCreateUser: (body: any) => authedFetch(`/api/admin/users`, { method: "POST", body: JSON.stringify(body) }).then(jsonOrThrow),
  adminUpdateUser: (id: string, body: any) => authedFetch(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then(jsonOrThrow),
  adminDeleteUser: (id: string) => authedFetch(`/api/admin/users/${id}`, { method: "DELETE" }).then(jsonOrThrow),
  myNotifications: () => authedFetch(`/api/notifications/mine`).then(jsonOrThrow),
  readAllNotifications: () => authedFetch(`/api/notifications/mine/read-all`, { method: "POST" }).then(jsonOrThrow),
  seed: () => fetch(`${BASE}/api/seed`, { method: "POST" }).then(jsonOrThrow),
  dashboard: () => authedFetch(`/api/dashboard`).then(jsonOrThrow),
  listContracts: (params: { status?: string; category?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status && params.status !== "all") qs.set("status", params.status);
    if (params.category && params.category !== "all") qs.set("category", params.category);
    const q = qs.toString();
    return authedFetch(`/api/contracts${q ? "?" + q : ""}`).then(jsonOrThrow);
  },
  getContract: (id: string) => authedFetch(`/api/contracts/${id}`).then(jsonOrThrow),
  createContract: (body: any) =>
    authedFetch(`/api/contracts`, { method: "POST", body: JSON.stringify(body) }).then(jsonOrThrow),
  updateContract: (id: string, body: any) =>
    authedFetch(`/api/contracts/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then(jsonOrThrow),
  deleteContract: (id: string) =>
    authedFetch(`/api/contracts/${id}`, { method: "DELETE" }).then(jsonOrThrow),
  workflowDecision: (id: string, step: string, decision: "approved" | "rejected", note = "") =>
    authedFetch(`/api/contracts/${id}/workflow`, { method: "POST", body: JSON.stringify({ step, decision, note }) }).then(jsonOrThrow),
  sign: (id: string) => authedFetch(`/api/contracts/${id}/sign`, { method: "POST" }).then(jsonOrThrow),
  addAddendum: (id: string, body: any) =>
    authedFetch(`/api/contracts/${id}/addenda`, { method: "POST", body: JSON.stringify(body) }).then(jsonOrThrow),
  addRisk: (id: string, body: any) =>
    authedFetch(`/api/contracts/${id}/risks`, { method: "POST", body: JSON.stringify(body) }).then(jsonOrThrow),
  addModification: (id: string, body: any) =>
    authedFetch(`/api/contracts/${id}/modifications`, { method: "POST", body: JSON.stringify(body) }).then(jsonOrThrow),
  addPayment: (id: string, body: any) =>
    authedFetch(`/api/contracts/${id}/payments`, { method: "POST", body: JSON.stringify(body) }).then(jsonOrThrow),
  addESF: (id: string, body: any) =>
    authedFetch(`/api/contracts/${id}/esf`, { method: "POST", body: JSON.stringify(body) }).then(jsonOrThrow),
  listEvidence: (contractId?: string) => {
    const qs = contractId ? `?contract_id=${contractId}` : "";
    return authedFetch(`/api/evidence${qs}`).then(jsonOrThrow);
  },
  getEvidence: (id: string) => authedFetch(`/api/evidence/${id}`).then(jsonOrThrow),
  createEvidence: (body: any) =>
    authedFetch(`/api/evidence`, { method: "POST", body: JSON.stringify(body) }).then(jsonOrThrow),
  aiAnalyze: (body: { contract_id?: string; contract_text: string }) =>
    authedFetch(`/api/ai/analyze`, { method: "POST", body: JSON.stringify(body) }).then(jsonOrThrow),
  aiExtractContract: (body: { file_base64: string; mime_type?: string; filename?: string }) =>
    authedFetch(`/api/ai/extract-contract`, { method: "POST", body: JSON.stringify(body) }).then(jsonOrThrow),
  notifications: () => authedFetch(`/api/notifications`).then(jsonOrThrow),
  contractDocumentUrl: (id: string) => `${BASE}/api/contracts/${id}/document`,
  contractDocumentHtml: async (id: string): Promise<string> => {
    const r = await authedFetch(`/api/contracts/${id}/document`);
    if (!r.ok) throw new Error("document failed");
    return r.text();
  },
  createShareLink: async (id: string): Promise<{ token: string; expires_at: string; title?: string; contract_number?: string; counterparty?: string }> => {
    const r = await authedFetch(`/api/contracts/${id}/share-link`, { method: "POST" });
    if (!r.ok) throw new Error("share link failed");
    return r.json();
  },
  publicShareUrl: (token: string) => `${BASE}/api/share/${token}`,
};
