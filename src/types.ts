export type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SchemeNetworkFacilitator,
} from '@x402/core/types'

export type { DiscoveryInfo } from '@x402/extensions/bazaar'

export interface IcpPayloadAuthorization {
  to: string
  value: string
  /**
   * Expiry timestamp in **milliseconds** since Unix epoch (Date.now()).
   * Note: ICP ledger internals use nanoseconds — this is the authorization
   * expiry used for off-chain signature validation only.
   */
  expiresAt: number
  nonce: number
}

export interface IcpPayload {
  signature: string
  authorization: IcpPayloadAuthorization
}