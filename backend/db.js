import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

let db;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, "..", "data.db");

export function initDb(options = {}) {
  if (db?.open) db.close();
  const dbPath = options.path ?? process.env.WMP_DB_PATH ?? DEFAULT_DB_PATH;
  db = new Database(dbPath);

  db.exec(
    "CREATE TABLE IF NOT EXISTS items (" +
    "  id        TEXT PRIMARY KEY," +
    "  url_name  TEXT NOT NULL," +
    "  item_name TEXT NOT NULL," +
    "  thumb     TEXT," +
    "  max_rank  INTEGER" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS price_snapshots (" +
    "  id         INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  url_name   TEXT NOT NULL," +
    "  rank       INTEGER," +
    "  min_price  REAL," +
    "  avg_price  REAL," +
    "  max_price  REAL," +
    "  volume     INTEGER," +
    "  fetched_at TEXT DEFAULT (datetime('now'))" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS item_statistics (" +
    "  id           INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  url_name     TEXT NOT NULL," +
    "  rank         INTEGER," +
    "  period       TEXT NOT NULL," +
    "  datetime     TEXT NOT NULL," +
    "  volume       INTEGER," +
    "  min_price    REAL," +
    "  max_price    REAL," +
    "  avg_price    REAL," +
    "  median       REAL," +
    "  moving_avg   REAL," +
    "  wa_price     REAL," +
    "  fetched_at   TEXT DEFAULT (datetime('now'))," +
    "  UNIQUE(url_name, rank, period, datetime)" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS groups (" +
    "  id   INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  name TEXT NOT NULL UNIQUE" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS group_items (" +
    "  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE," +
    "  url_name TEXT NOT NULL," +
    "  PRIMARY KEY (group_id, url_name)" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS favourite_users (" +
    "  slug       TEXT PRIMARY KEY," +
    "  added_at   TEXT DEFAULT (datetime('now'))" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS favourite_user_marketplace_items (" +
    "  slug       TEXT NOT NULL," +
    "  url_name   TEXT NOT NULL," +
    "  added_at   TEXT DEFAULT (datetime('now'))," +
    "  PRIMARY KEY (slug, url_name)" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS custom_groups (" +
    "  id   INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  name TEXT NOT NULL UNIQUE" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS custom_group_items (" +
    "  group_id INTEGER REFERENCES custom_groups(id) ON DELETE CASCADE," +
    "  url_name TEXT NOT NULL," +
    "  PRIMARY KEY (group_id, url_name)" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS market_orders_current (" +
    "  order_id       TEXT PRIMARY KEY," +
    "  market_key     TEXT NOT NULL," +
    "  url_name       TEXT NOT NULL," +
    "  item_id        TEXT," +
    "  rank           INTEGER," +
    "  subtype        TEXT," +
    "  charges        INTEGER," +
    "  amber_stars    INTEGER," +
    "  cyan_stars     INTEGER," +
    "  order_type     TEXT NOT NULL," +
    "  platinum       INTEGER NOT NULL," +
    "  quantity       INTEGER," +
    "  per_trade      INTEGER," +
    "  visible        INTEGER," +
    "  user_id        TEXT," +
    "  user_slug      TEXT," +
    "  user_status    TEXT," +
    "  created_at     TEXT," +
    "  updated_at     TEXT," +
    "  first_seen_at  TEXT NOT NULL," +
    "  last_seen_at   TEXT NOT NULL," +
    "  disappeared_at TEXT," +
    "  is_active      INTEGER NOT NULL DEFAULT 1" +
    ");"
  );

  db.exec("CREATE INDEX IF NOT EXISTS idx_market_orders_item_config ON market_orders_current (url_name, market_key);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_market_orders_active ON market_orders_current (url_name, market_key, is_active);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_market_orders_last_seen ON market_orders_current (url_name, is_active, last_seen_at);");

  db.exec(
    "CREATE TABLE IF NOT EXISTS market_order_sync_state (" +
    "  url_name                 TEXT PRIMARY KEY," +
    "  last_successful_sync_at  TEXT," +
    "  last_fetched_order_count INTEGER," +
    "  last_active_order_count  INTEGER," +
    "  last_configuration_count INTEGER" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS market_order_demand (" +
    "  url_name          TEXT NOT NULL," +
    "  source            TEXT NOT NULL," +
    "  last_requested_at TEXT NOT NULL," +
    "  weight            REAL," +
    "  PRIMARY KEY (url_name, source)" +
    ");"
  );

  db.exec("CREATE INDEX IF NOT EXISTS idx_market_order_demand_recent ON market_order_demand (last_requested_at);");

  db.exec(
    "CREATE TABLE IF NOT EXISTS market_order_scheduler_state (" +
    "  url_name        TEXT PRIMARY KEY," +
    "  failure_count   INTEGER NOT NULL DEFAULT 0," +
    "  last_failure_at TEXT," +
    "  next_retry_at   TEXT," +
    "  last_success_at TEXT" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS relics (" +
    "  id                       INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  name                     TEXT NOT NULL UNIQUE," +
    "  era                      TEXT NOT NULL," +
    "  code                     TEXT NOT NULL," +
    "  status                   TEXT," +
    "  probability_model        TEXT NOT NULL DEFAULT 'standard'," +
    "  probability_model_reason TEXT," +
    "  source                   TEXT," +
    "  source_id                TEXT," +
    "  source_updated_at        TEXT," +
    "  is_supported             INTEGER NOT NULL DEFAULT 1" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS relic_rewards (" +
    "  relic_id             INTEGER NOT NULL REFERENCES relics(id) ON DELETE CASCADE," +
    "  reward_name          TEXT NOT NULL," +
    "  market_url_name      TEXT," +
    "  item_name            TEXT," +
    "  rarity               TEXT," +
    "  source_rarity        TEXT," +
    "  match_status         TEXT NOT NULL," +
    "  is_tradable          INTEGER NOT NULL DEFAULT 1," +
    "  chance_intact        REAL," +
    "  chance_exceptional   REAL," +
    "  chance_flawless      REAL," +
    "  chance_radiant       REAL," +
    "  PRIMARY KEY (relic_id, reward_name)" +
    ");"
  );

  db.exec("CREATE INDEX IF NOT EXISTS idx_relics_era_code ON relics (era, code);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_relic_rewards_market ON relic_rewards (market_url_name);");

  // Migrations
  try { db.exec("ALTER TABLE items ADD COLUMN max_rank INTEGER"); } catch (_) {}
  try { db.exec("ALTER TABLE price_snapshots ADD COLUMN rank INTEGER"); } catch (_) {}

  seedGroups();
  console.log("Database ready.");
  return db;
}

function seedGroups() {
  const groups = [
    "Arcanes", "Mods", "Primed Mods",
    "Primary Sets", "Primary Parts",
    "Secondary Sets", "Secondary Parts",
    "Melee Sets", "Melee Parts",
    "Warframe Sets", "Warframe Parts",
    "Necramech Mods", "Relics",
  ];
  const insert = db.prepare("INSERT OR IGNORE INTO groups (name) VALUES (?)");
  db.transaction(() => { for (const g of groups) insert.run(g); })();
}

export function getDb() {
  return db;
}
