import type { PaymentPayload } from '../types.js'

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const base64 = padded + '='.repeat(padLen)
  return Uint8Array.from(Buffer.from(base64, 'base64'))
}

export function decodePayload(encoded: string): PaymentPayload {
  const bytes = b64urlDecode(encoded)
  const json = new TextDecoder().decode(bytes)
  return JSON.parse(json) as PaymentPayload
}

export function encodePayload(payload: PaymentPayload): string {
  const json = JSON.stringify(payload)
  return Buffer.from(json).toString('base64url')
}
