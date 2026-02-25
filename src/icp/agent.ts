import { HttpAgent } from '@icp-sdk/core/agent'
import { config } from '../config.js'
import { getFacilitatorIdentity } from './identity.js'

let _agent: HttpAgent | null = null

export function getAgent(): HttpAgent {
  if (_agent) return _agent

  _agent = HttpAgent.createSync({
    host: config.icpHost,
    identity: getFacilitatorIdentity(),
    verifyQuerySignatures: false,
  })

  if (config.icpHost.includes('localhost') || config.icpHost.includes('127.0.0.1')) {
    _agent.fetchRootKey().catch(console.error)
  }

  return _agent
}
