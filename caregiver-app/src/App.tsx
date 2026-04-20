import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from "@clerk/clerk-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import "./App.css";
import {
  ApiError,
  assignCaregiver,
  createPatient,
  getAdminDashboard,
  getCaregiverDashboard,
  getMe,
  type MeResponse,
} from "./lib/api";
import type {
  AdminDashboardData,
  AlertSeverity,
  AppRole,
  AssignCaregiverInput,
  CaregiverDashboardData,
  CaregiverProfile,
  CreatePatientInput,
  Patient,
  AlertItem,
} from "./shared/types";

type FeedbackTone = "info" | "success" | "error";

interface FeedbackState {
  tone: FeedbackTone;
  message: string;
}

const defaultPatientDraft = `{
  "name": "",
  "roomNumber": "",
  "condition": ""
}`;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readString(value: unknown, keys: string[]): string | null {
  const record = asRecord(value);

  for (const key of keys) {
    const candidate = record[key];

    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return null;
}

function readArrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function getEntityId(value: unknown, fallback: string): string {
  return readString(value, ["id", "patientId", "caregiverId", "alertId"]) ?? fallback;
}

function getPersonName(value: unknown, fallback: string): string {
  return readString(value, ["name", "fullName"]) ?? fallback;
}

function getPatientName(patient: Patient, fallback: string): string {
  return (
    readString(patient, ["name", "patientName", "fullName"]) ??
    fallback
  );
}

function getAlertPatientName(alert: AlertItem, fallback: string): string {
  return readString(alert, ["patientName", "name"]) ?? fallback;
}

function formatDateLabel(value: unknown): string | null {
  const raw = readString(value, [
    "createdAt",
    "timestamp",
    "lastUpdated",
    "updatedAt",
    "lastCheckIn",
  ]);

  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toLocaleString();
}

function joinDetails(values: Array<string | null>): string {
  return values.filter((value): value is string => Boolean(value && value.trim())).join(" • ");
}

function buildPatientDetails(patient: Patient): string {
  return joinDetails([
    readString(patient, ["roomNumber", "room", "location"]),
    readString(patient, ["condition", "diagnosis", "status"]),
    readString(patient, ["careLevel", "careNeeds"]),
    formatDateLabel(patient),
  ]);
}

function buildCaregiverDetails(caregiver: CaregiverProfile): string {
  return joinDetails([
    readString(caregiver, ["email"]),
    readString(caregiver, ["phone", "phoneNumber"]),
    readString(caregiver, ["shift", "team"]),
    readString(caregiver, ["clerkUserId"]),
  ]);
}

function buildAlertDetails(alert: AlertItem): string {
  return joinDetails([
    getAlertPatientName(alert, "Patient"),
    readString(alert, ["message", "summary", "description"]),
    formatDateLabel(alert),
  ]);
}

function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function parsePatientDraft(rawDraft: string): CreatePatientInput {
  const parsed = JSON.parse(rawDraft) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Patient payload must be a JSON object.");
  }

  return parsed as CreatePatientInput;
}

function StatusMessage({
  tone = "info",
  children,
}: {
  tone?: FeedbackTone;
  children: ReactNode;
}) {
  return <p className={`status-message status-${tone}`}>{children}</p>;
}

function RoleBadge({ role }: { role: AppRole | null }) {
  const label = role ?? "pending";

  return <span className={`role-badge role-${label}`}>{label}</span>;
}

function TopBar({ me }: { me: MeResponse | null }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Care coordination pilot</p>
        <h1>Caregiver App</h1>
      </div>
      <div className="topbar-actions">
        <div className="topbar-user">
          <RoleBadge role={me?.role ?? null} />
          <div className="topbar-user-copy">
            <strong>{me?.name ?? "Signed in user"}</strong>
            <span>{me?.email ?? "Role-aware workspace"}</span>
          </div>
        </div>
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  );
}

