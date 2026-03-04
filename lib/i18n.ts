export type AppLanguage = 'zh-CN' | 'en-US'

export function normalizeAppLanguage(value: unknown): AppLanguage {
  if (value === 'zh-CN' || value === 'zh' || value === 'zh-Hans') return 'zh-CN'
  return 'en-US'
}

export function parseRequiredAppLanguage(value: unknown): AppLanguage {
  const raw = String(value || '').trim()
  if (!raw) {
    throw new Error('Missing required parameter: contentLanguage')
  }
  if (raw !== 'zh-CN' && raw !== 'en-US') {
    throw new Error('contentLanguage must be "zh-CN" or "en-US"')
  }
  return raw
}

export function isChineseLanguage(lang: AppLanguage) {
  return lang === 'zh-CN'
}
