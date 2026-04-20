export type AppRole = "admin" | "caregiver";

export type AlertSeverity = "low" | "medium" | "high";

export interface CaregiverProfile {
  id: string;
  clerkUserId: string;
  name: string;
  email: string;
}

export interface Patient {
  id: string;
  name: string;
  roomNumber: string;
  carePlanSummary: string;
  medicationNotes: string;
  assignedCaregiverId: string | null;
}

export interface AlertItem {
  id: string;
  patientId: string;
  patientName: string;
  severity: AlertSeverity;
  message: string;
  createdAt: string;
}

export interface CaregiverDashboardData {
  caregiver: CaregiverProfile | null;
  patients: Patient[];
  alerts: AlertItem[];
}

export interface AdminDashboardData {
  caregivers: CaregiverProfile[];
  patients: Patient[];
  alerts: AlertItem[];
  summary: {
    totalCaregivers: number;
    totalPatients: number;
    unassignedPatients: number;
    activeAlerts: number;
  };
}

export interface CreatePatientInput {
  name: string;
  roomNumber: string;
  carePlanSummary: string;
  medicationNotes: string;
}

export interface AssignCaregiverInput {
  patientId: string;
  caregiverId: string;
}