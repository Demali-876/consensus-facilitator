import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SchemeNetworkFacilitator,
  Network,
} from '@x402/core/types'
import { ASSETS } from '../config.js'
import { validateAuthorization, verifySignature } from './verify.js'
import { claimNonce } from './nonces.js'
import { getAllowance, transferFrom } from './ledger.js'
import { getFacilitatorPrincipalText } from './identity.js'
import type { IcpPayload } from '../types.js'

export class IcpExactScheme implements SchemeNetworkFacilitator {
  readonly scheme = 'exact'
  readonly caipFamily = 'icp:*'

  getExtra(_network: Network): Record<string, unknown> | undefined {
    return { facilitatorPrincipal: getFacilitatorPrincipalText() }
  }

  getSigners(_network: string): string[] {
    return [getFacilitatorPrincipalText()]
  }

  async verify(
    paymentPayload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    try {
      const icp = paymentPayload.payload as unknown as IcpPayload
      if (!icp?.authorization || !icp?.signature) {
        return { isValid: false, invalidReason: 'missing ICP payload fields' }
      }

      const authErr = validateAuthorization(icp.authorization, requirements)
      if (authErr) {
        return { isValid: false, invalidReason: authErr.field, invalidMessage: authErr.reason }
      }

      const sigResult = await verifySignature(icp)
      if (!sigResult.valid) {
        return {
          isValid: false,
          invalidReason: 'invalid_signature',
          invalidMessage: sigResult.error,
        }
      }

      const payer = sigResult.signerPrincipal!
      // requirements.asset = 'icp:1:<canisterId>' — strip prefix for lookup
      const ledgerId = requirements.asset.split(':').pop()!
      const asset = ASSETS[ledgerId]
      if (!asset) {
        return { isValid: false, invalidReason: `unsupported asset: ${requirements.asset}` }
      }

      const allowance = await getAllowance(ledgerId, payer)
      const required = BigInt(requirements.amount)

      if (allowance.allowance < required) {
        return {
          isValid: false,
          invalidReason: 'insufficient_allowance',
          invalidMessage: `allowance ${allowance.allowance}, need ${required}`,
        }
      }

      const nowNs = BigInt(Date.now()) * 1_000_000n
      if (
        allowance.expiresAt !== undefined &&
        allowance.expiresAt > 0n &&
        allowance.expiresAt < nowNs
      ) {
        return { isValid: false, invalidReason: 'allowance_expired' }
      }

      return { isValid: true, payer }
    } catch (err) {
      return {
        isValid: false,
        invalidReason: 'verify_error',
        invalidMessage: (err as Error).message,
      }
    }
  }

  async settle(
    paymentPayload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<SettleResponse> {
    const icp = paymentPayload.payload as unknown as IcpPayload

    const verification = await this.verify(paymentPayload, requirements)
    if (!verification.isValid) {
      return {
        success: false,
        errorReason: verification.invalidReason,
        errorMessage: verification.invalidMessage,
        transaction: '',
        network: requirements.network,
      }
    }

    const payer = verification.payer!
    const nonce = icp.authorization.nonce
    const ledgerId = requirements.asset.split(':').pop()!

    // Atomically claim the nonce before the transfer — eliminates the race window
    // between check and record that would allow concurrent double-spend.
    // If the transfer fails after this point, the nonce is consumed and the
    // client must retry with a fresh authorization.
    if (!claimNonce(payer, ledgerId, nonce)) {
      return {
        success: false,
        errorReason: 'already_settled',
        errorMessage: `nonce ${nonce} already used`,
        transaction: '',
        network: requirements.network,
      }
    }

    try {
      const { blockIndex } = await transferFrom(
        ledgerId,
        payer,
        requirements.payTo,
        BigInt(requirements.amount),
        `x402:${nonce}`
      )
      return {
        success: true,
        payer,
        transaction: blockIndex.toString(),
        network: requirements.network,
      }
    } catch (err) {
      return {
        success: false,
        errorReason: 'settlement_failed',
        errorMessage: (err as Error).message,
        transaction: '',
        network: requirements.network,
      }
    }
  }
}
