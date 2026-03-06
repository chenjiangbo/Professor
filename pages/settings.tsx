import Head from 'next/head'
import { NextPage } from 'next'
import { useEffect, useRef, useState } from 'react'
import { ModeToggle } from '~/components/mode-toggle'
import LanguageSwitcher from '~/components/LanguageSwitcher'
import { useAppLanguage } from '~/hooks/useAppLanguage'

const SettingsPage: NextPage = () => {
  const { language, setLanguage } = useAppLanguage()
  const isZh = language === 'zh-CN'
  const tx = (en: string, zh: string) => (isZh ? zh : en)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingInterpretationMode, setSavingInterpretationMode] = useState(false)
  const [validating, setValidating] = useState(false)
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'sessdata' | 'cookie'>('sessdata')
  const [value, setValue] = useState('')
  const [authState, setAuthState] = useState<any>(null)
  const [qrState, setQrState] = useState<any>(null)
  const [qrBusy, setQrBusy] = useState(false)
  const [qrMessage, setQrMessage] = useState('')
  const [showQrModal, setShowQrModal] = useState(false)
  const [showQrSuccess, setShowQrSuccess] = useState(false)
  const [showAdvancedAuth, setShowAdvancedAuth] = useState(false)
  const qrPollRef = useRef<number | null>(null)
  const qrCloseTimerRef = useRef<number | null>(null)
  const [ytMode, setYtMode] = useState<'cookie' | 'cookies_txt'>('cookie')
  const [ytValue, setYtValue] = useState('')
  const [ytAuthState, setYtAuthState] = useState<any>(null)
  const [ytSaving, setYtSaving] = useState(false)
  const [ytValidating, setYtValidating] = useState(false)
  const [ytMessage, setYtMessage] = useState('')
  const [dyMode, setDyMode] = useState<'cookie' | 'cookies_txt'>('cookie')
  const [dyValue, setDyValue] = useState('')
  const [dyAuthState, setDyAuthState] = useState<any>(null)
  const [dySaving, setDySaving] = useState(false)
  const [dyValidating, setDyValidating] = useState(false)
  const [dyMessage, setDyMessage] = useState('')
  const [defaultInterpretationMode, setDefaultInterpretationMode] = useState<'concise' | 'detailed' | 'extract'>(
    'concise',
  )

  const loadAuthState = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/bbdown-auth')
      const json = await res.json()
      setAuthState(json)
      setMode(json?.mode === 'cookie' ? 'cookie' : 'sessdata')
    } finally {
      setLoading(false)
    }
  }

  const loadQrState = async () => {
    try {
      const res = await fetch('/api/settings/bbdown-auth/qr/status')
      const json = await res.json()
      setQrState(json)
    } catch {
      setQrState({ active: false })
    }
  }

  const loadInterpretationMode = async () => {
    try {
      const res = await fetch('/api/settings/interpretation-mode')
      const json = await res.json()
      if (json?.mode === 'detailed') setDefaultInterpretationMode('detailed')
      else if (json?.mode === 'extract') setDefaultInterpretationMode('extract')
      else setDefaultInterpretationMode('concise')
    } catch {
      setDefaultInterpretationMode('concise')
    }
  }

  const loadYouTubeAuthState = async () => {
    try {
      const res = await fetch('/api/settings/youtube-auth')
      const json = await res.json()
      setYtAuthState(json)
      setYtMode((prev) => {
        // Only initialize from server on first load; do not override user's current editor selection.
        if (ytAuthState !== null) return prev
        return json?.mode === 'cookies_txt' ? 'cookies_txt' : 'cookie'
      })
    } catch {
      setYtAuthState({ configured: false })
    }
  }

  const loadDouyinAuthState = async () => {
    try {
      const res = await fetch('/api/settings/douyin-auth')
      const json = await res.json()
      setDyAuthState(json)
      setDyMode((prev) => {
        // Only initialize from server on first load; do not override user's current editor selection.
        if (dyAuthState !== null) return prev
        return json?.mode === 'cookies_txt' ? 'cookies_txt' : 'cookie'
      })
    } catch {
      setDyAuthState({ configured: false })
    }
  }

  useEffect(() => {
    loadAuthState()
    loadQrState()
    loadYouTubeAuthState()
    loadDouyinAuthState()
    loadInterpretationMode()
  }, [])

  useEffect(() => {
    const shouldPoll = Boolean(qrState?.active)
    if (!shouldPoll) {
      if (qrPollRef.current) {
        window.clearInterval(qrPollRef.current)
        qrPollRef.current = null
      }
      return
    }

    if (qrPollRef.current) return
    qrPollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch('/api/settings/bbdown-auth/qr/status')
        const json = await res.json()
        setQrState(json)
        if (!json?.active) {
          if (qrPollRef.current) {
            window.clearInterval(qrPollRef.current)
            qrPollRef.current = null
          }
          await loadAuthState()
        }
      } catch {
        // Keep polling and allow retry.
      }
    }, 1500)

    return () => {
      if (qrPollRef.current) {
        window.clearInterval(qrPollRef.current)
        qrPollRef.current = null
      }
    }
  }, [qrState?.active])

  useEffect(() => {
    if (!showQrModal) {
      setShowQrSuccess(false)
      if (qrCloseTimerRef.current) {
        window.clearTimeout(qrCloseTimerRef.current)
        qrCloseTimerRef.current = null
      }
      return
    }

    if (qrState?.status === 'success') {
      setShowQrSuccess(true)
      if (qrCloseTimerRef.current) {
        window.clearTimeout(qrCloseTimerRef.current)
      }
      qrCloseTimerRef.current = window.setTimeout(() => {
        setShowQrModal(false)
        setShowQrSuccess(false)
        qrCloseTimerRef.current = null
      }, 900)
      return
    }

    if (qrState?.status !== 'success') {
      setShowQrSuccess(false)
    }
  }, [qrState?.status, showQrModal])

  const saveInterpretationMode = async () => {
    setSavingInterpretationMode(true)
    setMessage('')
    try {
      const res = await fetch('/api/settings/interpretation-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: defaultInterpretationMode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || res.statusText)
      setMessage(tx('Default interpretation mode saved.', '默认解读模式已保存。'))
    } catch (e: any) {
      setMessage(e?.message || tx('Failed to save default interpretation mode', '保存默认解读模式失败'))
    } finally {
      setSavingInterpretationMode(false)
    }
  }

  const saveAuth = async () => {
    if (!value.trim()) {
      setMessage(tx('Please paste SESSDATA or a full Cookie string first.', '请先粘贴 SESSDATA 或完整 Cookie 字符串。'))
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/settings/bbdown-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || res.statusText)
      const base = json?.validation?.valid
        ? tx('Saved successfully. Credential validation passed.', '保存成功，凭据校验通过。')
        : `${tx('Saved, but validation failed:', '已保存，但校验失败：')} ${
            json?.validation?.message || tx('Unknown error', '未知错误')
          }`
      const weakHint =
        json?.cookieStrength?.level === 'basic'
          ? tx(
              ' Cookie strength is weak. Use a full Cookie string for more reliable subtitle downloads.',
              ' Cookie 强度较弱，建议使用完整 Cookie 字符串以提升字幕下载稳定性。',
            )
          : ''
      setMessage(base + weakHint)
      setValue('')
      await loadAuthState()
    } catch (e: any) {
      setMessage(e?.message || tx('Failed to save credential', '保存凭据失败'))
    } finally {
      setSaving(false)
    }
  }

  const validateAuth = async () => {
    setValidating(true)
    setMessage('')
    try {
      const res = await fetch('/api/settings/bbdown-auth/validate', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || res.statusText)
      const base = json?.validation?.valid
        ? tx('Credential is valid.', '凭据有效。')
        : `${tx('Credential is invalid:', '凭据无效：')} ${json?.validation?.message || ''}`
      const weakHint =
        json?.cookieStrength?.level === 'basic'
          ? tx(
              ' Cookie strength is weak. Use a full Cookie string for more reliable subtitle downloads.',
              ' Cookie 强度较弱，建议使用完整 Cookie 字符串以提升字幕下载稳定性。',
            )
          : ''
      setMessage(base + weakHint)
      await loadAuthState()
    } catch (e: any) {
      setMessage(e?.message || tx('Credential validation failed', '凭据校验失败'))
    } finally {
      setValidating(false)
    }
  }

  const clearAuth = async () => {
    setMessage('')
    await fetch('/api/settings/bbdown-auth', { method: 'DELETE' })
    await loadAuthState()
    setValue('')
    setMessage(tx('Credential cleared.', '凭据已清除。'))
  }

  const startQrLogin = async () => {
    setQrBusy(true)
    setQrMessage('')
    setShowQrModal(true)
    try {
      const res = await fetch('/api/settings/bbdown-auth/qr/start', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || res.statusText)
      setQrState(json)
      setQrMessage(
        tx(
          'QR login started. Scan the code in Bilibili app, then confirm on your phone.',
          '扫码登录已启动。请在哔哩哔哩 App 扫码并在手机上确认。',
        ),
      )
    } catch (e: any) {
      setQrMessage(e?.message || tx('Failed to start QR login', '启动扫码登录失败'))
      setShowQrModal(false)
    } finally {
      setQrBusy(false)
    }
  }

  const cancelQrLogin = async () => {
    setQrBusy(true)
    setQrMessage('')
    try {
      const res = await fetch('/api/settings/bbdown-auth/qr/cancel', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || res.statusText)
      setQrState(json)
      setQrMessage(tx('QR login cancelled.', '扫码登录已取消。'))
    } catch (e: any) {
      setQrMessage(e?.message || tx('Failed to cancel QR login', '取消扫码登录失败'))
    } finally {
      setQrBusy(false)
    }
  }

  const saveYouTubeAuth = async () => {
    if (!ytValue.trim()) {
      setYtMessage(
        tx(
          'Please paste a YouTube Cookie or cookies.txt content first.',
          '请先粘贴 YouTube Cookie 或 cookies.txt 内容。',
        ),
      )
      return
    }
    setYtSaving(true)
    setYtMessage('')
    try {
      const res = await fetch('/api/settings/youtube-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: ytMode, value: ytValue }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || res.statusText)
      const base = json?.validation?.valid
        ? tx('YouTube credential saved successfully, format validation passed.', 'YouTube 凭据保存成功，格式校验通过。')
        : `${tx('YouTube credential saved, but validation failed:', 'YouTube 凭据已保存，但校验失败：')} ${
            json?.validation?.message || tx('Unknown error', '未知错误')
          }`
      setYtMessage(base)
      setYtValue('')
      await loadYouTubeAuthState()
    } catch (e: any) {
      setYtMessage(e?.message || tx('Failed to save YouTube credential', '保存 YouTube 凭据失败'))
    } finally {
      setYtSaving(false)
    }
  }

  const validateYouTubeAuth = async () => {
    setYtValidating(true)
    setYtMessage('')
    try {
      const res = await fetch('/api/settings/youtube-auth/validate', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || res.statusText)
      const base = json?.validation?.valid
        ? tx('YouTube Credential is valid.', 'YouTube 凭据有效。')
        : `${tx('YouTube Credential is invalid:', 'YouTube 凭据无效：')} ${json?.validation?.message || ''}`
      setYtMessage(base)
      await loadYouTubeAuthState()
    } catch (e: any) {
      setYtMessage(e?.message || tx('YouTube Credential validation failed', 'YouTube 凭据校验失败'))
    } finally {
      setYtValidating(false)
    }
  }

  const clearYouTubeAuth = async () => {
    setYtMessage('')
    await fetch('/api/settings/youtube-auth', { method: 'DELETE' })
    await loadYouTubeAuthState()
    setYtValue('')
    setYtMessage(tx('YouTube credential cleared.', 'YouTube 凭据已清除。'))
  }

  const saveDouyinAuth = async () => {
    if (!dyValue.trim()) {
      setDyMessage(
        tx('Please paste a Douyin Cookie or cookies.txt content first.', '请先粘贴抖音 Cookie 或 cookies.txt 内容。'),
      )
      return
    }
    setDySaving(true)
    setDyMessage('')
    try {
      const res = await fetch('/api/settings/douyin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: dyMode, value: dyValue }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || res.statusText)
      const base = json?.validation?.valid
        ? tx('Douyin credential saved successfully, format validation passed.', '抖音凭据保存成功，格式校验通过。')
        : `${tx('Douyin credential saved, but validation failed:', '抖音凭据已保存，但校验失败：')} ${
            json?.validation?.message || tx('Unknown error', '未知错误')
          }`
      setDyMessage(base)
      setDyValue('')
      await loadDouyinAuthState()
    } catch (e: any) {
      setDyMessage(e?.message || tx('Failed to save Douyin credential', '保存抖音凭据失败'))
    } finally {
      setDySaving(false)
    }
  }

  const validateDouyinAuth = async () => {
    setDyValidating(true)
    setDyMessage('')
    try {
      const res = await fetch('/api/settings/douyin-auth/validate', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || res.statusText)
      const base = json?.validation?.valid
        ? tx('Douyin credential is valid.', '抖音凭据有效。')
        : `${tx('Douyin credential is invalid:', '抖音凭据无效：')} ${json?.validation?.message || ''}`
      setDyMessage(base)
      await loadDouyinAuthState()
    } catch (e: any) {
      setDyMessage(e?.message || tx('Douyin credential validation failed', '抖音凭据校验失败'))
    } finally {
      setDyValidating(false)
    }
  }

  const clearDouyinAuth = async () => {
    setDyMessage('')
    await fetch('/api/settings/douyin-auth', { method: 'DELETE' })
    await loadDouyinAuthState()
    setDyValue('')
    setDyMessage(tx('Douyin credential cleared.', '抖音凭据已清除。'))
  }

  return (
    <>
      <Head>
        <title>{tx('Settings · Professor', '设置 · Professor')}</title>
      </Head>
      <div className="relative flex min-h-screen w-full flex-col bg-surface font-display text-text-main dark:bg-background-dark dark:text-white">
        <div className="layout-container flex h-full grow flex-col">
          <div className="flex flex-1 justify-center py-5">
            <div className="layout-content-container flex w-full max-w-[960px] flex-1 flex-col px-4 sm:px-10">
              <header className="flex items-center justify-between whitespace-nowrap border-b border-border-strong px-4 py-3 dark:border-white/10">
                <div className="flex items-center gap-4 text-text-main dark:text-white">
                  <div className="size-6 text-primary">
                    <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                      <path
                        clipRule="evenodd"
                        d="M24 18.4228L42 11.475V34.3663C42 34.7796 41.7457 35.1504 41.3601 35.2992L24 42V18.4228Z"
                        fill="currentColor"
                        fillRule="evenodd"
                      ></path>
                      <path
                        clipRule="evenodd"
                        d="M24 8.18819L33.4123 11.574L24 15.2071L14.5877 11.574L24 8.18819ZM9 15.8487L21 20.4805V37.6263L9 32.9945V15.8487ZM27 37.6263V20.4805L39 15.8487V32.9945L27 37.6263ZM25.354 2.29885C24.4788 1.98402 23.5212 1.98402 22.646 2.29885L4.98454 8.65208C3.7939 9.08038 3 10.2097 3 11.475V34.3663C3 36.0196 4.01719 37.5026 5.55962 38.098L22.9197 44.7987C23.6149 45.0671 24.3851 45.0671 25.0803 44.7987L42.4404 38.098C43.9828 37.5026 45 36.0196 45 34.3663V11.475C45 10.2097 44.2061 9.08038 43.0155 8.65208L25.354 2.29885Z"
                        fill="currentColor"
                        fillRule="evenodd"
                      ></path>
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold leading-tight tracking-[-0.015em] text-text-main dark:text-white">
                    Professor
                  </h2>
                </div>
                <div className="flex flex-1 justify-end gap-6 sm:gap-8">
                  <div className="hidden items-center gap-8 sm:flex">
                    <a
                      className="inline-flex items-center gap-1 text-sm font-medium leading-normal text-text-main transition-colors hover:text-text-muted dark:text-white/80 dark:hover:text-white"
                      href="/notebooks"
                    >
                      <span className="material-symbols-outlined text-[16px]">menu_book</span>
                      {tx('Notebooks', '笔记本')}
                    </a>
                    <a
                      className="inline-flex items-center gap-1 text-sm font-bold leading-normal text-primary"
                      href="/settings"
                    >
                      <span className="material-symbols-outlined text-[16px]">settings</span>
                      {tx('Settings', '设置')}
                    </a>
                  </div>
                  <div className="flex items-center gap-3">
                    <LanguageSwitcher language={language} onChange={setLanguage} />
                    <ModeToggle />
                    <div
                      className="size-10 rounded-full bg-cover bg-center"
                      data-alt="User avatar with a colorful gradient background"
                      style={{ backgroundImage: "url('/assets/img-2a312bd9a53805d9.jpg')" }}
                    />
                  </div>
                </div>
              </header>
              <main className="flex flex-col gap-8 py-8">
                <div className="flex flex-wrap justify-between gap-3 px-4">
                  <p className="min-w-72 text-4xl font-black leading-tight tracking-[-0.033em] text-text-main dark:text-white">
                    {tx('Settings', '设置')}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                  {tx(
                    'If you import Bilibili, YouTube, or Douyin videos, configure platform credentials first (full Cookie recommended).',
                    '如果你要导入 Bilibili、YouTube 或抖音视频，请先配置平台凭据（建议完整 Cookie）。',
                  )}
                  <a className="ml-2 font-semibold underline" href="#bbdown-login">
                    {tx('Jump to credential section', '跳转到凭据设置')}
                  </a>
                </div>
                <div className="flex flex-col gap-8">
                  <div
                    id="bbdown-login"
                    className="order-first rounded-lg border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-transparent dark:bg-white/5 dark:shadow-none"
                  >
                    <div className="flex flex-col items-stretch justify-start">
                      <div className="flex w-full flex-col items-stretch justify-center gap-2">
                        <p className="text-lg font-bold leading-tight tracking-[-0.015em] text-text-main dark:text-white">
                          {tx('Default interpretation mode', '默认解读模式')}
                        </p>
                        <p className="text-sm font-normal leading-normal text-text-muted dark:text-gray-400">
                          {tx(
                            'Choose how new video interpretations are generated by default.',
                            '选择新视频解读的默认生成方式。',
                          )}
                        </p>
                      </div>
                      <div
                        className="flex flex-col gap-3 py-6"
                        style={{
                          ['--radio-dot-svg' as string]:
                            "url('data:image/svg+xml,%3csvg viewBox=%270 0 16 16%27 fill=%27rgb(255,255,255)%27 xmlns=%27http://www.w3.org/2000/svg%27%3e%3ccircle cx=%278%27 cy=%278%27 r=%273%27/%3e%3c/svg%3e')",
                        }}
                      >
                        <label className="has-[:checked]:border-accent has-[:checked]:bg-accent/10 dark:has-[:checked]:border-primary dark:has-[:checked]:bg-primary/10 flex cursor-pointer items-start gap-4 rounded-lg border border-border-strong p-[15px] transition-colors dark:border-white/20">
                          <input
                            type="radio"
                            name="summary-mode"
                            className="mt-1 h-5 w-5 shrink-0 appearance-none rounded-full border-2 border-border-strong bg-transparent text-transparent checked:border-accent checked:bg-accent checked:bg-[image:--radio-dot-svg] focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-surface checked:focus:border-accent dark:border-white/30 dark:checked:border-primary dark:checked:bg-primary dark:focus:ring-primary/50 dark:focus:ring-offset-background-dark dark:checked:focus:border-primary"
                            checked={defaultInterpretationMode === 'concise'}
                            onChange={() => setDefaultInterpretationMode('concise')}
                          />
                          <div className="flex grow flex-col">
                            <p className="text-sm font-medium leading-normal text-text-main dark:text-white">
                              {tx('Concise', '简洁')}
                            </p>
                            <p className="text-sm font-normal leading-normal text-text-muted dark:text-gray-400">
                              {tx(
                                'Faster reading, higher compression, suitable for quick learning.',
                                '阅读更快、压缩更高，适合快速学习。',
                              )}
                            </p>
                          </div>
                        </label>
                        <label className="has-[:checked]:border-accent has-[:checked]:bg-accent/10 dark:has-[:checked]:border-primary dark:has-[:checked]:bg-primary/10 flex cursor-pointer items-start gap-4 rounded-lg border border-border-strong p-[15px] transition-colors dark:border-white/20">
                          <input
                            type="radio"
                            name="summary-mode"
                            className="mt-1 h-5 w-5 shrink-0 appearance-none rounded-full border-2 border-border-strong bg-transparent text-transparent checked:border-accent checked:bg-accent checked:bg-[image:--radio-dot-svg] focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-surface checked:focus:border-accent dark:border-white/30 dark:checked:border-primary dark:checked:bg-primary dark:focus:ring-primary/50 dark:focus:ring-offset-background-dark dark:checked:focus:border-primary"
                            checked={defaultInterpretationMode === 'detailed'}
                            onChange={() => setDefaultInterpretationMode('detailed')}
                          />
                          <div className="flex grow flex-col">
                            <p className="text-sm font-medium leading-normal text-text-main dark:text-white">
                              {tx('Detailed', '详细')}
                            </p>
                            <p className="text-sm font-normal leading-normal text-text-muted dark:text-gray-400">
                              {tx(
                                'Preserve more details and reasoning chain, suitable for deep study.',
                                '保留更多细节与推理链，适合深度学习。',
                              )}
                            </p>
                          </div>
                        </label>
                        <label className="has-[:checked]:border-accent has-[:checked]:bg-accent/10 dark:has-[:checked]:border-primary dark:has-[:checked]:bg-primary/10 flex cursor-pointer items-start gap-4 rounded-lg border border-border-strong p-[15px] transition-colors dark:border-white/20">
                          <input
                            type="radio"
                            name="summary-mode"
                            className="mt-1 h-5 w-5 shrink-0 appearance-none rounded-full border-2 border-border-strong bg-transparent text-transparent checked:border-accent checked:bg-accent checked:bg-[image:--radio-dot-svg] focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-surface checked:focus:border-accent dark:border-white/30 dark:checked:border-primary dark:checked:bg-primary dark:focus:ring-primary/50 dark:focus:ring-offset-background-dark dark:checked:focus:border-primary"
                            checked={defaultInterpretationMode === 'extract'}
                            onChange={() => setDefaultInterpretationMode('extract')}
                          />
                          <div className="flex grow flex-col">
                            <p className="text-sm font-medium leading-normal text-text-main dark:text-white">
                              {tx('Extract (Minimal)', '极简知识提炼')}
                            </p>
                            <p className="text-sm font-normal leading-normal text-text-muted dark:text-gray-400">
                              {tx(
                                'Minimal knowledge distillation: keep only the key points in plain language.',
                                '极简知识提炼：只保留关键知识点，并用大白话说明。',
                              )}
                            </p>
                          </div>
                        </label>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={saveInterpretationMode}
                            disabled={savingInterpretationMode}
                            className="flex h-9 min-w-[110px] items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                          >
                            {savingInterpretationMode ? tx('Saving...', '保存中...') : tx('Save mode', '保存模式')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-transparent dark:bg-white/5 dark:shadow-none">
                    <div className="mb-4">
                      <div className="flex items-center gap-2">
                        <img
                          src="/assets/platform-logos/bilibili.svg"
                          alt="Bilibili logo"
                          className="h-5 w-5 shrink-0"
                        />
                        <p className="text-lg font-bold leading-tight tracking-[-0.015em] text-text-main dark:text-white">
                          {tx('Bilibili / BBDown Login', 'Bilibili / BBDown 登录')}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-text-muted dark:text-gray-400">
                        {tx(
                          'Save your own Bilibili credential for stable subtitle downloading via BBDown.',
                          '保存你的 Bilibili 凭据，用于通过 BBDown 稳定下载字幕。',
                        )}
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-md border border-border-strong bg-white/60 p-3 text-sm dark:border-white/20 dark:bg-black/20">
                        {loading ? (
                          <p className="text-text-muted dark:text-gray-400">
                            {tx('Loading status...', '加载状态中...')}
                          </p>
                        ) : authState?.configured ? (
                          <div className="space-y-1">
                            <p>
                              {tx('Status:', '状态：')}
                              <span
                                className={
                                  authState?.status === 'valid'
                                    ? 'text-green-600 dark:text-green-400'
                                    : authState?.status === 'invalid'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-yellow-600 dark:text-yellow-300'
                                }
                              >
                                {authState?.status || tx('unknown', '未知')}
                              </span>
                            </p>
                            <p>
                              {tx('Mode:', '模式：')} {authState?.mode}
                            </p>
                            <p>
                              {tx('Cookie strength:', 'Cookie 强度：')}
                              <span
                                className={
                                  authState?.cookieStrength?.level === 'strong'
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-yellow-700 dark:text-yellow-300'
                                }
                              >
                                {authState?.cookieStrength?.level || tx('unknown', '未知')}
                              </span>
                            </p>
                            {authState?.cookieStrength?.message ? (
                              <p className="text-text-muted dark:text-gray-400">{authState.cookieStrength.message}</p>
                            ) : null}
                            <p>
                              {tx('Credential:', '凭据：')} {authState?.maskedCredential || '****'}
                            </p>
                            <p>
                              {tx('Last validated at:', '最近校验时间：')}
                              {authState?.lastValidatedAt
                                ? new Date(authState.lastValidatedAt).toLocaleString()
                                : tx('N/A', '无')}
                            </p>
                            {authState?.lastError ? (
                              <p className="text-red-500 dark:text-red-400">
                                {tx('Last error:', '最近错误：')} {authState.lastError}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-text-muted dark:text-gray-400">
                            {tx('Not configured yet.', '尚未配置。')}
                          </p>
                        )}
                      </div>

                      <div className="rounded-md border border-border-strong bg-white/60 p-4 dark:border-white/20 dark:bg-black/20">
                        <p className="text-sm font-semibold text-text-main dark:text-white">
                          {tx('BBDown QR Login (Recommended)', 'BBDown 扫码登录（推荐）')}
                        </p>
                        <p className="mt-1 text-xs text-text-muted dark:text-gray-400">
                          {tx(
                            'Use Bilibili app to scan and login. Credential will be saved automatically after success.',
                            '使用 Bilibili App 扫码登录，成功后会自动保存凭据。',
                          )}
                        </p>

                        <div className="mt-3 space-y-1 text-xs text-text-muted dark:text-gray-400">
                          <p>
                            {tx('QR status:', '扫码状态：')}
                            <span className="ml-1 font-semibold text-text-main dark:text-white">
                              {qrState?.status || tx('idle', '空闲')}
                            </span>
                          </p>
                          <p>
                            {tx('Message:', '信息：')}
                            <span className="ml-1">{qrState?.message || tx('N/A', '无')}</span>
                          </p>
                          {qrState?.error ? (
                            <p className="text-red-500 dark:text-red-400">
                              {tx('Error:', '错误：')}
                              <span className="ml-1">{qrState.error}</span>
                            </p>
                          ) : null}
                        </div>

                        {qrMessage ? (
                          <p className="mt-2 text-sm text-text-main dark:text-white/80">{qrMessage}</p>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={startQrLogin}
                            disabled={qrBusy || qrState?.active}
                            className="rounded-lg bg-[#FB7299] px-4 py-2 text-sm font-semibold text-white hover:bg-[#f95c8c] disabled:opacity-50"
                          >
                            {qrBusy ? tx('Processing...', '处理中...') : tx('QR Login', '扫码登录')}
                          </button>
                          <button
                            onClick={cancelQrLogin}
                            disabled={qrBusy || !qrState?.active}
                            className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                          >
                            {tx('Cancel', '取消')}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-md border border-border-strong bg-white/60 p-4 dark:border-white/20 dark:bg-black/20">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-text-main dark:text-white">
                              {tx('Advanced Manual Login', '高级手动登录')}
                            </p>
                            <p className="mt-1 text-xs text-text-muted dark:text-gray-400">
                              {tx(
                                'If QR login fails, expand this section and paste SESSDATA or full Cookie manually.',
                                '若扫码登录失败，可展开后手动粘贴 SESSDATA 或完整 Cookie。',
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowAdvancedAuth((v) => !v)}
                            className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-text-main hover:border-accent/70 dark:border-white/20 dark:text-white"
                          >
                            {showAdvancedAuth ? tx('Hide Advanced', '收起高级') : tx('Show Advanced', '高级')}
                          </button>
                        </div>

                        {showAdvancedAuth ? (
                          <div className="mt-4 space-y-4">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-text-main dark:text-white/90">
                                {tx('Credential type', '凭据类型')}
                              </label>
                              <select
                                value={mode}
                                onChange={(e) => setMode(e.target.value as any)}
                                className="block w-full rounded-md border border-border-strong bg-white py-2 pl-3 pr-10 text-text-main focus:border-accent focus:outline-none dark:border-white/20 dark:bg-white/5 dark:text-white"
                              >
                                <option value="cookie">
                                  {tx('Full Cookie string (Recommended)', '完整 Cookie 字符串（推荐）')}
                                </option>
                                <option value="sessdata">{tx('SESSDATA only', '仅 SESSDATA')}</option>
                              </select>
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-text-main dark:text-white/90">
                                {mode === 'sessdata' ? 'SESSDATA' : tx('Cookie', 'Cookie')}
                              </label>
                              <textarea
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                rows={4}
                                placeholder={
                                  mode === 'sessdata'
                                    ? tx('Paste SESSDATA value', '粘贴 SESSDATA 值')
                                    : tx('Paste full cookie string', '粘贴完整 Cookie 字符串')
                                }
                                className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                              />
                              <p className="mt-2 text-xs text-text-muted dark:text-gray-400">
                                {tx(
                                  'Use this mode only when QR login is unavailable. Full Cookie is more stable than SESSDATA.',
                                  '仅在扫码不可用时使用该模式。完整 Cookie 比仅 SESSDATA 更稳定。',
                                )}
                              </p>
                            </div>

                            {message ? <p className="text-sm text-text-main dark:text-white/80">{message}</p> : null}

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={saveAuth}
                                disabled={saving}
                                className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
                              >
                                {saving ? tx('Saving...', '保存中...') : tx('Save', '保存')}
                              </button>
                              <button
                                onClick={validateAuth}
                                disabled={validating || loading || !authState?.configured}
                                className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-main hover:border-accent/70 disabled:opacity-50 dark:border-white/20 dark:text-white"
                              >
                                {validating ? tx('Validating...', '校验中...') : tx('Validate', '校验')}
                              </button>
                              <button
                                onClick={clearAuth}
                                disabled={loading || !authState?.configured}
                                className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                              >
                                {tx('Clear', '清除')}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-transparent dark:bg-white/5 dark:shadow-none">
                    <div className="mb-4">
                      <div className="flex items-center gap-2">
                        <img src="/assets/platform-logos/youtube.svg" alt="YouTube logo" className="h-5 w-5 shrink-0" />
                        <p className="text-lg font-bold leading-tight tracking-[-0.015em] text-text-main dark:text-white">
                          {tx('YouTube / yt-dlp Login', 'YouTube / yt-dlp 登录')}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-text-muted dark:text-gray-400">
                        {tx(
                          'Save your YouTube credential for restricted-video subtitle downloads.',
                          '保存 YouTube 凭据，用于受限视频字幕下载。',
                        )}
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-md border border-border-strong bg-white/60 p-3 text-sm dark:border-white/20 dark:bg-black/20">
                        {!ytAuthState ? (
                          <p className="text-text-muted dark:text-gray-400">
                            {tx('Loading status...', '加载状态中...')}
                          </p>
                        ) : ytAuthState?.configured ? (
                          <div className="space-y-1">
                            <p>
                              {tx('Status:', '状态：')}
                              <span
                                className={
                                  ytAuthState?.status === 'valid'
                                    ? 'text-green-600 dark:text-green-400'
                                    : ytAuthState?.status === 'invalid'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-yellow-600 dark:text-yellow-300'
                                }
                              >
                                {ytAuthState?.status || tx('unknown', '未知')}
                              </span>
                            </p>
                            <p>
                              {tx('Mode:', '模式：')} {ytAuthState?.mode}
                            </p>
                            <p>
                              {tx('Credential:', '凭据：')} {ytAuthState?.maskedCredential || '****'}
                            </p>
                            <p>
                              {tx('Last validated at:', '最近校验时间：')}
                              {ytAuthState?.lastValidatedAt
                                ? new Date(ytAuthState.lastValidatedAt).toLocaleString()
                                : tx('N/A', '无')}
                            </p>
                            {ytAuthState?.lastError ? (
                              <p className="text-red-500 dark:text-red-400">
                                {tx('Last error:', '最近错误：')} {ytAuthState.lastError}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-text-muted dark:text-gray-400">
                            {tx('Not configured yet.', '尚未配置。')}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-text-main dark:text-white/90">
                          {tx('Credential type', '凭据类型')}
                        </label>
                        <select
                          value={ytMode}
                          onChange={(e) => setYtMode(e.target.value as any)}
                          className="block w-full rounded-md border border-border-strong bg-white py-2 pl-3 pr-10 text-text-main focus:border-accent focus:outline-none dark:border-white/20 dark:bg-white/5 dark:text-white"
                        >
                          <option value="cookie">
                            {tx('Full Cookie string (Recommended)', '完整 Cookie 字符串（推荐）')}
                          </option>
                          <option value="cookies_txt">{tx('cookies.txt content', 'cookies.txt 内容')}</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-text-main dark:text-white/90">
                          {ytMode === 'cookie' ? tx('Cookie', 'Cookie') : 'cookies.txt'}
                        </label>
                        <textarea
                          value={ytValue}
                          onChange={(e) => setYtValue(e.target.value)}
                          rows={6}
                          placeholder={
                            ytMode === 'cookie'
                              ? tx('Paste full Cookie string', '粘贴完整 Cookie 字符串')
                              : tx(
                                  'Paste cookies.txt content (Netscape format)',
                                  '粘贴 cookies.txt 内容（Netscape 格式）',
                                )
                          }
                          className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                        />
                        <p className="mt-2 text-xs text-text-muted dark:text-gray-400">
                          {tx(
                            `If you see "Sign in to confirm you're not a bot", update your full YouTube Cookie or cookies.txt.`,
                            "如果提示“Sign in to confirm you're not a bot”，请更新完整 YouTube Cookie 或 cookies.txt。",
                          )}
                        </p>
                      </div>

                      {ytMessage ? <p className="text-sm text-text-main dark:text-white/80">{ytMessage}</p> : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={saveYouTubeAuth}
                          disabled={ytSaving}
                          className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
                        >
                          {ytSaving ? tx('Saving...', '保存中...') : tx('Save', '保存')}
                        </button>
                        <button
                          onClick={validateYouTubeAuth}
                          disabled={ytValidating || !ytAuthState?.configured}
                          className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-main hover:border-accent/70 disabled:opacity-50 dark:border-white/20 dark:text-white"
                        >
                          {ytValidating ? tx('Validating...', '校验中...') : tx('Validate', '校验')}
                        </button>
                        <button
                          onClick={clearYouTubeAuth}
                          disabled={!ytAuthState?.configured}
                          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                        >
                          {tx('Clear', '清除')}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-transparent dark:bg-white/5 dark:shadow-none">
                    <div className="mb-4">
                      <div className="flex items-center gap-2">
                        <img src="/assets/platform-logos/douyin.svg" alt="Douyin logo" className="h-5 w-5 shrink-0" />
                        <p className="text-lg font-bold leading-tight tracking-[-0.015em] text-text-main dark:text-white">
                          {tx('Douyin / yt-dlp Login', '抖音 / yt-dlp 登录')}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-text-muted dark:text-gray-400">
                        {tx(
                          'Save your Douyin credential for restricted-video subtitle downloads.',
                          '保存抖音凭据，用于受限视频字幕下载。',
                        )}
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-md border border-border-strong bg-white/60 p-3 text-sm dark:border-white/20 dark:bg-black/20">
                        {!dyAuthState ? (
                          <p className="text-text-muted dark:text-gray-400">
                            {tx('Loading status...', '加载状态中...')}
                          </p>
                        ) : dyAuthState?.configured ? (
                          <div className="space-y-1">
                            <p>
                              {tx('Status:', '状态：')}
                              <span
                                className={
                                  dyAuthState?.status === 'valid'
                                    ? 'text-green-600 dark:text-green-400'
                                    : dyAuthState?.status === 'invalid'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-yellow-600 dark:text-yellow-300'
                                }
                              >
                                {dyAuthState?.status || tx('unknown', '未知')}
                              </span>
                            </p>
                            <p>
                              {tx('Mode:', '模式：')} {dyAuthState?.mode}
                            </p>
                            <p>
                              {tx('Credential:', '凭据：')} {dyAuthState?.maskedCredential || '****'}
                            </p>
                            <p>
                              {tx('Last validated at:', '最近校验时间：')}
                              {dyAuthState?.lastValidatedAt
                                ? new Date(dyAuthState.lastValidatedAt).toLocaleString()
                                : tx('N/A', '无')}
                            </p>
                            {dyAuthState?.lastError ? (
                              <p className="text-red-500 dark:text-red-400">
                                {tx('Last error:', '最近错误：')} {dyAuthState.lastError}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-text-muted dark:text-gray-400">
                            {tx('Not configured yet.', '尚未配置。')}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-text-main dark:text-white/90">
                          {tx('Credential type', '凭据类型')}
                        </label>
                        <select
                          value={dyMode}
                          onChange={(e) => setDyMode(e.target.value as any)}
                          className="block w-full rounded-md border border-border-strong bg-white py-2 pl-3 pr-10 text-text-main focus:border-accent focus:outline-none dark:border-white/20 dark:bg-white/5 dark:text-white"
                        >
                          <option value="cookie">
                            {tx('Full Cookie string (Recommended)', '完整 Cookie 字符串（推荐）')}
                          </option>
                          <option value="cookies_txt">{tx('cookies.txt content', 'cookies.txt 内容')}</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-text-main dark:text-white/90">
                          {dyMode === 'cookie' ? tx('Cookie', 'Cookie') : 'cookies.txt'}
                        </label>
                        <textarea
                          value={dyValue}
                          onChange={(e) => setDyValue(e.target.value)}
                          rows={6}
                          placeholder={
                            dyMode === 'cookie'
                              ? tx('Paste full Cookie string', '粘贴完整 Cookie 字符串')
                              : tx(
                                  'Paste cookies.txt content (Netscape format)',
                                  '粘贴 cookies.txt 内容（Netscape 格式）',
                                )
                          }
                          className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                        />
                        <p className="mt-2 text-xs text-text-muted dark:text-gray-400">
                          {tx(
                            'If Douyin download asks for login, update your full Douyin Cookie or cookies.txt.',
                            '如果抖音下载要求登录，请更新完整抖音 Cookie 或 cookies.txt。',
                          )}
                        </p>
                      </div>

                      {dyMessage ? <p className="text-sm text-text-main dark:text-white/80">{dyMessage}</p> : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={saveDouyinAuth}
                          disabled={dySaving}
                          className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
                        >
                          {dySaving ? tx('Saving...', '保存中...') : tx('Save', '保存')}
                        </button>
                        <button
                          onClick={validateDouyinAuth}
                          disabled={dyValidating || !dyAuthState?.configured}
                          className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-main hover:border-accent/70 disabled:opacity-50 dark:border-white/20 dark:text-white"
                        >
                          {dyValidating ? tx('Validating...', '校验中...') : tx('Validate', '校验')}
                        </button>
                        <button
                          onClick={clearDouyinAuth}
                          disabled={!dyAuthState?.configured}
                          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                        >
                          {tx('Clear', '清除')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
        {showQrModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-sm rounded-xl border border-border-strong bg-white p-5 shadow-2xl dark:border-white/20 dark:bg-[#111827]">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-base font-bold text-text-main dark:text-white">
                  {tx('Scan with Bilibili App', '请用 Bilibili App 扫码')}
                </p>
                <button
                  type="button"
                  className="rounded p-1 text-text-muted hover:bg-black/5 hover:text-text-main dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                  onClick={() => {
                    setShowQrModal(false)
                    setShowQrSuccess(false)
                  }}
                >
                  ✕
                </button>
              </div>

              <div className="relative flex min-h-[220px] items-center justify-center rounded-lg border border-border-strong bg-slate-50 p-3 dark:border-white/20 dark:bg-black/30">
                {qrState?.qrImageDataUrl ? (
                  <img
                    src={qrState.qrImageDataUrl}
                    alt={tx('Bilibili QR code', 'Bilibili 二维码')}
                    className="h-52 w-52 rounded bg-white p-2"
                  />
                ) : (
                  <p className="text-sm text-text-muted dark:text-gray-300">
                    {tx('Generating QR code...', '二维码生成中...')}
                  </p>
                )}
                {showQrSuccess ? (
                  <div className="bg-white/65 dark:bg-black/35 absolute inset-0 flex items-center justify-center rounded-lg">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-[0_10px_28px_rgba(16,185,129,0.45)]">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-11 w-11 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 space-y-1 text-xs text-text-muted dark:text-gray-300">
                <p>
                  {tx('Status:', '状态：')}
                  <span className="ml-1 font-semibold text-text-main dark:text-white">
                    {qrState?.status || tx('idle', '空闲')}
                  </span>
                </p>
                <p>
                  {tx('Message:', '信息：')}
                  <span className="ml-1">{qrState?.message || tx('Waiting...', '等待中...')}</span>
                </p>
                {qrState?.error ? (
                  <p className="text-red-500 dark:text-red-400">
                    {tx('Error:', '错误：')}
                    <span className="ml-1">{qrState.error}</span>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

export default SettingsPage
