import Database from "better-sqlite3";

let db;

export function initDb() {
  db = new Database("data.db");

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