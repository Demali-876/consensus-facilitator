/**
 * Nonce store — delegates to SQLite via db.ts.
 * Kept as a thin wrapper so icp/scheme.ts doesn't need to know about the DB layer.
 */

import { dbHasNonce, dbClaimNonce } from '../db.js'

export function hasNonce(principal: string, ledgerId: string, nonce: number): boolean {
  return dbHasNonce(principal, ledgerId, nonce)
}

/**
 * Atomically claim a nonce. Returns true if claimed successfully (first use),
 * false if already claimed. Use this instead of hasNonce + recordNonce to
 * eliminate the race window between check and record.
 */
export function claimNonce(principal: string, ledgerId: string, nonce: number): boolean {
  return dbClaimNonce(principal, ledgerId, nonce)
}
