# Security Migration — Staged lockdown of database access

## The problem
The app shipped the Supabase key in its JS bundle and every table had an
`allow_all` RLS policy. That means anyone who opens the site can extract the key
and **read or rewrite the entire database** — the "login" was only enforced in
the browser, not by the database. This migration moves enforcement to the
database (real Supabase Auth + RLS) **without abruptly logging anyone out**.

## How it works
Login UX is unchanged (same username/password). On successful login the app now
**silently establishes a real Supabase Auth session** in the background
(`ensureAuthSession`), self-provisioning the account on first login. The Auth
password is the **SHA-256 hash the app already computes** — deterministic, always
≥ 6 chars, and never the plaintext. Accounts use synthetic emails:
`<username>@astrida.local`.

## Phases

### ✅ Phase 1 — DONE (shipped in code)
- Background Supabase Auth session on login/logout (`ensureAuthSession` /
  `clearAuthSession`).
- **RLS stays `allow_all`** — nothing breaks. Every login quietly provisions and
  signs the user into Supabase Auth.
- **Action for you:** deploy this build, then let it run for a few days so every
  active user logs in at least once (they will — sessions expire naturally).

### ⚙️ Phase 1.5 — One-time Supabase dashboard setup (do before Phase 2)
1. **Authentication → Providers → Email:** enable **Email**, and **turn OFF
   "Confirm email"** (synthetic addresses can't receive mail).
2. Optionally confirm accounts are appearing under **Authentication → Users**
   as people log in on the new build.

### 🔒 Phase 2 — Lock RLS (run when everyone has transitioned)
- Run [`migration_phase2_lock_rls.sql`](migration_phase2_lock_rls.sql) in
  **Supabase → SQL Editor**. It swaps every `allow_all` policy for one that
  requires an authenticated session.
- After this, the public anon key **alone** can no longer touch your data.
- A rollback block is included in that file if anything breaks.

### 🔧 Phase 2 follow-ups (optional, later)
- Reorder `login()` to authenticate to Supabase **first**, then fetch the user
  record — so a brand-new custom user can log in on a fresh device after
  lockdown (default users already work via the bundled defaults).
- Restrict reading other users' password hashes (column-level), and consider
  salted password hashing.

## Safety notes
- Phase 1 is purely additive and non-breaking; if the background auth fails
  while RLS is still permissive, data access is unaffected.
- Do **not** run Phase 2 until Phase 1.5 is done and users have transitioned,
  or unbroadcast clients will lose access until their next login.
