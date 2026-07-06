# IndiaPortfolio — Project Documentation

> A personal Indian stock portfolio tracker that fetches live prices and financial ratios directly from [Screener.in](https://www.screener.in). Built with React 19 + Vite on the frontend and a lightweight Express.js proxy backend, deployable as a serverless app on Vercel.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Project Structure](#4-project-structure)
5. [Features](#5-features)
6. [Data Flow](#6-data-flow)
7. [Authentication Model](#7-authentication-model)
8. [API Endpoints](#8-api-endpoints)
9. [Component Reference](#9-component-reference)
10. [Styling System](#10-styling-system)
11. [Local Development](#11-local-development)
12. [Deployment (Vercel)](#12-deployment-vercel)
13. [Known Limitations & Caveats](#13-known-limitations--caveats)
14. [Environment & Configuration](#14-environment--configuration)

---

## 1. Project Overview

**IndiaPortfolio** is a browser-based equity portfolio manager tailored for Indian stock market investors. It allows users to:

- **Track holdings** across NSE/BSE-listed equities using real-time data scraped from Screener.in.
- **Record BUY and SELL transactions** with date, quantity, and price.
- **View portfolio P&L** — total invested capital, current market value, and overall profit/loss with percentage returns.
- **Visualize allocation** through an interactive donut chart.
- **Inspect stock fundamentals** (PE ratio, ROCE, ROE, Book Value, Dividend Yield, etc.) per holding.
- **Search any Indian stock** using Screener.in's autocomplete API.

All user data (accounts, transactions) is stored entirely in the **browser's `localStorage`** — there is no backend database. The backend is a **stateless proxy** that scrapes Screener.in on behalf of the frontend.

---

## 2. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | React | ^19.2.6 |
| Build Tool | Vite | ^8.0.12 |
| UI Icons | lucide-react | ^1.18.0 |
| HTTP Client (backend) | axios | ^1.17.0 |
| HTML Scraper | cheerio | ^1.2.0 |
| Backend Framework | Express.js | ^5.2.1 |
| Auth (tokens) | jsonwebtoken | ^9.0.3 |
| Password Hashing | bcryptjs | ^3.0.3 |
| Dev Runner | concurrently + nodemon | ^9.2.1 / ^3.1.14 |
| Linter | ESLint | ^10.3.0 |
| Deployment | Vercel | — |

> **Note:** `jsonwebtoken` and `bcryptjs` are installed as dependencies but the current implementation uses localStorage-based mock authentication (see [Authentication Model](#7-authentication-model)).

---

## 3. Architecture

```
┌─────────────────────────────────────────┐
│           Browser (Client)              │
│                                         │
│  React App (Vite)                       │
│  ├─ Login.jsx  — localStorage auth      │
│  ├─ Dashboard.jsx — portfolio UI        │
│  └─ AllocationChart.jsx — donut chart  │
│                                         │
│  localStorage:                          │
│  ├─ indiaportfolio_users  (accounts)    │
│  ├─ indiaportfolio_txs    (transactions)│
│  └─ token                (session key)  │
└──────────────┬──────────────────────────┘
               │  /api/stocks/search?q=...
               │  /api/stocks/price?urlPath=...
               ▼
┌─────────────────────────────────────────┐
│         Express.js Backend              │
│         (Serverless on Vercel)          │
│                                         │
│  api/index.js   — route definitions     │
│  api/scraper.js — Screener.in scraper  │
│                  with 5-min in-memory  │
│                  cache                  │
└──────────────┬──────────────────────────┘
               │  HTTPS GET requests
               ▼
┌─────────────────────────────────────────┐
│          Screener.in                    │
│  /api/company/search/?q=...            │
│  /company/<SYMBOL>/consolidated/        │
└─────────────────────────────────────────┘
```

**Local Development:** Vite's dev server proxies all `/api/*` requests to `http://localhost:3000` (the Express server run with nodemon).

**Production (Vercel):** All `/api/*` routes are rewritten to `api/index.js` as a Vercel Serverless Function. The frontend static assets are served from the `dist/` build output.

---

## 4. Project Structure

```
IndiaPortfolio/
├── api/
│   ├── index.js          # Express app — route definitions & middleware
│   └── scraper.js        # Screener.in proxy: search + price scraper
│
├── src/
│   ├── components/
│   │   ├── Dashboard.jsx      # Main portfolio view (holdings, transactions, search)
│   │   ├── Login.jsx          # Login / Register form (localStorage auth)
│   │   └── AllocationChart.jsx # Interactive SVG donut chart
│   ├── assets/
│   │   └── hero.png           # Static asset
│   ├── App.jsx                # Root component — auth state, header, routing
│   ├── App.css                # App-level styles
│   ├── index.css              # Global design system & component styles
│   └── main.jsx               # React 19 entry point
│
├── public/
│   ├── favicon.svg            # App favicon
│   └── icons.svg              # SVG icon sprite
│
├── index.html                 # HTML shell
├── vite.config.js             # Vite + dev proxy config
├── vercel.json                # Vercel routing rewrites
├── package.json               # Scripts, dependencies
├── eslint.config.js           # ESLint flat config
└── projectinfo.md             # This file
```

---

## 5. Features

### 5.1 Authentication

- **Register:** Creates a new user object (name, email, password in plain text) and stores it in `localStorage` under `indiaportfolio_users`.
- **Login:** Validates email + password against the stored user list. On success, sets a `mock-token-<userId>` string as the session token in `localStorage`.
- **Session persistence:** On app load, reads the token from `localStorage` and looks up the user from the stored users array.
- **Logout:** Clears the `token` key from `localStorage` and resets the React state.

> ⚠️ Passwords are stored in **plain text** in localStorage. This is a personal/local tool — do **not** use it for production with real credentials.

### 5.2 Holdings Dashboard

- **Portfolio Summary Cards** (3-column grid):
  - **Current Portfolio Value** — sum of `quantity × currentPrice` across all active holdings, with a glow effect (green = profit, red = loss).
  - **Total Capital Invested** — sum of `quantity × avgBuyPrice`.
  - **Total Profit / Loss** — absolute P&L and percentage return badge.

- **Asset Allocation Donut Chart** — interactive SVG donut showing each stock's weight by current market value. Hover to highlight a segment and display the symbol + percentage in the center.

- **Stock Search Panel** — autocomplete search powered by the `/api/stocks/search` endpoint. Typing 2+ characters triggers a search against Screener.in. Clicking a result opens the transaction dialog pre-filled with the stock details and a live price fetch.

- **Refresh Quotes button** — manually re-fetches prices from Screener.in for all held stocks.

### 5.3 Holdings Table

Columns: **Equity / Stock** | **Quantity** | **Avg. Cost** | **Current Price** | **Invested Capital** | **Market Value** | **Total Returns** | **Actions**

Per-row actions:
- **ℹ Info** — opens a modal with stock fundamentals (Market Cap, P/E, Book Value, Dividend Yield, ROCE, ROE, Face Value) scraped live.
- **BUY** — opens the transaction dialog to add more shares.
- **SELL** — opens the transaction dialog to sell shares (validates against current quantity).

### 5.4 Transaction Log

Columns: **Date** | **Equity** | **Action (BUY/SELL badge)** | **Shares** | **Avg Price** | **Total Capital** | **Manage (delete)**

Transactions are sorted latest-first. Deleting a transaction triggers a holdings recalculation.

### 5.5 Transaction Dialog (Modal)

A `<dialog>` element used to record any transaction:
- Toggle between **BUY** (green) / **SELL** (red) type.
- Fields: Symbol (auto-uppercase), Company Name, Screener.in URL Path, Quantity, Price (auto-fetched from API), Date.
- SELL validation: prevents selling more shares than currently held.
- On submit: saves to `indiaportfolio_txs` in localStorage, closes dialog, and re-fetches portfolio.

### 5.6 Stock Fundamentals Modal

A second `<dialog>` showing scraped financial ratios for a selected holding:
- Current Market Price
- Market Capitalization (Cr.)
- Stock P/E Ratio
- Book Value per Share
- Dividend Yield (%)
- Return on Capital Employed (ROCE %)
- Return on Equity (ROE %)
- Face Value

---

## 6. Data Flow

### Holdings Calculation (Client-side)

```
localStorage: indiaportfolio_txs[]
        │
        ▼ filter by userId, sort chronologically
        │
        ▼ for each transaction:
        │   BUY  → quantity += qty,  totalCost += qty * price
        │   SELL → quantity -= qty,  totalCost = qty * avgBuyPrice
        │
        ▼ filter active holdings (quantity > 0)
        │
        ▼ for each active holding → fetch /api/stocks/price?urlPath=...
        │
        ▼ compute:
            currentValue       = quantity × currentPrice
            investedValue      = quantity × avgBuyPrice
            profitLoss         = currentValue − investedValue
            profitLossPercentage = (profitLoss / investedValue) × 100
```

### Price Fetching (Backend Scraper)

```
GET /api/stocks/price?urlPath=/company/RELIANCE/consolidated/
        │
        ▼ api/scraper.js: scrapeStockDetails(urlPath)
        │
        ▼ Check in-memory quoteCache (5-min TTL)
        │   HIT  → return cached data
        │   MISS → GET https://www.screener.in/company/RELIANCE/consolidated/
        │           cheerio.load(html)
        │           parse #top-ratios li → currentPrice, marketCap, peRatio, …
        │           store in quoteCache
        │
        ▼ return JSON: { symbol, name, currentPrice, marketCap, peRatio, … }
```

---

## 7. Authentication Model

The current implementation uses **client-side localStorage-only authentication**:

| Item | localStorage Key | Shape |
|---|---|---|
| User registry | `indiaportfolio_users` | `Array<{ id, name, email, password, createdAt }>` |
| Transaction log | `indiaportfolio_txs` | `Array<{ id, userId, symbol, name, urlPath, type, quantity, price, date, createdAt }>` |
| Active session | `token` | `"mock-token-<userId>"` |

The `userId` is derived from the token by stripping the `mock-token-` prefix. All data lookups filter by `userId` so different registered users see separate data in the same browser.

> This approach requires no server, no database, and no real JWT signing. The `jsonwebtoken` and `bcryptjs` packages are vestigial from an earlier server-auth design.

---

## 8. API Endpoints

All routes are served from `api/index.js` (Express 5).

### `GET /api/stocks/search`

Proxies the Screener.in autocomplete API.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | Yes | Search query (e.g., "RELIANCE", "TCS") |

**Response:** `Array<{ id: number, name: string, url: string }>`

```json
[
  { "id": 24, "name": "Reliance Industries", "url": "/company/RELIANCE/consolidated/" },
  { "id": 1153, "name": "Reliance Power", "url": "/company/RPOWER/consolidated/" }
]
```

---

### `GET /api/stocks/price`

Scrapes live stock details from the Screener.in company page. Results are cached in-memory for **5 minutes** per `urlPath`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `urlPath` | string | Yes | Screener.in URL path, e.g. `/company/RELIANCE/consolidated/` |

**Response:**

```json
{
  "symbol": "RELIANCE",
  "name": "Reliance Industries",
  "urlPath": "/company/RELIANCE/consolidated/",
  "currentPrice": 1450.35,
  "marketCap": 982000,
  "peRatio": 24.5,
  "bookValue": 1020.1,
  "dividendYield": 0.34,
  "roce": 12.5,
  "roe": 9.8,
  "faceValue": 10,
  "scrapedAt": "2026-06-12T14:00:00.000Z"
}
```

---

### `GET /api`

Health check endpoint.

**Response:** `{ "status": "ok", "service": "indiaportfolio-stateless-backend" }`

---

## 9. Component Reference

### `App.jsx`

**Purpose:** Root component. Manages global auth state and renders either the Login screen or the authenticated layout.

**State:**
- `token` — read from `localStorage` on init; cleared on logout.
- `user` — `{ id, email, name }` looked up from `indiaportfolio_users`.
- `loading` — spinner shown while validating the stored token.

**Key behaviors:**
- On mount, if a token exists, validates it against localStorage users. If invalid, logs out.
- Renders a sticky glassmorphism header with the app logo and logout button when authenticated.
- Passes `token` down to `<Dashboard>`.

---

### `src/components/Login.jsx`

**Purpose:** Handles user registration and login via localStorage.

**State:** `isLogin` (toggle), `email`, `password`, `name`, `error`, `loading`.

**Key behaviors:**
- `isLogin = true` → Login flow: matches email + password against stored users.
- `isLogin = false` → Register flow: checks for duplicate email, creates new user entry.
- Calls `onLoginSuccess(token, user)` on success to bubble up to `App.jsx`.
- 600ms artificial delay to simulate async auth.

---

### `src/components/Dashboard.jsx`

**Purpose:** Core portfolio view. The largest component (~1095 lines).

**State groups:**
- Tab state: `activeTab` (`'holdings'` | `'transactions'`)
- Portfolio data: `holdings[]`, `summary`, `transactions[]`, `loading`, `refreshing`, `error`
- Search: `searchQuery`, `searchResults`, `showSearchDropdown`, `searchLoading`
- Transaction form: `formType`, `formSymbol`, `formName`, `formUrlPath`, `formQuantity`, `formPrice`, `formDate`, `formLoading`, `formError`
- Details overlay: `selectedHolding`

**Refs:** `dialogRef` (transaction modal), `detailsDialogRef` (fundamentals modal), `searchContainerRef` (click-outside detection).

**Key functions:**

| Function | Description |
|---|---|
| `fetchPortfolio(isManualRefresh)` | Reads txs from localStorage, calculates holdings, fetches live prices via API |
| `fetchTransactions()` | Reads and sorts transactions from localStorage |
| `handleSearchChange(e)` | Debounced (by length check) autocomplete against `/api/stocks/search` |
| `openTransactionDialog(symbol, name, urlPath, type)` | Opens modal, pre-fetches current price |
| `handleAddTransactionSubmit(e)` | Validates and saves a new transaction to localStorage |
| `handleDeleteTransaction(id)` | Removes a transaction and triggers portfolio recalculation |
| `showHoldingDetails(holding)` | Opens the fundamentals modal for a holding |

---

### `src/components/AllocationChart.jsx`

**Purpose:** Pure SVG donut chart showing portfolio allocation by current market value.

**Props:** `holdings[]` — array of holding objects with `symbol`, `name`, `currentValue`.

**Implementation:**
- Calculates each holding's percentage of total portfolio value.
- Renders stacked SVG `<circle>` elements with `strokeDasharray` / `strokeDashoffset` for donut segments.
- Hover interaction: enlarges stroke width and adds a glow `drop-shadow` filter on the hovered segment; displays symbol + percentage in the donut center.
- Neon color palette: 9 colors cycling by index (Indigo → Purple → Teal → Cyan → Blue → Emerald → Amber → Pink → Rose).
- Scrollable legend list on the right showing symbol, name (truncated), value (₹), and percentage.

---

## 10. Styling System

The app uses **Vanilla CSS** with a comprehensive design token system defined in `src/index.css`.

### Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#080b11` | Page background |
| `--bg-secondary` | `#0f1422` | Secondary surfaces |
| `--card-bg` | `rgba(18,24,38,0.6)` | Glassmorphism card fill |
| `--card-border` | `rgba(255,255,255,0.07)` | Card borders |
| `--primary` | `#6366f1` | Indigo accent |
| `--secondary` | `#a855f7` | Purple accent |
| `--accent` | `#14b8a6` | Teal accent |
| `--success` | `#10b981` | Profit / BUY / positive |
| `--danger` | `#f43f5e` | Loss / SELL / error |
| `--text-primary` | `#f8fafc` | Main text |
| `--text-secondary` | `#94a3b8` | Subdued labels |
| `--text-muted` | `#64748b` | Placeholder / metadata |

### Typography

- **Body:** `Inter` (Google Fonts) — 300–700 weights
- **Display/Headings:** `Outfit` (Google Fonts) — 400–800 weights

### Key CSS Classes

| Class | Description |
|---|---|
| `.glass-panel` | Glassmorphism card with `backdrop-filter: blur(16px)` |
| `.glass-panel-interactive` | Card with hover lift + indigo border glow |
| `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-icon` | Button variants |
| `.form-input`, `.form-label` | Styled form controls |
| `.badge`, `.badge-success`, `.badge-danger` | Pill badges |
| `.custom-table-container`, `.custom-table` | Styled data tables |
| `.suggestions-box`, `.suggestion-item` | Autocomplete dropdown |
| `.animate-fade-in` | `fadeInUp` entry animation |
| `.glow-success`, `.glow-danger` | Box shadow glow utilities |
| `.grid-cols-3` | 3-column responsive grid (1-col on mobile ≤768px) |
| `.container` | Max-width `1280px` centered container |

### Background

Full-page radial gradient overlays create a subtle aurora effect:
- Top-left: Indigo `8%` opacity
- Bottom-right: Purple `8%` opacity
- Center: Teal `3%` opacity

---

## 11. Local Development

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Setup

```bash
# Install all dependencies
npm install

# Start both frontend (Vite) and backend (Express) concurrently
npm run dev
```

This runs:
- `vite` dev server on **http://localhost:5173** (default Vite port)
- `nodemon api/index.js` Express server on **http://localhost:3000**
- Vite proxies all `/api/*` calls from the frontend to `localhost:3000`

### Individual Scripts

```bash
npm run dev:client   # Vite frontend only
npm run dev:server   # Express API server only (with nodemon)
npm run build        # Production Vite build → dist/
npm run preview      # Preview the production build locally
npm run lint         # Run ESLint
```

---

## 12. Deployment (Vercel)

The app is configured for zero-config deployment to Vercel.

### `vercel.json`

```json
{
  "version": 2,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" },
    { "source": "/(.*)",     "destination": "/$1" }
  ]
}
```

- All `/api/*` requests are routed to `api/index.js` as a **Serverless Function**.
- All other routes serve the Vite-built static files from `dist/`.

### Deploy steps

```bash
# Install Vercel CLI (if needed)
npm i -g vercel

# Deploy (first time — interactive project setup)
vercel

# Subsequent deploys
vercel --prod
```

> The `.vercel/` directory contains the project link metadata created during the first deploy.

### Important Vercel Notes

- The **in-memory `quoteCache`** in `scraper.js` will reset between cold starts. Quotes will always be fresh fetched on the first request to each function instance.
- Vercel Serverless Functions have a **10s default timeout** (Hobby plan). Screener.in scraping is configured with a 10s axios timeout — this may occasionally time out under load.

---

## 13. Known Limitations & Caveats

| # | Limitation | Impact |
|---|---|---|
| 1 | **Plain-text passwords in localStorage** | Security risk if browser storage is accessed. For personal local use only. |
| 2 | **No server-side persistence** | All data is tied to a single browser. Clearing localStorage loses all data. No cross-device sync. |
| 3 | **Screener.in scraping dependency** | If Screener.in changes its HTML structure or blocks requests, price fetching will break without code changes. |
| 4 | **No CSRF / rate limiting on API** | The proxy backend has no authentication checks — any caller can use the `/api/stocks/*` endpoints. |
| 5 | **In-memory cache resets on cold start** | On Vercel, every new function invocation starts fresh; the 5-min cache is per-instance only. |
| 6 | **No fractional share validation** | The transaction form accepts decimal quantities, but SELL validation uses simple arithmetic. |
| 7 | **Single currency (₹ INR)** | All amounts are displayed in Indian Rupees with `en-IN` locale formatting. |
| 8 | **No historical price data** | Only current live prices are shown. No charts of price history. |
| 9 | **No portfolio import/export** | There is no way to backup or restore localStorage data from the UI. |

---

## 14. Environment & Configuration

### `vite.config.js`

```js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
```

### Environment Variables

The project currently uses **no `.env` variables**. The Express server port defaults to `3000` via:

```js
const PORT = process.env.PORT || 3000;
```

Vercel automatically sets `process.env.VERCEL = '1'` in production, which suppresses the `app.listen()` call (since Vercel manages the function lifecycle).

### ESLint

Configured via `eslint.config.js` using the ESLint flat config format with:
- `@eslint/js` recommended rules
- `eslint-plugin-react-hooks` — enforces hooks rules
- `eslint-plugin-react-refresh` — enforces React Fast Refresh compatibility
- Browser globals enabled

---

*Last updated: June 2026*
