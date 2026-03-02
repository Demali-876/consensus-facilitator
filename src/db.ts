import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { resolve } from 'node:path'
import type { PaymentRequirements } from './types.js'
import type { DiscoveryInfo } from '@x402/extensions/bazaar'

// Default to ./data/ — kept out of the repo root. Override with DB_PATH env var.
const DB_PATH = resolve(process.env.DB_PATH ?? './data/facilitator.db')

const db: DatabaseType = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS bazaar_resources (
    resource       TEXT PRIMARY KEY,
    description    TEXT,
    mime_type      TEXT,
    type           TEXT NOT NULL DEFAULT 'http',
    x402_version   INTEGER NOT NULL DEFAULT 2,
    accepts        TEXT NOT NULL,
    discovery_info TEXT,
    last_updated   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nonces (
    id           TEXT PRIMARY KEY,
    expires_at   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_nonces_expires ON nonces (expires_at);
`)

export interface CatalogEntry {
  resource: string
  description?: string
  mimeType?: string
  type: string
  x402Version: number
  accepts: PaymentRequirements[]
  discoveryInfo?: DiscoveryInfo
  lastUpdated: string
}

// ── Bazaar catalog ────────────────────────────────────────────────────────────

const stmtUpsertResource = db.prepare(`
  INSERT INTO bazaar_resources
    (resource, description, mime_type, type, x402_version, accepts, discovery_info, last_updated)
  VALUES
    (@resource, @description, @mimeType, @type, @x402Version, @accepts, @discoveryInfo, @lastUpdated)
  ON CONFLICT(resource) DO UPDATE SET
    description    = excluded.description,
    mime_type      = excluded.mime_type,
    type           = excluded.type,
    x402_version   = excluded.x402_version,
    accepts        = excluded.accepts,
    discovery_info = excluded.discovery_info,
    last_updated   = excluded.last_updated
`)

const stmtListResources = db.prepare(
  `SELECT * FROM bazaar_resources ORDER BY last_updated DESC LIMIT ? OFFSET ?`
)

const stmtCountResources = db.prepare(`SELECT COUNT(*) as total FROM bazaar_resources`)

export function upsertResource(r: CatalogEntry): void {
  stmtUpsertResource.run({
    resource: r.resource,
    description: r.description ?? null,
    mimeType: r.mimeType ?? null,
    type: r.type,
    x402Version: r.x402Version,
    accepts: JSON.stringify(r.accepts),
    discoveryInfo: r.discoveryInfo ? JSON.stringify(r.discoveryInfo) : null,
    lastUpdated: r.lastUpdated,
  })
}

export function listResources(limit = 100, offset = 0): { items: CatalogEntry[]; total: number } {
  const rows = stmtListResources.all(limit, offset) as any[]
  const { total } = stmtCountResources.get() as { total: number }

  const items: CatalogEntry[] = rows.map((row) => ({
    resource: row.resource,
    description: row.description ?? undefined,
    mimeType: row.mime_type ?? undefined,
    type: row.type,
    x402Version: row.x402_version,
    accepts: JSON.parse(row.accepts),
    discoveryInfo: row.discovery_info ? JSON.parse(row.discovery_info) : undefined,
    lastUpdated: row.last_updated,
  }))

  return { items, total }
}

const stmtHasNonce = db.prepare(`SELECT 1 FROM nonces WHERE id = ? AND expires_at > ?`)
const stmtInsertNonce = db.prepare(`INSERT OR IGNORE INTO nonces (id, expires_at) VALUES (?, ?)`)
const stmtCleanNonces = db.prepare(`DELETE FROM nonces WHERE expires_at <= ?`)

const NONCE_TTL_MS = 5 * 60 * 1000

export function dbHasNonce(principal: string, ledgerId: string, nonce: number): boolean {
  return !!stmtHasNonce.get(`${principal}:${ledgerId}:${nonce}`, Date.now())
}

/**
 * Atomically attempt to claim a nonce. Returns true if successfully claimed
 * (first use), false if already claimed. Uses INSERT OR IGNORE so concurrent
 * requests with the same nonce can only one succeed.
 *
 * NOTE: NONCE_TTL_MS must be >= the maximum maxTimeoutSeconds used by any
 * resource server, otherwise expired nonces can be replayed within a still-valid
 * authorization window.
 */
export function dbClaimNonce(principal: string, ledgerId: string, nonce: number): boolean {
  const result = stmtInsertNonce.run(`${principal}:${ledgerId}:${nonce}`, Date.now() + NONCE_TTL_MS)
  if (Math.random() < 0.01) stmtCleanNonces.run(Date.now())
  return result.changes > 0
}

export { db }
