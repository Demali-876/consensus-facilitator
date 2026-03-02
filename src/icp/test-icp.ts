import { readFileSync } from 'node:fs'
import { Secp256k1KeyIdentity } from '@dfinity/identity-secp256k1'
import { HttpAgent, Actor } from '@icp-sdk/core/agent'
import { Principal } from '@icp-sdk/core/principal'

const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'http://localhost:3000'
const NETWORK = 'icp:1'
const TESTICP_CANISTER = 'xafvr-biaaa-aaaai-aql5q-cai'
const ASSET = `${NETWORK}:${TESTICP_CANISTER}`
const AMOUNT = 100_000n

const pemPath = process.env.PAYER_PEM ?? './test-x402.pem'
let pem: string
try {
  pem = readFileSync(pemPath, 'utf8')
} catch {
  console.error(`Cannot read PEM file: ${pemPath}`)
  console.error('Export it first:  dfx identity export test-x402 > test-x402.pem')
  process.exit(1)
}

const identity = Secp256k1KeyIdentity.fromPem(pem)
const payerPrincipal = identity.getPrincipal().toText()
console.log(`Payer:       ${payerPrincipal}`)
console.log(`(fund this principal with TESTICP if not already done)`)

// Step 0: Get facilitator principal

const info = (await fetch(`${FACILITATOR_URL}/info`).then((r) => r.json())) as any
const facilitatorPrincipal: string = info.icp.facilitatorPrincipal
console.log(`Facilitator: ${facilitatorPrincipal}`)

// Step 1: icrc2_approve

console.log('\n── icrc2_approve ──')

const agent = new HttpAgent({ host: 'https://ic0.app', identity })

const icrc2Idl = ({ IDL }: any) => {
  const Account = IDL.Record({ owner: IDL.Principal, subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)) })
  const ApproveError = IDL.Variant({
    AllowanceChanged: IDL.Record({ current_allowance: IDL.Nat }),
    BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
    BadFee: IDL.Record({ expected_fee: IDL.Nat }),
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    Expired: IDL.Record({ ledger_time: IDL.Nat64 }),
    GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
    InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
    TooOld: IDL.Null,
  })
  return IDL.Service({
    icrc2_approve: IDL.Func(
      [
        IDL.Record({
          spender: Account,
          amount: IDL.Nat,
          expires_at: IDL.Opt(IDL.Nat64),
          expected_allowance: IDL.Opt(IDL.Nat),
          memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
          fee: IDL.Opt(IDL.Nat),
          from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
          created_at_time: IDL.Opt(IDL.Nat64),
        }),
      ],
      [IDL.Variant({ Ok: IDL.Nat, Err: ApproveError })],
      []
    ),
  })
}

const ledger = Actor.createActor(icrc2Idl, { agent, canisterId: TESTICP_CANISTER }) as any
const expiresAtNs = BigInt(Date.now() + 10 * 60 * 1000) * 1_000_000n

const approveResult = await ledger.icrc2_approve({
  spender: { owner: Principal.fromText(facilitatorPrincipal), subaccount: [] },
  amount: AMOUNT + 10_000n,
  expires_at: [expiresAtNs],
  expected_allowance: [],
  memo: [],
  fee: [],
  from_subaccount: [],
  created_at_time: [],
})

if ('Err' in approveResult) {
  throw new Error(
    `icrc2_approve failed: ${JSON.stringify(approveResult.Err, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`
  )
}
console.log(`Approved — block: ${approveResult.Ok}`)

// Step 2: Sign payload

console.log('\n── Signing payload ──')

const { signMessage, toDelegationIdentity, bytesToBase64Url } = await import('@ldclabs/ic-auth')
const { encode: cborEncode } = await import('cborg')

const delegationIdentity = toDelegationIdentity(identity)
const nonce = Date.now()
const authorization = {
  to: facilitatorPrincipal,
  value: AMOUNT.toString(),
  expiresAt: Date.now() + 5 * 60 * 1000,
  nonce,
}

const envelope = await signMessage(delegationIdentity, authorization)
const signature = bytesToBase64Url(cborEncode(envelope))

const requirements = {
  scheme: 'exact',
  network: NETWORK,
  asset: ASSET,
  amount: AMOUNT.toString(),
  payTo: facilitatorPrincipal,
  maxTimeoutSeconds: 300,
  extra: {},
}

const paymentPayload = {
  x402Version: 2,
  resource: { url: `${FACILITATOR_URL}/test-resource`, method: 'GET' },
  accepted: requirements,
  payload: { signature, authorization },
}

// Step 3: POST /verify
console.log('\n── POST /verify ──')
const verifyBody = (await fetch(`${FACILITATOR_URL}/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ paymentPayload, paymentRequirements: requirements }),
}).then((r) => r.json())) as any

console.log(JSON.stringify(verifyBody, null, 2))
if (!verifyBody.isValid)
  throw new Error(`Verify failed: ${verifyBody.invalidReason} — ${verifyBody.invalidMessage}`)
console.log(`Verify passed — payer: ${verifyBody.payer}`)

// Step 4: POST /settle

console.log('\n── POST /settle ──')
const settleBody = (await fetch(`${FACILITATOR_URL}/settle`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ paymentPayload, paymentRequirements: requirements }),
}).then((r) => r.json())) as any

console.log(JSON.stringify(settleBody, null, 2))
if (!settleBody.success)
  throw new Error(`Settle failed: ${settleBody.errorReason} — ${settleBody.errorMessage}`)

console.log(`\n ICP x402 flow complete!`)
console.log(`   Block: ${settleBody.transaction}`)
console.log(`   https://dashboard.internetcomputer.org/tokens/${TESTICP_CANISTER}/transactions`)
