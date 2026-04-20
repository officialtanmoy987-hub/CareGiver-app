import type {
  AdminDashboardData,
  AppRole,
  AssignCaregiverInput,
  CaregiverDashboardData,
  CreatePatientInput,
} from "../shared/types";

export interface MeResponse {
  userId: string | null;
  role: AppRole | null;
  name: string | null;
  email: string | null;
}

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function parseJsonSafely(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const candidate = record.message ?? record.error;

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return fallback;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = parseJsonSafely(text);

  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(payload, `Request failed with status ${response.status}`),
      response.status,
      payload,
    );
  }

  return payload as T;
}

export function getMe() {
  return requestJson<MeResponse>("/api/me");
}

export function setMyRole(role: AppRole) {
  return requestJson<MeResponse>("/api/me/role", {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export function getCaregiverDashboard() {
  return requestJson<CaregiverDashboardData>("/api/caregiver/dashboard");
}

export function getAdminDashboard() {
  return requestJson<AdminDashboardData>("/api/admin/dashboard");
}

export function createPatient(input: CreatePatientInput) {
  return requestJson("/api/admin/patients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function assignCaregiver(input: AssignCaregiverInput) {
  return requestJson("/api/admin/assignments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
