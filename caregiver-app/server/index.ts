import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { z, ZodError } from "zod";
import type {
  AdminDashboardData,
  AlertItem,
  AppRole,
  AssignCaregiverInput,
  CaregiverDashboardData,
  CaregiverProfile,
  CreatePatientInput,
  Patient,
} from "../src/shared/types.ts";

type MeResponse = {
  userId: string | null;
  role: AppRole | null;
  name: string | null;
  email: string | null;
};

type ClerkUser = {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
  }>;
  publicMetadata: Record<string, unknown>;
};

type ClerkApiClient = {
  users: {
    getUser(userId: string): Promise<ClerkUser>;
  };
};

const app = express();
const port = Number(process.env.PORT || 8787);
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(serverDir, "../dist");
const indexHtmlPath = path.join(distDir, "index.html");

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(clerkMiddleware());

const createPatientSchema = z.object({
  name: z.string().trim().min(1),
  roomNumber: z.string().trim().min(1),
  carePlanSummary: z.string().trim().min(1),
  medicationNotes: z.string().trim().min(1),
});

const assignCaregiverSchema = z.object({
  patientId: z.string().trim().min(1),
  caregiverId: z.string().trim().min(1),
});

const caregivers: CaregiverProfile[] = [
  {
    id: "caregiver-001",
    clerkUserId: "user_demo_caregiver_1",
    name: "Ava Johnson",
    email: "ava.johnson@example.com",
  },
  {
    id: "caregiver-002",
    clerkUserId: "user_demo_caregiver_2",
    name: "Marcus Lee",
    email: "marcus.lee@example.com",
  },
  {
    id: "caregiver-003",
    clerkUserId: "user_demo_caregiver_3",
    name: "Sofia Patel",
    email: "sofia.patel@example.com",
  },
];

const patients: Patient[] = [
  {
    id: "patient-001",
    name: "Eleanor Brooks",
    roomNumber: "101A",
    carePlanSummary: "Post-surgical recovery and mobility support",
    medicationNotes: "Acetaminophen after meals; monitor pain changes.",
    assignedCaregiverId: "caregiver-001",
  },
  {
    id: "patient-002",
    name: "Harold Nguyen",
    roomNumber: "102B",
    carePlanSummary: "Daily medication reminders and blood pressure checks",
    medicationNotes: "Morning antihypertensive medication with breakfast.",
    assignedCaregiverId: "caregiver-002",
  },
  {
    id: "patient-003",
    name: "Maya Thompson",
    roomNumber: "104C",
    carePlanSummary: "Fall-risk observation and hydration support",
    medicationNotes: "Night-time sedative; document dizziness complaints.",
    assignedCaregiverId: null,
  },
  {
    id: "patient-004",
    name: "Luis Ramirez",
    roomNumber: "105A",
    carePlanSummary: "Diabetes management and meal monitoring",
    medicationNotes: "Check glucose before lunch and dinner.",
    assignedCaregiverId: "caregiver-001",
  },
];

const alerts: AlertItem[] = [
  {
    id: "alert-001",
    patientId: "patient-001",
    patientName: "Eleanor Brooks",
    severity: "medium",
    message: "Pain level increased during morning check-in.",
    createdAt: new Date("2025-01-15T08:15:00.000Z").toISOString(),
  },
  {
    id: "alert-002",
    patientId: "patient-002",
    patientName: "Harold Nguyen",
    severity: "high",
    message: "Blood pressure reading above target threshold.",
    createdAt: new Date("2025-01-15T09:05:00.000Z").toISOString(),
  },
  {
    id: "alert-003",
    patientId: "patient-004",
    patientName: "Luis Ramirez",
    severity: "low",
    message: "Missed part of breakfast; encourage hydration at next visit.",
    createdAt: new Date("2025-01-15T09:45:00.000Z").toISOString(),
  },
  {
    id: "alert-004",
    patientId: "patient-001",
    patientName: "Eleanor Brooks",
    severity: "medium",
    message: "Physical therapy session moved to afternoon window.",
    createdAt: new Date("2025-01-15T10:20:00.000Z").toISOString(),
  },
  {
    id: "alert-005",
    patientId: "patient-003",
    patientName: "Maya Thompson",
    severity: "high",
    message: "Near-fall event reported by overnight staff.",
    createdAt: new Date("2025-01-15T11:00:00.000Z").toISOString(),
  },
];

let patientCounter = patients.length + 1;

function nextPatientId(): string {
  return `patient-${String(patientCounter++).padStart(3, "0")}`;
}

function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "caregiver";
}

async function getClerkApiClient(): Promise<ClerkApiClient> {
  const maybeClient = clerkClient as unknown;
  return (await Promise.resolve(
    typeof maybeClient === "function" ? (maybeClient as (...args: never[]) => unknown)() : maybeClient,
  )) as ClerkApiClient;
}

