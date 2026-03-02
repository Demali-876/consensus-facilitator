import { Actor, type ActorSubclass } from '@icp-sdk/core/agent'
import { Principal } from '@icp-sdk/core/principal'
import { getAgent } from './agent.js'
import { getFacilitatorIdentity } from './identity.js'

const icrc2Idl = ({ IDL }: { IDL: any }) => {
  const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  })

  return IDL.Service({
    icrc2_allowance: IDL.Func(
      [IDL.Record({ account: Account, spender: Account })],
      [IDL.Record({ allowance: IDL.Nat, expires_at: IDL.Opt(IDL.Nat64) })],
      ['query']
    ),
    icrc2_transfer_from: IDL.Func(
      [
        IDL.Record({
          spender_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
          from: Account,
          to: Account,
          amount: IDL.Nat,
          fee: IDL.Opt(IDL.Nat),
          memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
          created_at_time: IDL.Opt(IDL.Nat64),
        }),
      ],
      [
        IDL.Variant({
          Ok: IDL.Nat,
          Err: IDL.Variant({
            InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
            InsufficientAllowance: IDL.Record({ allowance: IDL.Nat }),
            BadFee: IDL.Record({ expected_fee: IDL.Nat }),
            BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
            CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
            Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
            TemporarilyUnavailable: IDL.Null,
            GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
            TooOld: IDL.Null,
          }),
        }),
      ],
      []
    ),
  })
}

// Cache actors per ledger canister
const actorCache = new Map<string, ActorSubclass<any>>()

function getLedgerActor(ledgerId: string): ActorSubclass<any> {
  let actor = actorCache.get(ledgerId)
  if (!actor) {
    actor = Actor.createActor(icrc2Idl, {
      agent: getAgent(),
      canisterId: ledgerId,
    })
    actorCache.set(ledgerId, actor)
  }
  return actor
}

export interface AllowanceResult {
  allowance: bigint
  expiresAt?: bigint
}

/**
 * Query how much the facilitator is approved to spend on behalf of payer.
 */
export async function getAllowance(
  ledgerId: string,
  payerPrincipal: string
): Promise<AllowanceResult> {
  const actor = getLedgerActor(ledgerId)
  const facilitatorPrincipal = getFacilitatorIdentity().getPrincipal()

  const result = await actor.icrc2_allowance({
    account: {
      owner: Principal.fromText(payerPrincipal),
      subaccount: [],
    },
    spender: {
      owner: facilitatorPrincipal,
      subaccount: [],
    },
  })

  return {
    allowance: result.allowance as bigint,
    expiresAt: result.expires_at[0] as bigint | undefined,
  }
}

export interface TransferResult {
  blockIndex: bigint
}

/**
 * Execute icrc2_transfer_from — pulls `amount` from payer to payTo.
 * Throws on failure.
 */
export async function transferFrom(
  ledgerId: string,
  fromPrincipal: string,
  toPrincipal: string,
  amount: bigint,
  memo?: string
): Promise<TransferResult> {
  const actor = getLedgerActor(ledgerId)

  const memoEncoded = memo ? new TextEncoder().encode(memo) : null
  if (memoEncoded && memoEncoded.length > 32) {
    throw new Error(`memo must be 32 bytes or fewer (got ${memoEncoded.length})`)
  }
  const memoBytes = memoEncoded ? [...memoEncoded] : []

  const result = await actor.icrc2_transfer_from({
    spender_subaccount: [],
    from: { owner: Principal.fromText(fromPrincipal), subaccount: [] },
    to: { owner: Principal.fromText(toPrincipal), subaccount: [] },
    amount,
    fee: [],
    memo: memoBytes.length ? [memoBytes] : [],
    created_at_time: [],
  })

  if ('Ok' in result) {
    return { blockIndex: result.Ok as bigint }
  }

  const errKey = Object.keys(result.Err)[0]
  const errVal = result.Err[errKey]
  throw new Error(
    `icrc2_transfer_from failed: ${errKey} — ${JSON.stringify(errVal, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    )}`
  )
}
