# WMPersonal

Personal Warframe market analysis dashboard. It runs locally with a React/Vite frontend, an Express backend, and SQLite storage.

## Major Modules

- **Market**: item lookup, legacy `/top` snapshots, stored full-order analysis, current market valuation, recent sales, and confidence.
- **Scanner**: bulk legacy snapshot scanner for item groups, with stored-only Fair / Buy Now / Confidence columns when full-order data already exists.
- **Profit**: group scan using semantic market values for acquisition, resale, and liquidation context.
- **Relics**: Void Relic reward tables and expected platinum value per refinement.
- **Time Analysis**: 48h trading volume and median-price timing views.
- **User Orders / Favourites**: user order lookup and local comparison tools.
- **Alecaframe**: optional local account/trade/relic inventory integration.
- **Group Manager**: custom scan groups and built-in NPC/vendor group helpers.

## Market Valuation

WMPersonal keeps legacy `/top` snapshots for comparison, but the current valuation model is based on stored full Warframe.market order books.

Core concepts:

- **Buy Now**: `executableAsk`, the lowest active sell from an `online` or `ingame` seller.
- **Fair Market**: `competitiveEstimate`, the median of the cheapest competitive active seller cluster.
- **Recent Sales**: matched 48h historical median when available.
- **Best Bid**: `highestActiveBid`, the highest active buy order.
- **Confidence**: explainable quality classification using freshness, active sellers/buyers, spread, suspicious lows, and historical agreement.

Stored order books are configuration-aware: rank, subtype, charges, amber stars, and cyan stars are not mixed.

## Rate Limiting And Scheduler

All Warframe.market requests go through the backend queue. Full order-book collection is demand-driven and conservative. Opening Market, Scanner, Profit, or Relics views may record demand, but it does not trigger broad crawling.

Useful environment variables:

```text
WMP_DB_PATH                 Optional SQLite database path
WMP_MARKET_FRESH_SECONDS    Stored order book fresh threshold
WMP_MARKET_AGING_SECONDS    Stored order book aging threshold
WFM_JWT                     Optional Warframe.market JWT
ALECA_USER_HASH             Optional Alecaframe user hash
ALECA_TOKEN                 Optional Alecaframe token
ALECA_NICK                  Optional in-game name
```

## Relics

The Relics module imports structured relic reward data from WFCD `warframe-drop-data`, which is generated from Digital Extremes' official public drop tables. It calculates:

```text
EV(refinement) = sum(probability(reward | refinement) * reward trade value)
```

Reward trade value uses the central semantic selector with resale/fair-market intent. Non-tradable rewards such as Forma Blueprint contribute `0p` trade EV.

Details: [docs/relic-valuation.md](docs/relic-valuation.md)

## Setup

Requirements:

- Node.js 18+; Node 24 works
- SQLite database created by the backend on first run

Install:

```bash
npm install
cd frontend
npm install
```

Run backend:

```bash
node backend/index.js
```

Run frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`.

## Tests

```bash
npm test
cd frontend
npm run build
```

## Internal APIs

- `POST /api/prices/fetch`: legacy `/top` snapshot fetch.
- `GET /api/market-orders/:slug/analysis`: stored full-order valuation.
- `POST /api/market-orders/:slug/refresh`: manual full order-book refresh.
- `GET /api/market-orders/coverage`: stored market coverage summary.
- `GET /api/relics`: relic list.
- `GET /api/relics/:id`: relic EV valuation.
- `POST /api/relics/sync`: import relic reward tables.

## Limitations

- Legacy `/top` pricing is retained for comparison and fallback.
- Relic EV is solo expected trade value for opening an already-owned relic.
- Relic farming/drop acquisition, squad Radshare EV, Ducat optimization, and trade recommendations are out of scope.
- Stored order coverage starts low and improves only through explicit/manual/demand-driven collection.
- Do not commit `node_modules`, `.env`, or SQLite database files.
