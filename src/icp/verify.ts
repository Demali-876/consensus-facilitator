import { sha256 } from '@noble/hashes/sha2.js'
import { sha3_256 } from '@noble/hashes/sha3.js'
import { encode, rfc8949EncodeOptions } from 'cborg'
import { ed25519 } from '@noble/curves/ed25519.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { DelegationChain, isDelegationValid } from '@icp-sdk/core/identity'
import { Principal } from '@icp-sdk/core/principal'
import type { IcpPayload, IcpPayloadAuthorization, PaymentRequirements } from '../types.js'

function computeDigest(auth: IcpPayloadAuthorization): Uint8Array {
  const cbor = encode(auth, rfc8949EncodeOptions)
  return sha3_256(cbor)
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replaceAll('-', '+').replaceAll('_', '/')
  const pad = (4 - (padded.length % 4)) % 4
  return new Uint8Array(Buffer.from(padded + '='.repeat(pad), 'base64'))
}

const ED25519_OID   = Buffer.from('06032b6570', 'hex')
const SECP256K1_OID = Buffer.from('06072a8648ce3d0201', 'hex')

type KeyType = 'ed25519' | 'secp256k1'

function parseSigningKey(der: Uint8Array): { type: KeyType; raw: Uint8Array } {
  const buf = Buffer.from(der)

  if (der.length === 44 && buf.includes(ED25519_OID)) {
    return { type: 'ed25519', raw: der.slice(12) }
  }

  if (der.length === 88 && buf.includes(SECP256K1_OID)) {
    return { type: 'secp256k1', raw: der.slice(23) }
  }

  throw new Error(`unsupported DER key: length=${der.length}`)
}

interface DelegationCompact {
  p: Uint8Array
  e: bigint
  t?: unknown[]
}

interface SignedDelegationCompact {
  d: DelegationCompact
  s: Uint8Array
}

interface SignedEnvelopeCompact {
  p: Uint8Array
  s: Uint8Array
  h?: Uint8Array
  d?: SignedDelegationCompact[]
}

export interface VerifySignatureResult {
  valid: boolean
  signerPrincipal?: string
  error?: string
}

export async function verifySignature(
  payload: IcpPayload
): Promise<VerifySignatureResult> {
  try {
    const { decode } = await import('cborg')
    const envBytes = b64urlDecode(payload.signature)
    const env = decode(envBytes) as SignedEnvelopeCompact

    if (!env.p || !env.s) {
      return { valid: false, error: 'envelope missing required fields p or s' }
    }

    const principal = Principal.selfAuthenticating(env.p)

    const digest = computeDigest(payload.authorization)

    const signingKeyDer = env.d && env.d.length > 0
      ? env.d[env.d.length - 1].d.p
      : env.p

    let parsed: { type: KeyType; raw: Uint8Array }
    try {
      parsed = parseSigningKey(signingKeyDer)
    } catch (e) {
      return { valid: false, error: (e as Error).message }
    }

    let sigValid: boolean
    if (parsed.type === 'ed25519') {
      sigValid = ed25519.verify(env.s, digest, parsed.raw)
    } else {
      sigValid = secp256k1.verify(env.s, sha256(digest), parsed.raw)
    }

    if (!sigValid) {
      return { valid: false, error: 'signature verification failed' }
    }
    if (env.d && env.d.length > 0) {
      const chain = DelegationChain.fromDelegations(
        env.d.map((sd) => ({
          delegation: { pubkey: sd.d.p, expiration: sd.d.e, targets: sd.d.t },
          signature: sd.s,
        })) as any,
        env.p as any
      )
      if (!isDelegationValid(chain)) {
        return { valid: false, error: 'delegation chain is expired or invalid' }
      }
    }

    return { valid: true, signerPrincipal: principal.toText() }
  } catch (err) {
    return { valid: false, error: `verification error: ${(err as Error).message}` }
  }
}
export interface AuthValidationError {
  field: string
  reason: string
}

export function validateAuthorization(
  auth: IcpPayloadAuthorization,
  req: PaymentRequirements
): AuthValidationError | null {
  if (auth.to !== req.payTo) {
    return { field: 'authorization.to', reason: `got "${auth.to}", expected "${req.payTo}"` }
  }

  const authValue = BigInt(auth.value)
  const reqAmount = BigInt(req.amount)
  if (authValue < reqAmount) {
    return { field: 'authorization.value', reason: `got ${auth.value}, need at least ${req.amount}` }
  }

  if (Date.now() >= auth.expiresAt) {
    return { field: 'authorization.expiresAt', reason: `expired at ${new Date(auth.expiresAt).toISOString()}` }
  }

  if (typeof auth.nonce !== 'number' || auth.nonce < 0) {
    return { field: 'authorization.nonce', reason: 'must be a non-negative integer' }
  }

  return null
}