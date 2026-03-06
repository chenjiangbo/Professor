import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import QRCode from 'qrcode'
import LanguageSwitcher from '~/components/LanguageSwitcher'
import { ModeToggle } from '~/components/mode-toggle'
import { useAppLanguage } from '~/hooks/useAppLanguage'

type Copy = {
  navNotebooks: string
  navSettings: string
  heroBadge: string
  heroTitle: string
  heroSubtitle: string
  ctaPrimary: string
  ctaSecondary: string
  pricingTag: string
  pricingTitle: string
  pricingDesc: string
  pricingPrice: string
  pricingPeriod: string
  pricingCta: string
  pricingNote: string
  pricingFeatures: string[]
  workspaceTitle: string
  workspaceSubtitle: string
  aiMessageTitle: string
  aiMessageBody: string
  modalTitle: string
  modalBody: string
  modalClose: string
  paymentLoading: string
  paymentScanHint: string
  paymentOrderLabel: string
  paymentPaid: string
  paymentWaiting: string
  paymentExpired: string
  paymentRefresh: string
  paymentFailedPrefix: string
}

type PrecreateResponse = {
  order_id: string
  out_trade_no: string
  qr_code: string
  expire_at: string
}

type OrderStatusResponse = {
  order_id: string
  out_trade_no: string
  status: string
  paid_at: string | null
  expire_at: string | null
  subscription_status: string | null
}

const POLL_INTERVAL_MS = 3000
const DEFAULT_PLAN_ID = 'pro_monthly'

const COPY: Record<'zh-CN' | 'en-US', Copy> = {
  'zh-CN': {
    navNotebooks: '笔记本',
    navSettings: '设置',
    heroBadge: '高密度学习工作台',
    heroTitle: '把视频与文档，压缩成真正可学会的知识',
    heroSubtitle:
      'Professor 将长内容自动整理为结构化大纲与深度解读，并支持持续追问。你不再需要在低知识密度内容里耗费时间。',
    ctaPrimary: '开始使用 Professor',
    ctaSecondary: '查看产品演示',
    pricingTag: '会员计划',
    pricingTitle: 'Professor 月会员',
    pricingDesc: '面向高频学习者的持续解读与问答服务。',
    pricingPrice: '¥19',
    pricingPeriod: '/ 月',
    pricingCta: '立即开通',
    pricingNote: '扫码支付，支付成功后自动开通。',
    pricingFeatures: ['不限次数问答', '多源内容导入', '优先模型队列', '持续更新的学习工具'],
    workspaceTitle: '一个页面完成导入、解读、追问',
    workspaceSubtitle: '视频与文本统一进入你的知识工作区，形成可复习、可追溯、可延展的学习资产。',
    aiMessageTitle: 'Professor AI 导师',
    aiMessageBody: '我已完成解析。建议先读“学习总览”，再从第 2 章开始深入，它包含最关键的推导过程。',
    modalTitle: '支付宝扫码支付',
    modalBody: '请使用支付宝扫一扫完成支付。支付成功后，会员会自动开通。',
    modalClose: '关闭',
    paymentLoading: '正在生成支付二维码...',
    paymentScanHint: '请使用支付宝扫一扫',
    paymentOrderLabel: '订单号',
    paymentPaid: '支付成功，会员已开通。',
    paymentWaiting: '等待支付中...',
    paymentExpired: '二维码已过期，请重新生成。',
    paymentRefresh: '重新生成二维码',
    paymentFailedPrefix: '创建订单失败：',
  },
  'en-US': {
    navNotebooks: 'Notebooks',
    navSettings: 'Settings',
    heroBadge: 'High-Density Learning Workspace',
    heroTitle: 'Turn videos and docs into knowledge you can actually learn',
    heroSubtitle:
      'Professor converts long-form content into structured outlines and deep interpretation, then lets you keep asking. Spend less time on low-density content.',
    ctaPrimary: 'Start with Professor',
    ctaSecondary: 'Watch Product Demo',
    pricingTag: 'Membership',
    pricingTitle: 'Professor Monthly Plan',
    pricingDesc: 'For high-frequency learners who need persistent interpretation and Q&A.',
    pricingPrice: '¥19',
    pricingPeriod: '/ month',
    pricingCta: 'Subscribe Now',
    pricingNote: 'Scan with Alipay. Membership activates after payment.',
    pricingFeatures: [
      'Unlimited Q&A',
      'Multi-source import',
      'Priority model queue',
      'Continuously updated learning tools',
    ],
    workspaceTitle: 'Import, interpret, and ask in one place',
    workspaceSubtitle:
      'Videos and text flow into one workspace so your learning stays reviewable, traceable, and expandable.',
    aiMessageTitle: 'Professor AI Mentor',
    aiMessageBody:
      'Your interpretation is ready. Start from the overview, then go deep into chapter 2 for the core reasoning chain.',
    modalTitle: 'Alipay QR Payment',
    modalBody: 'Scan with the Alipay app to complete payment. Membership will activate automatically.',
    modalClose: 'Close',
    paymentLoading: 'Generating payment QR code...',
    paymentScanHint: 'Please scan with Alipay',
    paymentOrderLabel: 'Order',
    paymentPaid: 'Payment received. Membership is active.',
    paymentWaiting: 'Waiting for payment...',
    paymentExpired: 'QR code expired. Please regenerate.',
    paymentRefresh: 'Regenerate QR Code',
    paymentFailedPrefix: 'Failed to create order: ',
  },
}

