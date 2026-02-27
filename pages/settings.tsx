import Head from 'next/head'
import { NextPage } from 'next'
import { useEffect, useState } from 'react'
import { ModeToggle } from '~/components/mode-toggle'

const SettingsPage: NextPage = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingInterpretationMode, setSavingInterpretationMode] = useState(false)
  const [validating, setValidating] = useState(false)
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'sessdata' | 'cookie'>('sessdata')
  const [value, setValue] = useState('')
  const [authState, setAuthState] = useState<any>(null)
  const [ytMode, setYtMode] = useState<'cookie' | 'cookies_txt'>('cookie')
  const [ytValue, setYtValue] = useState('')
  const [ytAuthState, setYtAuthState] = useState<any>(null)
  const [ytSaving, setYtSaving] = useState(false)
  const [ytValidating, setYtValidating] = useState(false)
  const [ytMessage, setYtMessage] = useState('')
  const [defaultInterpretationMode, setDefaultInterpretationMode] = useState<'concise' | 'detailed'>('concise')

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

  const loadInterpretationMode = async () => {
    try {
      const res = await fetch('/api/settings/interpretation-mode')
      const json = await res.json()
      if (json?.mode === 'detailed') {
        setDefaultInterpretationMode('detailed')
      } else {
        setDefaultInterpretationMode('concise')
      }
    } catch {
      setDefaultInterpretationMode('concise')
    }
  }

  const loadYouTubeAuthState = async () => {
    try {
      const res = await fetch('/api/settings/youtube-auth')
      const json = await res.json()
      setYtAuthState(json)
      setYtMode(json?.mode === 'cookies_txt' ? 'cookies_txt' : 'cookie')
    } catch {
      setYtAuthState({ configured: false })
    }
  }

  useEffect(() => {
    loadAuthState()
    loadYouTubeAuthState()
    loadInterpretationMode()
  }, [])

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
      setMessage('默认解读模式已保存。')
    } catch (e: any) {
      setMessage(e?.message || '保存默认解读模式失败')
    } finally {
      setSavingInterpretationMode(false)
    }
  }

  const saveAuth = async () => {
    if (!value.trim()) {
      setMessage('请先粘贴 SESSDATA 或完整 Cookie。')
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
        ? '保存成功，凭据校验通过。'
        : `已保存，但校验失败：${json?.validation?.message || '未知错误'}`
      const weakHint =
        json?.cookieStrength?.level === 'basic'
          ? ' 当前 Cookie 强度偏弱，建议使用完整 Cookie 以提升字幕下载稳定性。'
          : ''
      setMessage(base + weakHint)
      setValue('')
      await loadAuthState()
    } catch (e: any) {
      setMessage(e?.message || '保存登录凭据失败')
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
      const base = json?.validation?.valid ? '凭据有效。' : `凭据无效：${json?.validation?.message || ''}`
      const weakHint =
        json?.cookieStrength?.level === 'basic'
          ? ' 当前 Cookie 强度偏弱，建议使用完整 Cookie 以提升字幕下载稳定性。'
          : ''
      setMessage(base + weakHint)
      await loadAuthState()
    } catch (e: any) {
      setMessage(e?.message || '凭据校验失败')
    } finally {
      setValidating(false)
    }
  }

  const clearAuth = async () => {
    setMessage('')
    await fetch('/api/settings/bbdown-auth', { method: 'DELETE' })
    await loadAuthState()
    setValue('')
    setMessage('登录凭据已清除。')
  }

  const saveYouTubeAuth = async () => {
    if (!ytValue.trim()) {
      setYtMessage('请先粘贴 YouTube Cookie 或 cookies.txt 内容。')
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
        ? 'YouTube 凭据保存成功，格式校验通过。'
        : `YouTube 凭据已保存，但校验失败：${json?.validation?.message || '未知错误'}`
      setYtMessage(base)
      setYtValue('')
      await loadYouTubeAuthState()
    } catch (e: any) {
      setYtMessage(e?.message || '保存 YouTube 凭据失败')
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
        ? 'YouTube 凭据有效。'
        : `YouTube 凭据无效：${json?.validation?.message || ''}`
      setYtMessage(base)
      await loadYouTubeAuthState()
    } catch (e: any) {
      setYtMessage(e?.message || 'YouTube 凭据校验失败')
    } finally {
      setYtValidating(false)
    }
  }

  const clearYouTubeAuth = async () => {
    setYtMessage('')
    await fetch('/api/settings/youtube-auth', { method: 'DELETE' })
    await loadYouTubeAuthState()
    setYtValue('')
    setYtMessage('YouTube 凭据已清除。')
  }

  return (
    <>
      <Head>
        <title>Settings · Professor</title>
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
                      className="text-sm font-medium leading-normal text-text-main transition-colors hover:text-text-muted dark:text-white/80 dark:hover:text-white"
                      href="/"
                    >
                      Notebooks
                    </a>
                    <a className="text-sm font-bold leading-normal text-primary" href="/settings">
                      Settings
                    </a>
                  </div>
                  <div className="flex items-center gap-3">
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
                    Settings
                  </p>
                </div>
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                  如果你要导入 B 站或 YouTube 视频，请先配置对应平台的登录凭据（推荐完整 Cookie）。
                  <a className="ml-2 font-semibold underline" href="#bbdown-login">
                    跳转到配置区
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
                          Default interpretation mode
                        </p>
                        <p className="text-sm font-normal leading-normal text-text-muted dark:text-gray-400">
                          Choose how new video interpretations are generated by default.
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
                            <p className="text-sm font-medium leading-normal text-text-main dark:text-white">Concise</p>
                            <p className="text-sm font-normal leading-normal text-text-muted dark:text-gray-400">
                              Faster reading, higher compression, suitable for quick learning.
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
                              Detailed
                            </p>
                            <p className="text-sm font-normal leading-normal text-text-muted dark:text-gray-400">
                              Preserve more details and reasoning chain, suitable for deep study.
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
                            {savingInterpretationMode ? '保存中...' : '保存模式'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-transparent dark:bg-white/5 dark:shadow-none">
                    <div className="flex flex-col items-stretch justify-start">
                      <div className="mb-6 flex w-full flex-col items-stretch justify-center gap-2">
                        <p className="text-lg font-bold leading-tight tracking-[-0.015em] text-text-main dark:text-white">
                          AI Settings
                        </p>
                        <p className="text-sm font-normal leading-normal text-text-muted dark:text-gray-400">
                          Manage AI providers used for analysis and generation.
                        </p>
                      </div>
                      <div className="flex flex-col gap-6">
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium text-text-main dark:text-white/90"
                            htmlFor="ai-provider"
                          >
                            Provider
                          </label>
                          <select
                            id="ai-provider"
                            name="ai-provider"
                            className="block w-full rounded-md border border-border-strong bg-white py-2 pl-3 pr-10 text-text-main focus:border-accent focus:outline-none focus:ring-accent dark:border-white/20 dark:bg-white/5 dark:text-white dark:focus:border-primary dark:focus:ring-primary sm:text-sm"
                            defaultValue="OpenAI"
                          >
                            <option>OpenAI</option>
                            <option>Anthropic</option>
                            <option>Google Gemini</option>
                          </select>
                        </div>
                        <div>
                          <label
                            className="mb-2 block text-sm font-medium text-text-main dark:text-white/90"
                            htmlFor="api-key"
                          >
                            API Key
                          </label>
                          <div className="relative">
                            <input
                              id="api-key"
                              name="api-key"
                              type="password"
                              placeholder="Enter your API key"
                              className="block w-full rounded-md border border-border-strong bg-white pr-10 text-text-main placeholder-text-muted focus:border-accent focus:ring-accent dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-gray-500 dark:focus:border-primary dark:focus:ring-primary sm:text-sm"
                            />
                            <button
                              type="button"
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-main dark:text-gray-400 dark:hover:text-white"
                            >
                              <span className="material-symbols-outlined text-xl">visibility</span>
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-end pt-2">
                          <button className="flex h-10 min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-success px-6 text-sm font-medium leading-normal text-white transition-colors hover:bg-success/90 focus:outline-none focus:ring-2 focus:ring-success/50 focus:ring-offset-2 focus:ring-offset-surface dark:bg-primary dark:hover:bg-primary/90 dark:focus:ring-primary/50 dark:focus:ring-offset-background-dark">
                            <span className="truncate">Save changes</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-transparent dark:bg-white/5 dark:shadow-none">
                    <div className="mb-4">
                      <p className="text-lg font-bold leading-tight tracking-[-0.015em] text-text-main dark:text-white">
                        Bilibili / BBDown Login
                      </p>
                      <p className="mt-1 text-sm text-text-muted dark:text-gray-400">
                        Save your own Bilibili credential for stable subtitle downloading via BBDown.
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-md border border-border-strong bg-white/60 p-3 text-sm dark:border-white/20 dark:bg-black/20">
                        {loading ? (
                          <p className="text-text-muted dark:text-gray-400">加载状态中...</p>
                        ) : authState?.configured ? (
                          <div className="space-y-1">
                            <p>
                              状态：
                              <span
                                className={
                                  authState?.status === 'valid'
                                    ? 'text-green-600 dark:text-green-400'
                                    : authState?.status === 'invalid'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-yellow-600 dark:text-yellow-300'
                                }
                              >
                                {authState?.status || 'unknown'}
                              </span>
                            </p>
                            <p>模式：{authState?.mode}</p>
                            <p>
                              Cookie 强度：
                              <span
                                className={
                                  authState?.cookieStrength?.level === 'strong'
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-yellow-700 dark:text-yellow-300'
                                }
                              >
                                {authState?.cookieStrength?.level || 'unknown'}
                              </span>
                            </p>
                            {authState?.cookieStrength?.message ? (
                              <p className="text-text-muted dark:text-gray-400">{authState.cookieStrength.message}</p>
                            ) : null}
                            <p>凭据：{authState?.maskedCredential || '****'}</p>
                            <p>
                              最近校验时间：
                              {authState?.lastValidatedAt
                                ? new Date(authState.lastValidatedAt).toLocaleString()
                                : '暂无'}
                            </p>
                            {authState?.lastError ? (
                              <p className="text-red-500 dark:text-red-400">最近错误：{authState.lastError}</p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-text-muted dark:text-gray-400">尚未配置。</p>
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-text-main dark:text-white/90">
                          Credential type
                        </label>
                        <select
                          value={mode}
                          onChange={(e) => setMode(e.target.value as any)}
                          className="block w-full rounded-md border border-border-strong bg-white py-2 pl-3 pr-10 text-text-main focus:border-accent focus:outline-none dark:border-white/20 dark:bg-white/5 dark:text-white"
                        >
                          <option value="cookie">Full Cookie string (Recommended)</option>
                          <option value="sessdata">SESSDATA only</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-text-main dark:text-white/90">
                          {mode === 'sessdata' ? 'SESSDATA' : 'Cookie'}
                        </label>
                        <textarea
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          rows={4}
                          placeholder={mode === 'sessdata' ? 'Paste SESSDATA value' : 'Paste full cookie string'}
                          className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                        />
                        <p className="mt-2 text-xs text-text-muted dark:text-gray-400">
                          推荐直接粘贴浏览器请求头中的完整 <code>Cookie:</code> 值。仅使用 SESSDATA
                          在部分视频（合集/分组/权限差异）下可能无法拿到字幕。
                        </p>
                      </div>

                      {message ? <p className="text-sm text-text-main dark:text-white/80">{message}</p> : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={saveAuth}
                          disabled={saving}
                          className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
                        >
                          {saving ? '保存中...' : '保存'}
                        </button>
                        <button
                          onClick={validateAuth}
                          disabled={validating || loading || !authState?.configured}
                          className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-main hover:border-accent/70 disabled:opacity-50 dark:border-white/20 dark:text-white"
                        >
                          {validating ? '校验中...' : '校验'}
                        </button>
                        <button
                          onClick={clearAuth}
                          disabled={loading || !authState?.configured}
                          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                        >
                          清除
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border-strong bg-card p-6 shadow-[0_10px_30px_rgba(12,18,38,0.05)] dark:border-transparent dark:bg-white/5 dark:shadow-none">
                    <div className="mb-4">
                      <p className="text-lg font-bold leading-tight tracking-[-0.015em] text-text-main dark:text-white">
                        YouTube / yt-dlp Login
                      </p>
                      <p className="mt-1 text-sm text-text-muted dark:text-gray-400">
                        保存你的 YouTube 登录凭据，用于受限视频字幕下载。
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-md border border-border-strong bg-white/60 p-3 text-sm dark:border-white/20 dark:bg-black/20">
                        {!ytAuthState ? (
                          <p className="text-text-muted dark:text-gray-400">加载状态中...</p>
                        ) : ytAuthState?.configured ? (
                          <div className="space-y-1">
                            <p>
                              状态：
                              <span
                                className={
                                  ytAuthState?.status === 'valid'
                                    ? 'text-green-600 dark:text-green-400'
                                    : ytAuthState?.status === 'invalid'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-yellow-600 dark:text-yellow-300'
                                }
                              >
                                {ytAuthState?.status || 'unknown'}
                              </span>
                            </p>
                            <p>模式：{ytAuthState?.mode}</p>
                            <p>凭据：{ytAuthState?.maskedCredential || '****'}</p>
                            <p>
                              最近校验时间：
                              {ytAuthState?.lastValidatedAt
                                ? new Date(ytAuthState.lastValidatedAt).toLocaleString()
                                : '暂无'}
                            </p>
                            {ytAuthState?.lastError ? (
                              <p className="text-red-500 dark:text-red-400">最近错误：{ytAuthState.lastError}</p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-text-muted dark:text-gray-400">尚未配置。</p>
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-text-main dark:text-white/90">
                          Credential type
                        </label>
                        <select
                          value={ytMode}
                          onChange={(e) => setYtMode(e.target.value as any)}
                          className="block w-full rounded-md border border-border-strong bg-white py-2 pl-3 pr-10 text-text-main focus:border-accent focus:outline-none dark:border-white/20 dark:bg-white/5 dark:text-white"
                        >
                          <option value="cookie">Full Cookie string (Recommended)</option>
                          <option value="cookies_txt">cookies.txt content</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-text-main dark:text-white/90">
                          {ytMode === 'cookie' ? 'Cookie' : 'cookies.txt'}
                        </label>
                        <textarea
                          value={ytValue}
                          onChange={(e) => setYtValue(e.target.value)}
                          rows={6}
                          placeholder={
                            ytMode === 'cookie'
                              ? '粘贴完整 Cookie 字符串'
                              : '粘贴 cookies.txt 文件内容（Netscape 格式）'
                          }
                          className="w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-accent focus:outline-none dark:border-white/20 dark:bg-black/20 dark:text-white dark:placeholder:text-white/50"
                        />
                        <p className="mt-2 text-xs text-text-muted dark:text-gray-400">
                          若出现 “Sign in to confirm you’re not a bot”，请更新 YouTube 完整 Cookie 或 cookies.txt。
                        </p>
                      </div>

                      {ytMessage ? <p className="text-sm text-text-main dark:text-white/80">{ytMessage}</p> : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={saveYouTubeAuth}
                          disabled={ytSaving}
                          className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:opacity-50 dark:bg-primary dark:hover:bg-primary/90"
                        >
                          {ytSaving ? '保存中...' : '保存'}
                        </button>
                        <button
                          onClick={validateYouTubeAuth}
                          disabled={ytValidating || !ytAuthState?.configured}
                          className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-main hover:border-accent/70 disabled:opacity-50 dark:border-white/20 dark:text-white"
                        >
                          {ytValidating ? '校验中...' : '校验'}
                        </button>
                        <button
                          onClick={clearYouTubeAuth}
                          disabled={!ytAuthState?.configured}
                          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
                        >
                          清除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default SettingsPage