function SignedOutView() {
  return (
    <div className="shell-view">
      <header className="topbar">
        <div>
          <p className="eyebrow">Care coordination pilot</p>
          <h1>Caregiver App</h1>
        </div>
      </header>

      <main className="landing-layout">
        <section className="hero-card panel">
          <p className="eyebrow">Pilot-ready access</p>
          <h2>One simple workspace for admins and caregivers.</h2>
          <p className="hero-copy">
            Sign in to load your Clerk-based role and jump directly to the
            caregiver dashboard or the admin command center.
          </p>

          <div className="hero-actions">
            <SignInButton mode="modal">
              <button className="button-primary" type="button">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="button-secondary" type="button">
                Create account
              </button>
            </SignUpButton>
          </div>
        </section>

        <section className="panel">
          <h3>What this pilot supports</h3>
          <ul className="feature-list">
            <li>Role-based routing using Clerk public metadata.</li>
            <li>Caregiver patient lists and live alert feed.</li>
            <li>Admin summaries, patient creation, and staff assignment.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function CaregiverWorkspace() {
  const [data, setData] = useState<CaregiverDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextData = await getCaregiverDashboard();
      setData(nextData);
    } catch (loadError) {
      setError(formatApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDashboard]);

  if (loading) {
    return <StatusMessage>Loading caregiver dashboard…</StatusMessage>;
  }

  if (error) {
    return (
      <div className="panel">
        <StatusMessage tone="error">{error}</StatusMessage>
        <button className="button-secondary" onClick={() => void loadDashboard()} type="button">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return <StatusMessage tone="error">No caregiver data was returned.</StatusMessage>;
  }

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <h2>Caregiver profile</h2>
        {data.caregiver ? (
          <>
            <h3>{getPersonName(data.caregiver, "Assigned caregiver")}</h3>
            <p>{buildCaregiverDetails(data.caregiver) || "Profile details available."}</p>
            <p>
              Assigned patients: <strong>{data.patients.length}</strong>
            </p>
          </>
        ) : (
          <StatusMessage>
            Your Clerk user is signed in, but it is not linked to a seeded caregiver profile yet.
          </StatusMessage>
        )}
      </section>

      <section className="panel patient-list">
        <div className="panel-heading">
          <h2>Assigned patients</h2>
          <button className="button-secondary" onClick={() => void loadDashboard()} type="button">
            Refresh
          </button>
        </div>

        {data.patients.length === 0 ? (
          <StatusMessage>No patients are currently assigned to this caregiver.</StatusMessage>
        ) : (
          <ul className="stack-list">
            {data.patients.map((patient, index) => (
              <li className="list-card" key={getEntityId(patient, `patient-${index}`)}>
                <div className="list-card-heading">
                  <h3>{getPatientName(patient, `Patient ${index + 1}`)}</h3>
                </div>
                <p>{buildPatientDetails(patient) || "Patient details available."}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel alert-feed">
        <div className="panel-heading">
          <h2>Alert feed</h2>
          <span className="count-chip">{readArrayCount(data.alerts)} alerts</span>
        </div>

        {data.alerts.length === 0 ? (
          <StatusMessage>No active alerts right now.</StatusMessage>
        ) : (
          <ul className="stack-list">
            {data.alerts.map((alert, index) => {
              const severity =
                (readString(alert, ["severity"]) as AlertSeverity | null) ?? "low";

              return (
                <li
                  className={`list-card severity-${severity}`}
                  key={getEntityId(alert, `alert-${index}`)}
                >
                  <div className="list-card-heading">
                    <h3>{getAlertPatientName(alert, `Alert ${index + 1}`)}</h3>
                    <span className="pill">{severity}</span>
                  </div>
                  <p>{buildAlertDetails(alert) || "Alert details available."}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function AdminWorkspace() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientDraft, setPatientDraft] = useState(defaultPatientDraft);
  const [createStatus, setCreateStatus] = useState<FeedbackState | null>(null);
  const [assignStatus, setAssignStatus] = useState<FeedbackState | null>(null);
  const [assignForm, setAssignForm] = useState<AssignCaregiverInput>({
    patientId: "",
    caregiverId: "",
  });
  const [isCreating, setIsCreating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextData = await getAdminDashboard();
      setData(nextData);

      setAssignForm((currentForm) => ({
        patientId: currentForm.patientId || getEntityId(nextData.patients[0], ""),
        caregiverId: currentForm.caregiverId || getEntityId(nextData.caregivers[0], ""),
      }));
    } catch (loadError) {
      setError(formatApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDashboard]);

  const handleCreatePatient = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreateStatus(null);
      setIsCreating(true);

      try {
        const payload = parsePatientDraft(patientDraft);
        await createPatient(payload);
        setCreateStatus({
          tone: "success",
          message: "Patient created successfully.",
        });
        setPatientDraft(defaultPatientDraft);
        await loadDashboard();
      } catch (submitError) {
        setCreateStatus({
          tone: "error",
          message: formatApiError(submitError),
        });
      } finally {
        setIsCreating(false);
      }
    },
    [loadDashboard, patientDraft],
  );

  const handleAssignCaregiver = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAssignStatus(null);
      setIsAssigning(true);

      try {
        await assignCaregiver(assignForm);
        setAssignStatus({
          tone: "success",
          message: "Caregiver assignment saved.",
        });
        await loadDashboard();
      } catch (submitError) {
        setAssignStatus({
          tone: "error",
          message: formatApiError(submitError),
        });
      } finally {
        setIsAssigning(false);
      }
    },
    [assignForm, loadDashboard],
  );

  if (loading) {
    return <StatusMessage>Loading admin dashboard…</StatusMessage>;
  }

  if (error) {
    return (
      <div className="panel">
        <StatusMessage tone="error">{error}</StatusMessage>
        <button className="button-secondary" onClick={() => void loadDashboard()} type="button">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return <StatusMessage tone="error">No admin data was returned.</StatusMessage>;
  }

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-heading">
          <h2>Overview</h2>
          <button className="button-secondary" onClick={() => void loadDashboard()} type="button">
            Refresh
          </button>
        </div>
        <div className="summary-grid">
          <article className="summary-card">
            <span className="summary-label">Caregivers</span>
            <strong>{data.caregivers.length}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">Patients</span>
            <strong>{data.patients.length}</strong>
          </article>
          <article className="summary-card">
            <span className="summary-label">Alerts</span>
            <strong>{data.alerts.length}</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <h2>Add patient</h2>
        <p className="helper-text">
          Submit a JSON payload that matches the shared <code>CreatePatientInput</code> contract.
        </p>
        <form className="form-grid" onSubmit={handleCreatePatient}>
          <label>
            Patient payload
            <textarea
              name="patientPayload"
              onChange={(event) => setPatientDraft(event.target.value)}
              rows={8}
              value={patientDraft}
            />
          </label>
          <button className="button-primary" disabled={isCreating} type="submit">
            {isCreating ? "Saving…" : "Create patient"}
          </button>
          {createStatus ? (
            <StatusMessage tone={createStatus.tone}>{createStatus.message}</StatusMessage>
          ) : null}
        </form>
      </section>

      <section className="panel">
        <h2>Assign caregiver</h2>
        <form className="form-grid" onSubmit={handleAssignCaregiver}>
          <label>
            Patient
            <select
              name="patientId"
              onChange={(event) =>
                setAssignForm((currentForm) => ({
                  ...currentForm,
                  patientId: event.target.value,
                }))
              }
              value={assignForm.patientId}
            >
              {data.patients.map((patient, index) => (
                <option key={getEntityId(patient, `patient-option-${index}`)} value={getEntityId(patient, "")}>
                  {getPatientName(patient, `Patient ${index + 1}`)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Caregiver
            <select
              name="caregiverId"
              onChange={(event) =>
                setAssignForm((currentForm) => ({
                  ...currentForm,
                  caregiverId: event.target.value,
                }))
              }
              value={assignForm.caregiverId}
            >
              {data.caregivers.map((caregiver, index) => (
                <option
                  key={getEntityId(caregiver, `caregiver-option-${index}`)}
                  value={getEntityId(caregiver, "")}
                >
                  {getPersonName(caregiver, `Caregiver ${index + 1}`)}
                </option>
              ))}
            </select>
          </label>

          <button
            className="button-primary"
            disabled={
              isAssigning || !assignForm.patientId || !assignForm.caregiverId || data.patients.length === 0
            }
            type="submit"
          >
            {isAssigning ? "Saving…" : "Assign caregiver"}
          </button>

          {assignStatus ? (
            <StatusMessage tone={assignStatus.tone}>{assignStatus.message}</StatusMessage>
          ) : null}
        </form>
      </section>

      <section className="panel patient-list">
        <h2>Patients</h2>
        {data.patients.length === 0 ? (
          <StatusMessage>No patients available yet.</StatusMessage>
        ) : (
          <ul className="stack-list">
            {data.patients.map((patient, index) => (
              <li className="list-card" key={getEntityId(patient, `admin-patient-${index}`)}>
                <div className="list-card-heading">
                  <h3>{getPatientName(patient, `Patient ${index + 1}`)}</h3>
                </div>
                <p>{buildPatientDetails(patient) || "Patient details available."}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Caregivers</h2>
        <ul className="stack-list">
          {data.caregivers.map((caregiver, index) => (
            <li className="list-card" key={getEntityId(caregiver, `admin-caregiver-${index}`)}>
              <div className="list-card-heading">
                <h3>{getPersonName(caregiver, `Caregiver ${index + 1}`)}</h3>
              </div>
              <p>{buildCaregiverDetails(caregiver) || "Caregiver details available."}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel alert-feed">
        <h2>Recent alerts</h2>
        {data.alerts.length === 0 ? (
          <StatusMessage>No alerts in the system.</StatusMessage>
        ) : (
          <ul className="stack-list">
            {data.alerts.map((alert, index) => {
              const severity =
                (readString(alert, ["severity"]) as AlertSeverity | null) ?? "low";

              return (
                <li
                  className={`list-card severity-${severity}`}
                  key={getEntityId(alert, `admin-alert-${index}`)}
                >
                  <div className="list-card-heading">
                    <h3>{getAlertPatientName(alert, `Alert ${index + 1}`)}</h3>
                    <span className="pill">{severity}</span>
                  </div>
                  <p>{buildAlertDetails(alert) || "Alert details available."}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function AccessPendingView({ me }: { me: MeResponse }) {
  return (
    <div className="panel">
      <h2>Access pending</h2>
      <StatusMessage>
        This signed-in account does not have an approved role yet. Set Clerk public metadata role to
        <strong> admin</strong> or <strong>caregiver</strong> to unlock the appropriate view.
      </StatusMessage>
      <p>
        Signed in as <strong>{me.email ?? me.name ?? me.userId ?? "current user"}</strong>.
      </p>
    </div>
  );
}

function SignedInView() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextMe = await getMe();
      setMe(nextMe);
    } catch (loadError) {
      setError(formatApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadMe();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadMe]);

  return (
    <div className="shell-view">
      <TopBar me={me} />
      <main className="workspace">
        {loading ? <StatusMessage>Loading account details…</StatusMessage> : null}
        {error ? (
          <div className="panel">
            <StatusMessage tone="error">{error}</StatusMessage>
            <button className="button-secondary" onClick={() => void loadMe()} type="button">
              Retry
            </button>
          </div>
        ) : null}
        {!loading && !error && me?.role === "caregiver" ? <CaregiverWorkspace /> : null}
        {!loading && !error && me?.role === "admin" ? <AdminWorkspace /> : null}
        {!loading && !error && me && !me.role ? <AccessPendingView me={me} /> : null}
      </main>
    </div>
  );
}

export default function App() {
  const { isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div className="app-shell">
        <div className="shell-view">
          <header className="topbar">
            <div>
              <p className="eyebrow">Care coordination pilot</p>
              <h1>Caregiver App</h1>
            </div>
          </header>
          <main className="workspace">
            <StatusMessage>Loading authentication…</StatusMessage>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SignedOut>
        <SignedOutView />
      </SignedOut>
      <SignedIn>
        <SignedInView />
      </SignedIn>
    </div>
  );
}
