export type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SchemeNetworkFacilitator,
} from '@x402/core/types'

export type { DiscoveredResource, DiscoveryInfo } from '@x402/extensions/bazaar'

export interface IcpPayloadAuthorization {
  to: string
  value: string
  expiresAt: number
  nonce: number
}

export interface IcpPayload {
  signature: string
  authorization: IcpPayloadAuthorization
}