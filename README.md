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

## Overview

أستريدا ERP is a web-based ERP system for frozen-food distribution. It supports Arabic and English, works well on mobile devices, and includes cloud sync with Supabase.

## Features

| Module | Description |
|---|---|
| 📦 Inventory | Stock tracking and warehouse management |
| 🚚 Car Loading | Vehicle loading and dispatch workflows |
| 💰 Sales & Invoices | Invoice creation with printable output |
| 👥 Customers | Customer records and account history |
| 💳 Payments | Payment entry and reconciliation |
| 💸 Expenses & Salaries | Expense and payroll tracking |
| 🏦 Capital & Transfers | Capital management and account transfers |
| 📊 Reports & Ledger | Reporting, charts, and ledger views |
| ⚙️ Settings | Users, roles, and permissions |

Additional capabilities:
- 🌐 Arabic (RTL) and English (LTR) interface
- 📱 Responsive layout with PWA support
- 🔌 Offline caching through a service worker
- 🔐 Role-based access control

---

## Live App

- Production: https://astrida-erp.vercel.app/

---

## Quick Start

### Requirements

- Node.js 20 or later
- A Supabase project
- A Gemini API key (optional)

### 1. Clone and install

```bash
git clone https://github.com/ammarsiddig/astreda-erp.git
cd astreda-erp
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Then update `.env.local` with your project values.

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
GEMINI_API_KEY=<your-gemini-key>
APP_URL=https://astrida-erp.vercel.app/
```

### 3. Set up the database

Apply the SQL in `supabase_schema.sql` from your Supabase SQL editor.

### 4. Start the development server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the local development server |
| `npm run build` | Build the production bundle |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run TypeScript checks |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run clean` | Remove the `dist/` directory |

---

## Project Structure

```text
astreda-erp/
├── public/               # Static assets and PWA files
│   ├── manifest.json
│   └── sw.js
├── src/
│   ├── components/       # Shared UI components
│   ├── pages/            # Application pages
│   ├── store/            # State management
│   ├── lib/              # Utilities and helpers
│   ├── hooks/            # Custom hooks
│   ├── types/            # TypeScript types
│   └── App.tsx
├── supabase_schema.sql
├── index.html
├── vite.config.ts
└── tailwind.config.js
```

---

## Contributing

1. Fork the repository and create a branch.
2. Make your changes.
3. Run checks before opening a pull request.

```bash
npm run lint
npm test
```

---

## Links

- Live app: https://astrida-erp.vercel.app/
- Supabase: https://supabase.com
- Vite: https://vitejs.dev
- Tailwind CSS: https://tailwindcss.com
