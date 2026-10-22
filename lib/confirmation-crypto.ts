// SERVER ONLY. Never import from a 'use client' file.
import { createHmac, randomInt } from 'node:crypto'

export function generateCode(alphabet: string, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)]
  return out
}

// Bound to the submission: the same code text never works for another submission.
export function hashCode(secret: string, submissionId: string, code: string): string {
  return createHmac('sha256', secret).update(`${submissionId}:${code}`).digest('hex')
}

export function readSecret(): string | null {
  const s = process.env.CONFIRMATION_CODE_SECRET ?? ''
  return s.length >= 32 ? s : null
}