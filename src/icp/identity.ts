import { Ed25519KeyIdentity } from '@icp-sdk/core/identity'
import { config } from '../config.js'

let _identity: Ed25519KeyIdentity | null = null

export function getFacilitatorIdentity(): Ed25519KeyIdentity {
  if (_identity) return _identity

  if (!/^[0-9a-fA-F]{64}$/.test(config.identitySeed)) {
    throw new Error('FACILITATOR_IDENTITY_SEED must be exactly 64 hex characters (32 bytes)')
  }

  const seed = Buffer.from(config.identitySeed, 'hex')
  _identity = Ed25519KeyIdentity.generate(seed)
  return _identity
}

export function getFacilitatorPrincipalText(): string {
  return getFacilitatorIdentity().getPrincipal().toText()
}
