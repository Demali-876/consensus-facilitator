import { Ed25519KeyIdentity } from '@icp-sdk/core/identity'
import { config } from '../config.js'

let _identity: Ed25519KeyIdentity | null = null

export function getFacilitatorIdentity(): Ed25519KeyIdentity {
  if (_identity) return _identity

  if (!config.identitySeed) {
    throw new Error(
      'FACILITATOR_IDENTITY_SEED is not set.'
    )
  }

  const seed = Buffer.from(config.identitySeed, 'hex')
  if (seed.length !== 32) {
    throw new Error('FACILITATOR_IDENTITY_SEED must be exactly 64 hex characters (32 bytes)')
  }

  _identity = Ed25519KeyIdentity.generate(seed)
  return _identity
}

export function getFacilitatorPrincipalText(): string {
  return getFacilitatorIdentity().getPrincipal().toText()
}