function WorkspaceMockup({ copy }: { copy: Copy }) {
  return (
    <section className="mt-14 w-full max-w-6xl">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-text-main dark:text-white sm:text-2xl">{copy.workspaceTitle}</h2>
        <p className="mt-1 text-sm text-text-muted dark:text-slate-400 sm:text-base">{copy.workspaceSubtitle}</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-strong bg-card shadow-[0_20px_40px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#0f1629]">
        <div className="flex h-11 items-center gap-2 border-b border-border-strong bg-slate-50 px-4 dark:border-white/10 dark:bg-white/5">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <div className="dark:border-white/15 ml-3 rounded-md border border-border-strong bg-white px-3 py-1 text-xs text-text-muted dark:bg-black/20 dark:text-slate-400">
            professor.ai/workspace
          </div>
        </div>

        <div className="grid grid-cols-1 gap-0 md:grid-cols-5">
          <div className="border-b border-border-strong bg-white p-4 dark:border-white/10 dark:bg-[#0f1629] md:col-span-2 md:border-b-0 md:border-r">
            <div className="dark:to-blue-500/15 aspect-video rounded-lg bg-gradient-to-br from-sky-500/20 via-cyan-400/10 to-blue-500/20 p-4 dark:from-sky-500/25">
              <div className="flex h-full items-center justify-center rounded-md border border-dashed border-sky-400/40 text-sky-700 dark:text-sky-300">
                <span className="material-symbols-outlined mr-2 text-[22px]">play_circle</span>
                Bilibili / YouTube
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                <span className="material-symbols-outlined mr-1 inline text-[14px]">neurology</span>
                Outline
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 dark:bg-white/10 dark:text-slate-200">
                <span className="material-symbols-outlined mr-1 inline text-[14px]">library_books</span>
                Interpretation
              </span>
            </div>
          </div>

          <div className="bg-white p-4 dark:bg-[#121a30] md:col-span-3">
            <div className="flex items-center justify-between border-b border-border-strong pb-3 dark:border-white/10">
              <h3 className="text-base font-semibold text-text-main dark:text-white">
                <span className="material-symbols-outlined mr-2 inline text-[16px]">description</span>
                Learning Notes
              </h3>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-border-strong bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                <p className="text-sm font-medium text-text-main dark:text-slate-100">
                  1. Core argument and key assumptions
                </p>
                <p className="mt-1 text-sm text-text-muted dark:text-slate-400">
                  Build a concise map first, then expand chapter-by-chapter for depth without dropping details.
                </p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 dark:border-primary/40 dark:bg-primary/10">
                <p className="text-sm font-semibold text-primary">
                  <span className="material-symbols-outlined mr-1 inline text-[15px]">smart_toy</span>
                  {copy.aiMessageTitle}
                </p>
                <p className="mt-1 text-sm text-text-main dark:text-slate-200">{copy.aiMessageBody}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function ShopPage() {
  const router = useRouter()
  const { language, setLanguage } = useAppLanguage()
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [outTradeNo, setOutTradeNo] = useState<string | null>(null)
  const [orderStatus, setOrderStatus] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)
  const [expireAt, setExpireAt] = useState<string | null>(null)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)

  const isZh = language === 'zh-CN'
  const copy = useMemo(() => COPY[isZh ? 'zh-CN' : 'en-US'], [isZh])

  async function createPayment() {
    setCreatingOrder(true)
    setPaymentError(null)
    setPaid(false)
    setOrderStatus(null)
    setOrderId(null)
    setOutTradeNo(null)
    setExpireAt(null)
    setQrCodeDataUrl(null)

    try {
      const resp = await fetch('/api/billing/alipay/precreate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_id: DEFAULT_PLAN_ID }),
      })
      const payload = (await resp.json()) as PrecreateResponse | { error?: string }
      if (!resp.ok) {
        throw new Error((payload as { error?: string })?.error || 'Unknown error')
      }

      const created = payload as PrecreateResponse
      if (!created.order_id || !created.out_trade_no || !created.qr_code || !created.expire_at) {
        throw new Error('Precreate response is missing required fields')
      }

      const dataUrl = await QRCode.toDataURL(created.qr_code, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'M',
      })

      setOrderId(created.order_id)
      setOutTradeNo(created.out_trade_no)
      setOrderStatus('QR_SENT')
      setExpireAt(created.expire_at)
      setQrCodeDataUrl(dataUrl)
    } catch (error) {
      setPaymentError(`${copy.paymentFailedPrefix}${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setCreatingOrder(false)
    }
  }

  function openPaymentModal() {
    if (showPaymentModal || creatingOrder) return
    setShowPaymentModal(true)
    void createPayment()
  }

  function closePaymentModal() {
    const currentOrderId = orderId
    setShowPaymentModal(false)

    if (currentOrderId && !paid && orderStatus !== 'CLOSED' && orderStatus !== 'EXPIRED') {
      void fetch(`/api/billing/orders/${currentOrderId}/close`, {
        method: 'POST',
      }).catch((err) => {
        console.error('[shop] close order failed', err)
      })
    }
  }

  useEffect(() => {
    if (!showPaymentModal || !orderId || paid) return

    const timer = window.setInterval(async () => {
      try {
        const resp = await fetch(`/api/billing/orders/${orderId}`)
        const payload = (await resp.json()) as OrderStatusResponse | { error?: string }
        if (!resp.ok) {
          throw new Error((payload as { error?: string })?.error || 'Failed to fetch order status')
        }

        const statusPayload = payload as OrderStatusResponse
        setOrderStatus(statusPayload.status)

        if (statusPayload.status === 'PAID') {
          setPaid(true)
          window.clearInterval(timer)
          window.setTimeout(() => {
            void router.push('/notebooks')
          }, 600)
          return
        }

        if (statusPayload.status === 'CLOSED' || statusPayload.status === 'EXPIRED') {
          window.clearInterval(timer)
          return
        }

        if (statusPayload.expire_at && new Date(statusPayload.expire_at).getTime() <= Date.now()) {
          setOrderStatus('EXPIRED')
          window.clearInterval(timer)
        }
      } catch (error) {
        setPaymentError(error instanceof Error ? error.message : 'Failed to fetch order status')
        window.clearInterval(timer)
      }
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [showPaymentModal, orderId, paid, router])

  return (
    <>
      <Head>
        <title>Professor Hero</title>
      </Head>
      <div className="min-h-screen bg-surface text-text-main dark:bg-background-dark dark:text-white">
        <header className="dark:bg-background-dark/85 sticky top-0 z-30 border-b border-border-strong bg-surface/90 backdrop-blur dark:border-white/10">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3 sm:px-10">
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="Professor logo" className="h-7 w-7" />
              <span className="text-lg font-bold">Professor</span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="hidden text-sm text-text-muted hover:text-text-main dark:text-slate-300 dark:hover:text-white sm:inline"
              >
                {copy.navNotebooks}
              </Link>
              <Link
                href="/settings"
                className="hidden text-sm text-text-muted hover:text-text-main dark:text-slate-300 dark:hover:text-white sm:inline"
              >
                {copy.navSettings}
              </Link>
              <LanguageSwitcher language={language} onChange={setLanguage} />
              <ModeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-col items-center px-6 pb-16 pt-12 sm:px-10">
          <div className="max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
              <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
              {copy.heroBadge}
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-text-main dark:text-white sm:text-5xl lg:text-6xl">
              {copy.heroTitle}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-text-muted dark:text-slate-300 sm:text-lg">
              {copy.heroSubtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary/90"
              >
                {copy.ctaPrimary}
              </Link>
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-white px-6 text-sm font-bold text-text-main transition-colors hover:bg-slate-50 dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                onClick={openPaymentModal}
                disabled={showPaymentModal || creatingOrder}
              >
                <span className="material-symbols-outlined text-[18px]">play_circle</span>
                {copy.ctaSecondary}
              </button>
            </div>
          </div>

          <section className="mt-10 w-full max-w-md">
            <div className="rounded-2xl border border-border-strong bg-card p-6 shadow-[0_16px_36px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[#111b31]">
              <div className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {copy.pricingTag}
              </div>
              <h2 className="mt-3 text-2xl font-bold text-text-main dark:text-white">{copy.pricingTitle}</h2>
              <p className="mt-1 text-sm text-text-muted dark:text-slate-400">{copy.pricingDesc}</p>
              <div className="mt-5 flex items-end">
                <span className="text-4xl font-black text-text-main dark:text-white">{copy.pricingPrice}</span>
                <span className="mb-1 ml-2 text-sm text-text-muted dark:text-slate-400">{copy.pricingPeriod}</span>
              </div>
              <ul className="mt-5 space-y-2">
                {copy.pricingFeatures.map((item) => (
                  <li key={item} className="text-sm text-text-main dark:text-slate-200">
                    <span className="material-symbols-outlined mr-2 inline text-[16px] text-emerald-500">
                      check_circle
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={openPaymentModal}
                disabled={showPaymentModal || creatingOrder}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copy.pricingCta}
              </button>
              <p className="mt-2 text-center text-xs text-text-muted dark:text-slate-500">{copy.pricingNote}</p>
            </div>
          </section>

          <WorkspaceMockup copy={copy} />
        </main>

        {showPaymentModal && (
          <div className="bg-black/55 fixed inset-0 z-40 flex items-center justify-center px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-border-strong bg-card p-6 shadow-2xl dark:border-white/10 dark:bg-[#101827]">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-text-main dark:text-white">{copy.modalTitle}</h3>
                <button
                  onClick={closePaymentModal}
                  aria-label="Close"
                  className="rounded-md p-1 text-text-muted hover:bg-slate-100 hover:text-text-main dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <p className="mt-3 text-sm text-text-muted dark:text-slate-300">{copy.modalBody}</p>

              <div className="mt-5 rounded-lg border border-border-strong bg-white p-4 text-center dark:border-white/10 dark:bg-white/5">
                {creatingOrder && <p className="text-sm text-text-muted dark:text-slate-300">{copy.paymentLoading}</p>}

                {!creatingOrder && qrCodeDataUrl && (
                  <div className="space-y-3">
                    <img
                      src={qrCodeDataUrl}
                      alt="Alipay QR code"
                      className="mx-auto h-56 w-56 rounded-md border border-border-strong bg-white p-2"
                    />
                    <p className="text-sm font-medium text-text-main dark:text-white">{copy.paymentScanHint}</p>
                    {outTradeNo && (
                      <p className="text-xs text-text-muted dark:text-slate-400">
                        {copy.paymentOrderLabel}: {outTradeNo}
                      </p>
                    )}
                    {paid && <p className="text-sm font-semibold text-emerald-600">{copy.paymentPaid}</p>}
                    {!paid && orderStatus === 'EXPIRED' && (
                      <p className="text-sm font-semibold text-amber-600">{copy.paymentExpired}</p>
                    )}
                    {!paid && orderStatus === 'QR_SENT' && (
                      <p className="text-sm text-text-muted dark:text-slate-300">{copy.paymentWaiting}</p>
                    )}
                    {!paid && orderStatus === 'EXPIRED' && (
                      <button
                        disabled={creatingOrder}
                        onClick={() => void createPayment()}
                        className="mt-1 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {copy.paymentRefresh}
                      </button>
                    )}
                  </div>
                )}

                {paymentError && <p className="text-sm font-medium text-rose-600">{paymentError}</p>}
              </div>

              <button
                onClick={closePaymentModal}
                className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary/90"
              >
                {copy.modalClose}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
