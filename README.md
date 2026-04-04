<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# أستريدا ERP — نظام التوزيع

**A bilingual (Arabic / English) ERP system for frozen-food distribution, built with React + TypeScript + Supabase.**

[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase)](https://supabase.com)
[![PWA](https://img.shields.io/badge/PWA-Ready-purple)](https://web.dev/progressive-web-apps/)

</div>

---

## ✨ Features

| Module | Description |
|---|---|
| 📦 Inventory | Real-time stock tracking and warehouse management |
| 🚚 Car Loading | Load planning and dispatch per vehicle |
| 💰 Sales & Invoices | Invoice generation with PDF export |
| 👥 Customers | Customer ledger and account history |
| 💳 Payments | Payment collection and reconciliation |
| 💸 Expenses & Salaries | Expense and payroll management |
| 🏦 Capital & Transfers | Capital accounts and inter-account transfers |
| 📊 Reports & Ledger | Analytics, charts, and full general ledger |
| ⚙️ Settings | Role-based access control and user management |

Additional capabilities:
- 🌐 **Bilingual** — full Arabic (RTL) and English (LTR) support
- 📱 **Mobile-first** — fully responsive, installable as a PWA
- 🔌 **Offline support** — Service Worker caches data for offline use
- 🔐 **Role-based permissions** — Manager, Accountant, Warehouse, Salesperson, Admin

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- A [Supabase](https://supabase.com) project (free tier works fine)
- A [Google Gemini API key](https://aistudio.google.com/app/apikey) (optional, for AI features)

### 1 — Clone and install

```bash
git clone https://github.com/ammarsiddig/astreda-erp.git
cd astreda-erp
npm install
```

### 2 — Configure environment variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env.local
```

Open `.env.local` and set:

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
GEMINI_API_KEY=<your-gemini-key>   # optional
```

### 3 — Set up the database

Run the SQL schema in your Supabase SQL editor:

```bash
# Copy the contents of supabase_schema.sql into the Supabase dashboard
# Dashboard → SQL Editor → New query → paste → Run
```

### 4 — Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server on port 3000 |
| `npm run build` | Create an optimized production build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Type-check the project with TypeScript (`tsc --noEmit`) |
| `npm run clean` | Remove the `dist/` folder |

---

## 📱 Editing from a Mobile Phone

You don't need a laptop to make changes! GitHub offers two browser-based editing options that work great on mobile.

### Option A — GitHub Web Editor (quickest, no setup)

1. Open the repository on GitHub in your mobile browser.
2. Press the **`.`** (period) key **or** change the URL from `github.com` → `github.dev`:
   ```
   https://github.dev/ammarsiddig/astreda-erp
   ```
3. A lightweight VS Code editor opens in the browser — no installation required.
4. Browse, edit files, stage your changes with the **Source Control** panel on the left, and commit directly.

> **Best for:** small fixes, text changes, updating a config file, or editing the README.

### Option B — GitHub Codespaces (full dev environment in the browser)

1. On the repository page tap **Code** → **Codespaces** → **Create codespace on main**.
2. A full cloud VS Code environment with Node.js pre-installed opens in your browser.
3. Run the usual commands in the built-in terminal:
   ```bash
   npm install
   npm run dev
   ```
4. Codespaces automatically forwards port 3000, so you can preview the running app from your phone.

> **Best for:** larger changes, adding new features, or running and testing the app.

### Option C — GitHub Mobile App

The [GitHub mobile app](https://github.com/mobile) (iOS / Android) lets you:
- Browse files and read code
- Create and review issues and pull requests
- Leave comments and approve reviews

> **Best for:** reviewing changes, managing issues, and approvals — not for writing code.

---

## 🗂️ Project Structure

```
astreda-erp/
├── public/               # Static assets & PWA files
│   ├── manifest.json     # PWA manifest (name, icons, theme)
│   └── sw.js             # Service Worker for offline support
├── src/
│   ├── components/       # Shared UI components
│   │   ├── Layout.tsx        # App shell with responsive sidebar/nav
│   │   ├── Modal.tsx         # Generic modal (bottom-sheet on mobile)
│   │   ├── InvoiceModal.tsx  # Invoice creation/editing modal
│   │   └── SyncStatusIndicator.tsx
│   ├── pages/            # One file per route/module
│   │   ├── Dashboard.tsx
│   │   ├── Inventory.tsx
│   │   ├── Sales.tsx
│   │   ├── Customers.tsx
│   │   └── ... (16 pages total)
│   ├── store/            # React Context state management
│   ├── lib/              # Utilities: permissions, Supabase client, helpers
│   ├── hooks/            # Custom React hooks
│   ├── types/            # TypeScript type definitions
│   └── App.tsx           # Root router and route guards
├── supabase_schema.sql   # Full database schema
├── index.html            # HTML entry point (PWA meta tags)
├── vite.config.ts        # Vite build configuration
└── tailwind.config.js    # Tailwind CSS configuration
```

---

## 🤝 Contributing

1. **Fork** the repository and create a feature branch:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes and **lint** before committing:
   ```bash
   npm run lint
   ```
3. **Commit** with a descriptive message and open a **Pull Request**.

For small edits directly on GitHub, the [web editor](#option-a--github-web-editor-quickest-no-setup) is the easiest path.

---

## 🔗 Links

- **Live app (AI Studio):** https://ai.studio/apps/2db482b1-ad01-4a6d-9f4f-ad486382679f
- **Supabase:** https://supabase.com
- **Vite:** https://vitejs.dev
- **Tailwind CSS:** https://tailwindcss.com
