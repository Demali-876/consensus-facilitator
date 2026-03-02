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
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
} catch {}

const identitySeed = process.env.FACILITATOR_IDENTITY_SEED
if (!identitySeed) {
  throw new Error('Missing required var: FACILITATOR_IDENTITY_SEED')
}

export const config = {
  icpHost: process.env.ICP_HOST ?? 'https://ic0.app',
  identitySeed,
} as const

export interface AssetConfig {
  symbol: string
  name: string
  decimals: number
  ledgerId: string
  transferFee: bigint
}

export const ASSETS: Record<string, AssetConfig> = {
  'ryjl3-tyaaa-aaaaa-aaaba-cai': {
    symbol: 'ICP',
    name: 'Internet Computer',
    decimals: 8,
    ledgerId: 'ryjl3-tyaaa-aaaaa-aaaba-cai',
    transferFee: 10_000n,
  },
  'xevnm-gaaaa-aaaar-qafnq-cai': {
    symbol: 'ckUSDC',
    name: 'Chain-key USDC',
    decimals: 6,
    ledgerId: 'xevnm-gaaaa-aaaar-qafnq-cai',
    transferFee: 10_000n,
  },
  'cngnf-vqaaa-aaaar-qag4q-cai': {
    symbol: 'ckUSDT',
    name: 'Chain-key USDT',
    decimals: 6,
    ledgerId: 'cngnf-vqaaa-aaaar-qag4q-cai',
    transferFee: 10_000n,
  },
  // Testnet tokens (faucet.internetcomputer.org — Oisy: Test networks → IC)
  'xafvr-biaaa-aaaai-aql5q-cai': {
    symbol: 'TESTICP',
    name: 'Test ICP',
    decimals: 8,
    ledgerId: 'xafvr-biaaa-aaaai-aql5q-cai',
    transferFee: 10_000n,
  },
  '3jkp5-oyaaa-aaaaj-azwqa-cai': {
    symbol: 'TICRC1',
    name: 'Test ICRC-1',
    decimals: 8,
    ledgerId: '3jkp5-oyaaa-aaaaj-azwqa-cai',
    transferFee: 10_000n,
  },
}
