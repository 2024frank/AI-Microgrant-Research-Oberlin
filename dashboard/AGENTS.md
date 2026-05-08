<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

### Project layout
- Single Next.js 16 app in `dashboard/` (not a monorepo).
- Package manager: **npm** (lockfile: `package-lock.json`).
- Node 22 is required (matches CI).

### Running the app
- `cd dashboard && npm run dev` starts the dev server on http://localhost:3000.
- The app requires `.env.local` with Firebase config. In Cloud Agent VMs the secrets are injected as environment variables; generate `.env.local` from them before starting:
  ```
  NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, FIREBASE_SERVICE_ACCOUNT
  ```

### Lint / Build / Test
- Lint: `npm run lint` (ESLint 9, flat config; 0 errors expected, some warnings are acceptable).
- Build: `npm run build` (uses Turbopack).
- No automated test suite exists yet.

### Authentication
- Google OAuth via Firebase Auth. All dashboard routes are protected; unauthenticated users are redirected to `/login`.
- The admin email is hardcoded as `frankkusiap@gmail.com` in some API routes.
- Without a real Google sign-in session, protected pages and POST API routes cannot be exercised end-to-end.

### Key caveats
- The `FIREBASE_SERVICE_ACCOUNT` env var is a single-line JSON string (not a file path). Next.js `.env.local` expects it on one line.
- `GITHUB_PAT` is optional; the sync/trigger feature degrades gracefully without it.
