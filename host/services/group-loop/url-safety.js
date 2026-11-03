/** URL/address safety for fetching search-result pages. */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home', '.lan']

export function isPrivateIPv4(address) {
  const parts = String(address ?? '').split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  return false
}

export function isPrivateAddress(address) {
  const value = String(address ?? '').trim().replace(/^\[|\]$/gu, '').toLowerCase()
  if (value === '') return true
  if (isIP(value) === 4) return isPrivateIPv4(value)
  if (isIP(value) !== 6) return true
  if (value === '::' || value === '::1') return true
  if (value.includes('::ffff:')) return true
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true
  if (value.startsWith('fc') || value.startsWith('fd')) return true
  if (value.startsWith('2001:db8:')) return true
  return false
}

export function isBlockedHostname(hostname) {
  const host = String(hostname ?? '').trim().toLowerCase().replace(/\.$/u, '')
  if (host === '' || host === 'localhost') return true
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

export async function resolvePublicHttpUrl(raw, lookupHost = lookup) {
  let url
  try {
    url = new URL(String(raw))
  } catch {
    throw new Error('invalid-url')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported-protocol')
  if (url.username !== '' || url.password !== '') throw new Error('url-credentials')
  if (url.port !== '' && url.port !== '80' && url.port !== '443') throw new Error('url-port')
  const hostname = url.hostname.replace(/^\[|\]$/gu, '').toLowerCase()
  if (isBlockedHostname(hostname)) throw new Error('local-host')
  if (isIP(hostname) !== 0) {
    if (isPrivateAddress(hostname)) throw new Error('private-address')
    return url
  }
  const answers = await lookupHost(hostname, { all: true, verbatim: true })
  const list = Array.isArray(answers) ? answers : []
  if (list.length === 0) throw new Error('no-dns')
  if (list.some((answer) => isPrivateAddress(String(answer.address ?? '')))) throw new Error('private-address')
  return url
}
