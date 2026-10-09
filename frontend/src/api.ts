import { storage } from "@/src/utils/storage";
import { API_BASE, TOKEN_KEY } from "@/src/constants";

export type ApiError = { status: number; message: string };

async function request<T = any>(path: string, method: string, body?: any): Promise<T> {
  const token = await storage.secureGet(TOKEN_KEY, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw { status: 0, message: "Network error. Check your connection." } as ApiError;
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw { status: res.status, message: typeof message === "string" ? message : "Request failed" } as ApiError;
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>(path, "GET"),
  post: <T = any>(path: string, body?: any) => request<T>(path, "POST", body ?? {}),
  patch: <T = any>(path: string, body?: any) => request<T>(path, "PATCH", body ?? {}),
  put: <T = any>(path: string, body?: any) => request<T>(path, "PUT", body ?? {}),
  del: <T = any>(path: string) => request<T>(path, "DELETE"),
};
