# WMPersonal

A personal Warframe Market monitoring dashboard — full stack, runs entirely on your own computer.

## Features

- **Market Monitor** — search any item, fetch live online seller prices, view snapshot history and 48h/90d statistics charts
- **User Orders** — look up any warframe.market user's buy/sell listings, cross-referenced with your local DB history
- **Favourites** — track specific traders, auto-refresh every 5 minutes, compare their prices against live market
- **Scanner** — bulk-fetch price snapshots for entire item groups (Arcanes, Mods, Primary Sets, etc.) with live progress
- **Profit Analyzer** — scan a group for margin, volume, sell speed, and a composite profit score
- **Alecaframe** *(in progress)* — personal trade history, relic inventory, and account stats

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| HTTP client | undici |
| Charts | Recharts |
| Market API | warframe.market v2 + v1 stats |
| Personal stats | Alecaframe stats API |

## Project Structure

```
WMPersonal/
├── backend/
│   ├── index.js          — Express server entry point
│   ├── db.js             — SQLite setup and migrations
│   ├── queue.js          — Rate-limited fetch queue (3 req/s)
│   ├── sync.js           — Item list sync + price snapshot fetcher
│   ├── scheduler.js      — Auto-refresh favourites every 5 min
│   ├── .env              — Private keys (never committed)
│   └── routes/
│       ├── items.js      — GET /api/items
│       ├── prices.js     — POST /api/prices/fetch, GET /api/prices/:slug
│       ├── users.js      — GET /api/users/:slug/orders
│       ├── favourites.js — CRUD + orders for favourite users
│       ├── stats.js      — v1 statistics endpoint wrapper
│       ├── scanner.js    — SSE bulk scanner
│       └── profit.js     — SSE profit analyzer
├── frontend/
│   └── src/
│       ├── App.jsx       — Main UI, all tabs
│       ├── App.css       — Styles
│       └── api.js        — Axios wrappers for all backend routes
├── .gitignore
└── README.md
```

## Setup

### Requirements
- Node.js v18+ (v24 recommended)
- Warframe.market account (for JWT if needed)
- Alecaframe installed (for personal stats tab)

### Install & Run

**Terminal 1 — Backend:**
```bash
cd backend
npm install
node index.js
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

### Environment Variables

Create `backend/.env`:
```
WFM_JWT=JWT eyJ...          # Optional: your warframe.market JWT token
ALECA_USER_HASH=      # Your Alecaframe userHash (from Stats tab)
ALECA_TOKEN=          # Your Alecaframe public token
ALECA_NICK=           # Your in-game name
```

> ⚠️ Never commit `.env` to GitHub. It is already listed in `.gitignore`.

## API Reference

### warframe.market
- Base: `https://api.warframe.market/v2/`
- Rate limit: 3 requests/second
- Statistics: `https://api.warframe.market/v1/items/{slug}/statistics`

### Alecaframe
- Base: `https://stats.alecaframe.com/api/`
- Rate limit: 1 request/second
- Docs: https://docs.alecaframe.com/api

## Key Concepts

### Rate Limiting
The backend queue (`queue.js`) spaces all warframe.market requests to max 3/sec. Never call the WM API directly from the frontend — always go through the backend.

### Price Snapshots
Every time you click an item or a scan runs, a row is inserted into `price_snapshots`. This builds up history over time. The more you use the app, the more historical data you accumulate.

### Item Groups
Items are classified into groups (Arcanes, Mods, Primary Sets, etc.) by name pattern matching in `scanner.js`. These groups are used by both the Scanner and Profit Analyzer tabs.

### Profit Score
`score = margin × avgDailyVolume`. A high score means an item has both a good buy/sell spread AND sells frequently — the combination that makes something worth trading.

## GitHub

Managed via GitHub Desktop. Commit after each working feature. Never commit `node_modules/` or `data.db` or `.env`.