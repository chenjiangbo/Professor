import { createSign, createVerify, randomBytes } from 'crypto'

type AlipayConfig = {
  appId: string
  gateway: string
  privateKey: string
  publicKey: string
  callbackUrl: string
  sellerId?: string
  payeeUserId?: string
}

type PrecreateParams = {
  outTradeNo: string
  totalAmount: string
  subject: string
  timeoutExpress: string
}

type TradeQueryParams = {
  outTradeNo: string
}

type TradeCloseParams = {
  outTradeNo: string
}

type AlipayApiResponse<T = Record<string, unknown>> = {
  code: string
  msg: string
  sub_code?: string
  sub_msg?: string
} & T

type PrecreateResponse = AlipayApiResponse<{ qr_code?: string }>
type QueryResponse = AlipayApiResponse<{
  trade_status?: string
  out_trade_no?: string
  trade_no?: string
  total_amount?: string
  seller_id?: string
  buyer_user_id?: string
  payee_user_id?: string
}>
type CloseResponse = AlipayApiResponse<{ trade_no?: string; out_trade_no?: string }>

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return String(value).trim()
}

function getAlipayConfig(): AlipayConfig {
  const privateKey = normalizeKey(requireEnv('ALIPAY_PRIVATE_KEY'), 'private')
  const publicKey = normalizeKey(requireEnv('ALIPAY_PUBLIC_KEY'), 'public')
  return {
    appId: requireEnv('ALIPAY_APP_ID'),
    gateway: requireEnv('ALIPAY_GATEWAY'),
    privateKey,
    publicKey,
    callbackUrl: requireEnv('ALIPAY_CALLBACK_URL'),
    sellerId: process.env.ALIPAY_SELLER_ID ? String(process.env.ALIPAY_SELLER_ID).trim() : undefined,
    payeeUserId: process.env.ALIPAY_PAYEE_USER_ID ? String(process.env.ALIPAY_PAYEE_USER_ID).trim() : undefined,
  }
}

function wrapPem(base64: string, label: string): string {
  const chunks = base64.match(/.{1,64}/g)
  if (!chunks || chunks.length === 0) {
    throw new Error(`Invalid ${label} key: empty base64 content`)
  }
  return [`-----BEGIN ${label} KEY-----`, ...chunks, `-----END ${label} KEY-----`].join('\n')
}

function normalizeKey(raw: string, type: 'private' | 'public'): string {
  if (raw.includes('BEGIN')) {
    return raw
  }

  const base64 = raw.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
    throw new Error(`Invalid ${type} key: expected PEM or base64-encoded key`)
  }

  return type === 'private' ? wrapPem(base64, 'PRIVATE') : wrapPem(base64, 'PUBLIC')
}

function buildSignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
}

function signWithRsa2(content: string, privateKey: string): string {
  const trySign = (key: string) => {
    const signer = createSign('RSA-SHA256')
    signer.update(content, 'utf8')
    signer.end()
    return signer.sign(key, 'base64')
  }

  try {
    return trySign(privateKey)
  } catch (error) {
    // Alipay console may provide a raw PKCS#1 key; support both PKCS#8 and PKCS#1 PEM labels.
    if (privateKey.includes('BEGIN PRIVATE KEY')) {
      const pkcs1Key = privateKey
        .replace('BEGIN PRIVATE KEY', 'BEGIN RSA PRIVATE KEY')
        .replace('END PRIVATE KEY', 'END RSA PRIVATE KEY')
      return trySign(pkcs1Key)
    }
    if (privateKey.includes('BEGIN RSA PRIVATE KEY')) {
      const pkcs8Key = privateKey
        .replace('BEGIN RSA PRIVATE KEY', 'BEGIN PRIVATE KEY')
        .replace('END RSA PRIVATE KEY', 'END PRIVATE KEY')
      return trySign(pkcs8Key)
    }
    throw error
  }
}

function verifyWithRsa2(content: string, signature: string, publicKey: string): boolean {
  const verifier = createVerify('RSA-SHA256')
  verifier.update(content, 'utf8')
  verifier.end()
  return verifier.verify(publicKey, signature, 'base64')
}

function buildCommonParams(method: string, notifyUrl?: string): Record<string, string> {
  const config = getAlipayConfig()
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const common: Record<string, string> = {
    app_id: config.appId,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp,
    version: '1.0',
    nonce_str: randomBytes(16).toString('hex'),
  }
  if (notifyUrl) {
    common.notify_url = notifyUrl
  }
  return common
}

