import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

try {
  const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
} catch { /* no .env — rely on real env vars */ }

import Fastify from 'fastify'
import { x402Facilitator } from '@x402/core/facilitator'
import { extractDiscoveryInfo } from '@x402/extensions/bazaar'
import { upsertResource, listResources, type CatalogEntry } from './db.js'
import { IcpExactScheme } from './icp/scheme.js'
import { getFacilitatorPrincipalText } from './icp/identity.js'
import type { PaymentPayload, PaymentRequirements, VerifyResponse, SettleResponse } from './types.js'
import type { Network } from '@x402/core/types'

const EVM_NETWORKS = [
  'eip155:1',
  'eip155:8453',
  'eip155:84532',
  'eip155:11155111',
] as Network[]

const SVM_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
const SVM_DEVNET  = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
const SVM_NETWORKS = [SVM_MAINNET, SVM_DEVNET] as Network[]

const ICP_NETWORKS = [
  'icp:1:ryjl3-tyaaa-aaaaa-aaaba-cai',  // ICP
  'icp:1:xevnm-gaaaa-aaaar-qafnq-cai',  // ckUSDC
  'icp:1:cngnf-vqaaa-aaaar-qag4q-cai',  // ckUSDT
  // Testnet tokens on mainnet — https://faucet.internetcomputer.org
  'icp:1:xafvr-biaaa-aaaai-aql5q-cai',  // TESTICP
  'icp:1:3jkp5-oyaaa-aaaaj-azwqa-cai',  // TICRC1
] as Network[]

const facilitator = new x402Facilitator()

  .onAfterVerify(async (ctx) => {
    try {
      const discovered = extractDiscoveryInfo(ctx.paymentPayload, ctx.requirements, true)
      if (discovered) {
        const entry: CatalogEntry = {
          resource:      discovered.resourceUrl,
          description:   discovered.description,
          mimeType:      discovered.mimeType,
          type:          'http',
          x402Version:   discovered.x402Version,
          accepts:       [ctx.requirements],
          discoveryInfo: discovered.discoveryInfo,
          lastUpdated:   new Date().toISOString(),
        }
        upsertResource(entry)
      }
    } catch { /* discovery is best-effort */ }
  })

  .onAfterSettle(async (ctx) => {
    console.log(`[settle] tx=${ctx.result.transaction} network=${ctx.result.network} payer=${ctx.result.payer}`)
  })

  .onSettleFailure(async (ctx) => {
    console.error(`[settle:fail] ${ctx.error.message}`)
  })

const evmKey = process.env.EVM_PRIVATE_KEY as `0x${string}` | undefined

if (evmKey) {
  const { createWalletClient, http, publicActions } = await import('viem')
  const { privateKeyToAccount } = await import('viem/accounts')
  const { mainnet, base, baseSepolia, sepolia } = await import('viem/chains')
  const { toFacilitatorEvmSigner } = await import('@x402/evm')
  const { ExactEvmScheme } = await import('@x402/evm/exact/facilitator')

  const account = privateKeyToAccount(evmKey)
  console.log(`[evm] facilitator: ${account.address}`)

  const clients = {
    'eip155:1':        createWalletClient({ account, chain: mainnet,    transport: http(process.env.ETH_MAINNET_RPC_URL) }).extend(publicActions),
    'eip155:8453':     createWalletClient({ account, chain: base,       transport: http(process.env.BASE_RPC_URL) }).extend(publicActions),
    'eip155:84532':    createWalletClient({ account, chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL) }).extend(publicActions),
    'eip155:11155111': createWalletClient({ account, chain: sepolia,    transport: http(process.env.ETH_SEPOLIA_RPC_URL) }).extend(publicActions),
  } as const

  const defaultClient = clients['eip155:1']

  const evmSigner = toFacilitatorEvmSigner({
    address:                   account.address,
    getCode:                   (a) => defaultClient.getCode(a),
    readContract:              (a) => defaultClient.readContract({ ...a, args: a.args ?? [] }),
    verifyTypedData:           (a) => defaultClient.verifyTypedData(a as Parameters<typeof defaultClient.verifyTypedData>[0]),
    writeContract:             (a) => defaultClient.writeContract({ ...a, args: a.args ?? [] }),
    sendTransaction:           (a) => defaultClient.sendTransaction(a),
    waitForTransactionReceipt: (a) => defaultClient.waitForTransactionReceipt(a),
  })

  facilitator.register(EVM_NETWORKS, new ExactEvmScheme(evmSigner, { deployERC4337WithEIP6492: true }))
  console.log(`[evm] networks: ${EVM_NETWORKS.join(', ')}`)
} else {
  console.warn('[evm] EVM_PRIVATE_KEY not set — EVM disabled')
}

