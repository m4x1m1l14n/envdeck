import type { TypeSpec } from '../../core'

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const HEX = '0123456789abcdef'

/**
 * Generate a random value that tries to satisfy the variable's rules:
 * hex when the pattern looks hex-only, otherwise alphanumeric; length from
 * minLength/maxLength (default 48).
 */
export function generateSecret(type: TypeSpec): string {
  if (type.name === 'uuid') return crypto.randomUUID()
  let length = 48
  let alphabet = ALNUM
  let prefix = ''
  if (type.name === 'string') {
    if (type.maxLength !== undefined) length = Math.min(length, type.maxLength)
    if (type.minLength !== undefined) length = Math.max(length, type.minLength)
    if (type.pattern && /^\^?\[(a-f0-9|0-9a-f|a-fA-F0-9|0-9a-fA-F)\]/.test(type.pattern)) alphabet = HEX
    prefix = type.startsWith ?? ''
  }
  const n = Math.max(1, length - prefix.length)
  const bytes = crypto.getRandomValues(new Uint32Array(n))
  let out = prefix
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}