async function postToAlipay<T>(
  method: string,
  bizContent: Record<string, unknown>,
  opts?: { notifyUrl?: string },
): Promise<T> {
  const config = getAlipayConfig()
  const params: Record<string, string> = {
    ...buildCommonParams(method, opts?.notifyUrl),
    biz_content: JSON.stringify(bizContent),
  }

  const signContent = buildSignContent(params)
  params.sign = signWithRsa2(signContent, config.privateKey)

  const form = new URLSearchParams(params)
  const resp = await fetch(config.gateway, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: form,
  })

  if (!resp.ok) {
    throw new Error(`Alipay gateway request failed with status ${resp.status}`)
  }

  const payload = (await resp.json()) as Record<string, unknown>
  const responseKey = `${method.replace(/\./g, '_')}_response`
  const methodResponse = payload[responseKey]
  if (!methodResponse || typeof methodResponse !== 'object') {
    throw new Error(`Alipay response missing ${responseKey}`)
  }
  const responseCode =
    typeof (methodResponse as Record<string, unknown>).code === 'string'
      ? String((methodResponse as Record<string, unknown>).code)
      : ''
  if (responseCode !== '10000') {
    console.error('[alipay] api error response', {
      method,
      gateway: config.gateway,
      response: methodResponse,
      raw_payload: payload,
    })
  }
  return methodResponse as T
}

export async function alipayPrecreate(params: PrecreateParams): Promise<PrecreateResponse> {
  const config = getAlipayConfig()
  return postToAlipay<PrecreateResponse>(
    'alipay.trade.precreate',
    {
      out_trade_no: params.outTradeNo,
      total_amount: params.totalAmount,
      subject: params.subject,
      timeout_express: params.timeoutExpress,
    },
    { notifyUrl: config.callbackUrl },
  )
}

export async function alipayTradeQuery(params: TradeQueryParams): Promise<QueryResponse> {
  return postToAlipay<QueryResponse>('alipay.trade.query', {
    out_trade_no: params.outTradeNo,
  })
}

export async function alipayTradeClose(params: TradeCloseParams): Promise<CloseResponse> {
  return postToAlipay<CloseResponse>('alipay.trade.close', {
    out_trade_no: params.outTradeNo,
  })
}

export type AlipayNotifyPayload = Record<string, string>

export function parseNotifyPayload(body: unknown): AlipayNotifyPayload {
  if (!body) {
    throw new Error('Empty notify payload')
  }

  if (typeof body === 'string') {
    const parsed = new URLSearchParams(body)
    const map: Record<string, string> = {}
    parsed.forEach((value, key) => {
      map[key] = value
    })
    return map
  }

  if (typeof body === 'object') {
    const map: Record<string, string> = {}
    for (const [key, value] of Object.entries(body)) {
      if (Array.isArray(value)) {
        map[key] = String(value[0] || '')
      } else {
        map[key] = String(value ?? '')
      }
    }
    return map
  }

  throw new Error('Unsupported notify payload format')
}

export function verifyNotifySignature(payload: AlipayNotifyPayload): boolean {
  const config = getAlipayConfig()
  const signature = String(payload.sign || '')
    .trim()
    .replace(/ /g, '+')
  if (!signature) {
    throw new Error('Notify payload missing sign')
  }

  const signSource: Record<string, string> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'sign' || k === 'sign_type') continue
    signSource[k] = v
  }

  const signContent = buildSignContent(signSource)
  return verifyWithRsa2(signContent, signature, config.publicKey)
}

export function validateNotifyApp(payload: AlipayNotifyPayload) {
  const config = getAlipayConfig()
  if (!payload.app_id) {
    throw new Error('Notify payload missing app_id')
  }
  if (payload.app_id !== config.appId) {
    throw new Error('app_id mismatch')
  }
}

export function validateNotifyReceiver(payload: AlipayNotifyPayload) {
  const config = getAlipayConfig()
  if (config.sellerId && payload.seller_id !== config.sellerId) {
    throw new Error('seller_id mismatch')
  }
  if (config.payeeUserId && payload.payee_user_id !== config.payeeUserId) {
    throw new Error('payee_user_id mismatch')
  }
}
