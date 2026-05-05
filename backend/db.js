import Database from "better-sqlite3";

let db;

export function initDb() {
  db = new Database("data.db");

  db.exec(
    "CREATE TABLE IF NOT EXISTS items (" +
    "  id        TEXT PRIMARY KEY," +
    "  url_name  TEXT NOT NULL," +
    "  item_name TEXT NOT NULL," +
    "  thumb     TEXT" +
    ");"
  );

  db.exec(
    "CREATE TABLE IF NOT EXISTS price_snapshots (" +
    "  id         INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  url_name   TEXT NOT NULL," +
    "  min_price  REAL," +
    "  avg_price  REAL," +
    "  max_price  REAL," +
    "  volume     INTEGER," +
    "  fetched_at TEXT DEFAULT (datetime('now'))" +
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
    "  group_id INTEGER REFERENCES groups(id)," +
    "  url_name TEXT NOT NULL," +
    "  PRIMARY KEY (group_id, url_name)" +
    ");"
  );

  console.log("Database ready.");
  return db;
}

export function getDb() {
  return db;
}