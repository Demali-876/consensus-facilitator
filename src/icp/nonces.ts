/**
 * Nonce store — delegates to SQLite via db.ts.
 * Kept as a thin wrapper so icp/scheme.ts doesn't need to know about the DB layer.
 */

import { dbHasNonce, dbRecordNonce } from '../db.js'

export function hasNonce(principal: string, ledgerId: string, nonce: number): boolean {
  return dbHasNonce(principal, ledgerId, nonce)
}

export function recordNonce(principal: string, ledgerId: string, nonce: number): void {
  dbRecordNonce(principal, ledgerId, nonce)
}