function getPrimaryEmail(user: ClerkUser): string | null {
  const primaryEmailId = user.primaryEmailAddressId;
  if (!primaryEmailId) {
    return user.emailAddresses[0]?.emailAddress ?? null;
  }

  const primaryEmail = user.emailAddresses.find((email) => email.id === primaryEmailId);
  return primaryEmail?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

function getDisplayName(user: ClerkUser): string | null {
  if (user.fullName) {
    return user.fullName;
  }

  const firstName = user.firstName?.trim();
  const lastName = user.lastName?.trim();
  const combined = [firstName, lastName].filter(Boolean).join(" ").trim();

  return combined || null;
}

function buildAdminDashboard(): AdminDashboardData {
  return {
    caregivers,
    patients,
    alerts,
    summary: {
      totalCaregivers: caregivers.length,
      totalPatients: patients.length,
      unassignedPatients: patients.filter((patient) => !patient.assignedCaregiverId).length,
      activeAlerts: alerts.length,
    },
  };
}

function sendUnauthorized(res: Response) {
  return res.status(401).json({ error: "Unauthorized" });
}

function sendForbidden(res: Response) {
  return res.status(403).json({ error: "Forbidden" });
}

function requireUserId(req: Request, res: Response): string | null {
  const { userId } = getAuth(req);

  if (!userId) {
    sendUnauthorized(res);
    return null;
  }

  return userId;
}

async function getCurrentUserSummary(userId: string): Promise<MeResponse> {
  const client = await getClerkApiClient();
  const user = await client.users.getUser(userId);
  const metadataRole = user.publicMetadata.role;

  return {
    userId,
    role: isAppRole(metadataRole) ? metadataRole : null,
    name: getDisplayName(user),
    email: getPrimaryEmail(user),
  };
}

async function requireRole(req: Request, res: Response, allowedRoles: AppRole[]): Promise<MeResponse | null> {
  const userId = requireUserId(req, res);

  if (!userId) {
    return null;
  }

  const summary = await getCurrentUserSummary(userId);

  if (!summary.role || !allowedRoles.includes(summary.role)) {
    sendForbidden(res);
    return null;
  }

  return summary;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/me", async (req, res, next) => {
  try {
    const userId = requireUserId(req, res);

    if (!userId) {
      return;
    }

    const summary = await getCurrentUserSummary(userId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.get("/api/caregiver/dashboard", async (req, res, next) => {
  try {
    const currentUser = await requireRole(req, res, ["caregiver"]);

    if (!currentUser) {
      return;
    }

    const caregiver = caregivers.find((item) => item.clerkUserId === currentUser.userId) ?? null;

    if (!caregiver) {
      const emptyDashboard: CaregiverDashboardData = {
        caregiver: null,
        patients: [],
        alerts: [],
      };

      res.json(emptyDashboard);
      return;
    }

    const assignedPatients = patients.filter((patient) => patient.assignedCaregiverId === caregiver.id);
    const assignedPatientIds = new Set(assignedPatients.map((patient) => patient.id));
    const caregiverAlerts = alerts.filter((alert) => assignedPatientIds.has(alert.patientId));

    const dashboard: CaregiverDashboardData = {
      caregiver,
      patients: assignedPatients,
      alerts: caregiverAlerts,
    };

    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/dashboard", async (req, res, next) => {
  try {
    const currentUser = await requireRole(req, res, ["admin"]);

    if (!currentUser) {
      return;
    }

    res.json(buildAdminDashboard());
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/patients", async (req, res, next) => {
  try {
    const currentUser = await requireRole(req, res, ["admin"]);

    if (!currentUser) {
      return;
    }

    const input: CreatePatientInput = createPatientSchema.parse(req.body);
    const patient: Patient = {
      id: nextPatientId(),
      ...input,
      assignedCaregiverId: null,
    };

    patients.unshift(patient);
    res.status(201).json(patient);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/assignments", async (req, res, next) => {
  try {
    const currentUser = await requireRole(req, res, ["admin"]);

    if (!currentUser) {
      return;
    }

    const input: AssignCaregiverInput = assignCaregiverSchema.parse(req.body);
    const patient = patients.find((item) => item.id === input.patientId);
    const caregiver = caregivers.find((item) => item.id === input.caregiverId);

    if (!patient || !caregiver) {
      res.status(404).json({ error: "Patient or caregiver not found" });
      return;
    }

    patient.assignedCaregiverId = caregiver.id;

    res.json({
      ok: true,
      patient,
      caregiver,
    });
  } catch (error) {
    next(error);
  }
});

if (existsSync(indexHtmlPath)) {
  app.use(express.static(distDir));

  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(indexHtmlPath);
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next;

  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request body",
      details: error.flatten(),
    });
    return;
  }

  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  if (error instanceof Error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
