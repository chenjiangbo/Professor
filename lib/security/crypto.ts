import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

function getEncryptionKey(): Buffer {
  const secret =
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.APP_SECRET ||
    process.env.LLM_API_KEY ||
    'dev-only-insecure-key'
  return createHash('sha256').update(secret).digest()
}

function concatU8(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function encryptText(plain: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key as any, iv as any)
  const encryptedPart = Uint8Array.from(cipher.update(plain, 'utf8') as any)
  const finalPart = Uint8Array.from(cipher.final() as any)
  const encrypted = concatU8([encryptedPart, finalPart])
  const tag = Uint8Array.from(cipher.getAuthTag() as any)
  return `${iv.toString('base64')}.${Buffer.from(tag).toString('base64')}.${Buffer.from(encrypted).toString('base64')}`
}

export function decryptText(encoded: string): string {
  const [ivB64, tagB64, dataB64] = String(encoded || '').split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted payload format')
  }
  const key = getEncryptionKey()
  const decipher = createDecipheriv('aes-256-gcm', key as any, Buffer.from(ivB64, 'base64') as any)
  decipher.setAuthTag(Buffer.from(tagB64, 'base64') as any)
  const decryptedPart = Uint8Array.from(decipher.update(Buffer.from(dataB64, 'base64') as any) as any)
  const finalPart = Uint8Array.from(decipher.final() as any)
  const decrypted = concatU8([decryptedPart, finalPart])
  return Buffer.from(decrypted).toString('utf8')
}
