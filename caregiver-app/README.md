# Caregiver App

Pilot-scale caregiver/admin dashboard built with Vite + React on the frontend and Express on the backend, with Clerk for authentication and role-based access.

## Stack

- React + TypeScript + Vite
- Express + TypeScript
- Clerk authentication
- In-memory seed data only (no database)

## Important Pilot Note

This project uses in-memory data for patients, caregiver assignments, and alerts. Any changes made through the admin UI are reset whenever the server restarts.

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a local env file:
   ```bash
   copy .env.example .env
   ```
   On macOS/Linux:
   ```bash
   cp .env.example .env
   ```

3. Fill in these environment variables in `.env`:
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `PORT` (defaults to `8787`)

4. Start local development:
   ```bash
   npm run dev
   ```

The frontend runs through Vite, and `/api/*` requests are proxied to the Express server on port `8787` during local development.

## Production Start

```bash
npm start
```

## Clerk Setup

1. Create a Clerk application at [https://dashboard.clerk.com/](https://dashboard.clerk.com/).
2. In the Clerk dashboard, copy:
   - the **Publishable Key** into `VITE_CLERK_PUBLISHABLE_KEY`
   - the **Secret Key** into `CLERK_SECRET_KEY`
3. Add your local development URLs to Clerk if prompted, such as:
   - `http://localhost:5173`
   - `http://localhost:8787`

## Role Configuration

The backend reads the user role from Clerk `publicMetadata.role`.

Allowed role values are exactly:

- `admin`
- `caregiver`

You can set this in the Clerk dashboard for a user:

1. Open a user in Clerk.
2. Edit **Public metadata**.
3. Save JSON like one of these examples:

Admin:
```json
{
  "role": "admin"
}
```

Caregiver:
```json
{
  "role": "caregiver"
}
```

## Seeded Demo Caregiver Clerk User IDs

The caregiver dashboard maps the signed-in Clerk `userId` to seeded caregiver records using these exact demo IDs:

- `user_demo_caregiver_1`
- `user_demo_caregiver_2`
- `user_demo_caregiver_3`

These IDs are defined in `server/index.ts`.

If your real Clerk users have different IDs, the backend will still authenticate them, but the caregiver dashboard will return:

- `caregiver: null`
- `patients: []`
- `alerts: []`

To demo assigned caregiver data with a real Clerk account, update the seeded `clerkUserId` values in `server/index.ts` to match your actual Clerk user IDs.

## API Routes

- `GET /api/health`
- `GET /api/me`
- `GET /api/caregiver/dashboard`
- `GET /api/admin/dashboard`
- `POST /api/admin/patients`
- `POST /api/admin/assignments`

All routes except `/api/health` require an authenticated Clerk session.

## Deployment Notes

This app can be deployed to platforms like Railway or Render.

### Required Environment Variables

Set these in your deployment dashboard:

- `PORT`
- `CLERK_SECRET_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY`

### Railway / Render Notes

- The backend listens on `process.env.PORT || 8787`.
- The frontend calls relative `/api/*` paths.
- In production, the Express server serves the built Vite frontend from `dist` alongside the API.
- Because the app uses in-memory data, redeploys and restarts will reset demo patients, assignments, and alerts.

## Render Blueprint

This repository includes a top-level `render.yaml` configured for a single Render web service.

- Service type: `Web Service`
- Root directory: `caregiver-app`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

Set these environment variables in Render before the first deploy:

- `CLERK_SECRET_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY`

Render injects `PORT` automatically for web services, so you do not need to set it manually unless you want a custom local value.

## Development Summary

- Local dev command: `npm run dev`
- Production start command: `npm start`
- Auth roles come from Clerk `publicMetadata.role`
- Data storage is in-memory for pilot/demo use
