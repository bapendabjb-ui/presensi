import mysql from "mysql2/promise";

/**
 * Konfigurasi koneksi.
 * Prioritas: MYSQL_URL / DATABASE_URL (dipakai Railway) -> variabel terpisah -> default XAMPP.
 */
function buildConfig() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  const base = {
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
    timezone: "Z",
  };

  if (url) {
    const u = new URL(url);
    return {
      ...base,
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
    };
  }

  return {
    ...base,
    host: process.env.MYSQLHOST || "localhost",
    port: Number(process.env.MYSQLPORT || 3306),
    user: process.env.MYSQLUSER || "root",
    password: process.env.MYSQLPASSWORD ?? "",
    database: process.env.MYSQLDATABASE || "presensi",
  };
}

const config = buildConfig();
export let pool;

/** Buat database bila belum ada (berguna di lokal/XAMPP). */
async function ensureDatabase() {
  const { database, ...rest } = config;
  let conn;
  try {
    conn = await mysql.createConnection({ ...rest, multipleStatements: true });
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (err) {
    // Di hosting terkelola user biasanya tidak punya hak CREATE DATABASE —
    // abaikan saja karena database-nya sudah disiapkan penyedia.
    if (!["ER_DBACCESS_DENIED_ERROR", "ER_SPECIFIC_ACCESS_DENIED_ERROR"].includes(err.code)) {
      if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") throw err;
    }
  } finally {
    if (conn) await conn.end();
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS events (
     id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
     name        VARCHAR(180) NOT NULL,
     slug        VARCHAR(190) NOT NULL,
     description TEXT NULL,
     location    VARCHAR(190) NULL,
     starts_at   DATETIME NULL,
     ends_at     DATETIME NULL,
     status      ENUM('draft','aktif','selesai') NOT NULL DEFAULT 'aktif',
     color       VARCHAR(16) NOT NULL DEFAULT 'brand',
     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     UNIQUE KEY uq_events_slug (slug),
     KEY idx_events_status (status)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS participants (
     id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
     event_id    INT UNSIGNED NOT NULL,
     code        VARCHAR(24) NOT NULL,
     name        VARCHAR(180) NOT NULL,
     email       VARCHAR(190) NULL,
     phone       VARCHAR(40) NULL,
     org         VARCHAR(190) NULL,
     ticket_type VARCHAR(60) NOT NULL DEFAULT 'Reguler',
     note        VARCHAR(255) NULL,
     created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     UNIQUE KEY uq_participants_code (code),
     KEY idx_participants_event (event_id),
     KEY idx_participants_name (name),
     CONSTRAINT fk_participants_event FOREIGN KEY (event_id)
       REFERENCES events (id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS checkins (
     id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
     participant_id INT UNSIGNED NOT NULL,
     event_id       INT UNSIGNED NOT NULL,
     checked_in_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     method         ENUM('qr','manual','kode') NOT NULL DEFAULT 'qr',
     operator       VARCHAR(80) NULL,
     PRIMARY KEY (id),
     UNIQUE KEY uq_checkins_participant (participant_id),
     KEY idx_checkins_event_time (event_id, checked_in_at),
     CONSTRAINT fk_checkins_participant FOREIGN KEY (participant_id)
       REFERENCES participants (id) ON DELETE CASCADE,
     CONSTRAINT fk_checkins_event FOREIGN KEY (event_id)
       REFERENCES events (id) ON DELETE CASCADE
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

export async function initDb() {
  await ensureDatabase();
  pool = mysql.createPool(config);
  for (const stmt of SCHEMA) await pool.query(stmt);
  return pool;
}

/** SELECT banyak baris. */
export async function all(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** SELECT satu baris (atau undefined). */
export async function one(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows[0];
}

/** INSERT/UPDATE/DELETE — mengembalikan { insertId, affectedRows }. */
export async function run(sql, params = []) {
  const [res] = await pool.query(sql, params);
  return res;
}

export function dbInfo() {
  return { host: config.host, port: config.port, database: config.database };
}