const svmKey = process.env.SVM_PRIVATE_KEY

if (svmKey) {
  const { base58 } = await import('@scure/base')
  const { createKeyPairSignerFromBytes, createSolanaRpc, mainnet: solMainnet, devnet } = await import('@solana/kit')
  const { toFacilitatorSvmSigner } = await import('@x402/svm')
  const { ExactSvmScheme } = await import('@x402/svm/exact/facilitator')

  const account = await createKeyPairSignerFromBytes(base58.decode(svmKey))
  console.log(`[svm] facilitator: ${account.address}`)

  const svmSigner = toFacilitatorSvmSigner(account, {
    [SVM_MAINNET]: createSolanaRpc(solMainnet(process.env.SOLANA_MAINNET_RPC_URL ?? 'https://api.mainnet-beta.solana.com')),
    [SVM_DEVNET]:  createSolanaRpc(devnet(process.env.SOLANA_DEVNET_RPC_URL ?? 'https://api.devnet.solana.com')),
  })

  facilitator.register(SVM_NETWORKS, new ExactSvmScheme(svmSigner))
  console.log(`[svm] networks: ${SVM_NETWORKS.join(', ')}`)
} else {
  console.warn('[svm] SVM_PRIVATE_KEY not set — SVM disabled')
}

facilitator.register(ICP_NETWORKS, new IcpExactScheme())
console.log(`[icp] facilitator: ${getFacilitatorPrincipalText()}`)
console.log(`[icp] networks: ${ICP_NETWORKS.join(', ')}`)

const app = Fastify({ logger: true })
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

// POST /verify
app.post('/verify', async (req, reply) => {
  const { paymentPayload, paymentRequirements } = req.body as {
    paymentPayload: PaymentPayload
    paymentRequirements: PaymentRequirements
  }
  if (!paymentPayload || !paymentRequirements) {
    return reply.status(400).send({ error: 'missing paymentPayload or paymentRequirements' })
  }
  const result: VerifyResponse = await facilitator.verify(paymentPayload, paymentRequirements)
  return result
})

// POST /settle
app.post('/settle', async (req, reply) => {
  const { paymentPayload, paymentRequirements } = req.body as {
    paymentPayload: PaymentPayload
    paymentRequirements: PaymentRequirements
  }
  if (!paymentPayload || !paymentRequirements) {
    return reply.status(400).send({ error: 'missing paymentPayload or paymentRequirements' })
  }
  try {
    const result: SettleResponse = await facilitator.settle(paymentPayload, paymentRequirements)
    return result
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('Settlement aborted:')) {
      return {
        success: false,
        errorReason: msg.replace('Settlement aborted: ', ''),
        transaction: '',
        network: (paymentPayload as PaymentPayload).accepted?.network ?? 'unknown',
      }
    }
    return reply.status(500).send({ error: msg })
  }
})

// GET /supported
app.get('/supported', async () => facilitator.getSupported())

app.get('/info', async () => ({
  name:   'Consensus Network x402 Facilitator',
  domain: 'facilitator.consensus.canister.software',
  icp: {
    facilitatorPrincipal: getFacilitatorPrincipalText(),
    assets: ICP_NETWORKS,
  },
  evm: {
    enabled: !!evmKey,
    networks: evmKey ? EVM_NETWORKS : [],
  },
  svm: {
    networks: svmKey ? SVM_NETWORKS : [],
  },
  supported: facilitator.getSupported(),
}))

// GET /discovery/resources
app.get('/discovery/resources', async (req) => {
  const query = (req.query as Record<string, string>)
  const limit  = Math.min(Number(query.limit  ?? 100), 500)
  const offset = Number(query.offset ?? 0)
  const { items, total } = listResources(limit, offset)
  return {
    x402Version: 2,
    items,
    pagination: { limit, offset, total },
  }
})

// GET /health
app.get('/health', async () => ({ status: 'ok', db: 'sqlite' }))

try {
  await app.listen({ port, host })
  const supported = facilitator.getSupported()
  app.log.info(`networks registered: ${supported.kinds.map((k: { network: string }) => k.network).join(', ')}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}