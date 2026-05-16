# WMPersonal

A comprehensive personal Warframe Market monitoring dashboard with bounty tracking, price analysis, and trading tools — full stack, runs entirely on your own computer.

## Features

- **Market Monitor** — search any item, fetch live online seller prices, view snapshot history and 48h/90d statistics charts
- **User Orders** — look up any warframe.market user's buy/sell listings, cross-referenced with your local DB history
- **Favourites** — track specific traders, auto-refresh every 5 minutes, compare their prices against live market
- **Bounty Tracker** — monitor Warframe bounty locations with live reset timers, reward prices from market data, and advanced filtering/sorting per location
- **Scanner** — bulk-fetch price snapshots for entire item groups (Arcanes, Mods, Primary Sets, etc.) with live progress
- **Profit Analyzer** — scan a group for margin, volume, sell speed, and a composite profit score
- **Time Analysis** — analyze price trends and trading patterns over time
- **Alecaframe** — personal trade history, relic inventory, and account stats
- **Group Manager** — manage custom item groups for scanning and analysis

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite, Recharts for data visualization |
| Backend | Node.js + Express, SQLite with better-sqlite3 |
| HTTP client | Axios (frontend), undici (backend) |
| Real-time features | Server-Sent Events for scanner/profit analysis |
| Market API | warframe.market v2 + v1 stats |
| Personal stats | Alecaframe stats API |
| Bounty tracking | Real-time timers, price filtering/sorting |
| Database | SQLite with migrations and price history |

## Project Structure

```
WMPersonal/
├── backend/
│   ├── index.js          — Express server entry point
│   ├── db.js             — SQLite setup and migrations
│   ├── bounties.js       — Bounty location definitions and reward data
│   ├── queue.js          — Rate-limited fetch queue (3 req/s)
│   ├── sync.js           — Item list sync + price snapshot fetcher
│   ├── scheduler.js      — Auto-refresh favourites every 5 min
│   ├── .env              — Private keys (never committed)
│   └── routes/
│       ├── items.js      — GET /api/items
│       ├── prices.js     — POST /api/prices/fetch, GET /api/prices/:slug
│       ├── users.js      — GET /api/users/:slug/orders
│       ├── favourites.js — CRUD + orders for favourite users
│       ├── bounties.js   — GET /api/bounties, POST /api/bounties/refresh
│       ├── stats.js      — v1 statistics endpoint wrapper
│       ├── scanner.js    — SSE bulk scanner
│       ├── profit.js     — SSE profit analyzer
│       ├── timeanalysis.js — Time-based price analysis
│       ├── customgroups.js — Custom group management
│       └── alecaframe.js — Personal stats and trade history
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

### Internal API Endpoints
- `GET /api/bounties` — Fetch bounty locations with timers and reward prices
- `POST /api/bounties/refresh` — Refresh bounty data from market snapshots
- `GET /api/timeanalysis/:url_name` — Time-based price analysis for items
- `GET /api/customgroups` — List custom item groups
- `POST /api/customgroups` — Create new custom group

## Key Concepts

### Rate Limiting
The backend queue (`queue.js`) spaces all warframe.market requests to max 3/sec. Never call the WM API directly from the frontend — always go through the backend.

### Price Snapshots
Every time you click an item or a scan runs, a row is inserted into `price_snapshots`. This builds up history over time. The more you use the app, the more historical data you accumulate.

### Item Groups
Items are classified into groups (Arcanes, Mods, Primary Sets, etc.) by name pattern matching in `scanner.js`. These groups are used by both the Scanner and Profit Analyzer tabs.

### Profit Score
`score = margin × avgDailyVolume`. A high score means an item has both a good buy/sell spread AND sells frequently — the combination that makes something worth trading.

### Bounty Tracking
The Bounty Tracker monitors all major Warframe bounty locations with real-time reset timers and market prices for rewards. Each location can be filtered and sorted independently by minimum/average price, name, or volume. Bounty data is refreshed from your local price snapshots database.

**Supported Locations:**
- Orb Vallis (4-hour cycle)
- Plains of Eidolon (4-hour cycle)
- Cambion Drift (Deimos) (4-hour cycle)
- Sanctum Anatomica (4-hour cycle)
- Venus (Orb Mother) (4-hour cycle)
- Arbiters of Hexis (24-hour cycle)

## Recent Updates

### v2.x — Bounty Tracking & Enhanced Features
- ✅ **Bounty Tracker**: Complete bounty monitoring system with live timers and market prices
- ✅ **Advanced Filtering**: Per-location price filtering (min/avg) and sorting (name, price, volume)
- ✅ **Time Analysis**: New tab for analyzing price trends over time
- ✅ **Group Manager**: Custom item group management for scanning
- ✅ **Enhanced UI**: Improved responsive design and user experience
- ✅ **Real-time Updates**: Live bounty reset timers and automatic data refresh

## GitHub

Managed via GitHub Desktop. Commit after each working feature. Never commit `node_modules/` or `data.db` or `.env`.