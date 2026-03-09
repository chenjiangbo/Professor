import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import Github from '~/components/GitHub'
import LanguageSwitcher from '~/components/LanguageSwitcher'
import { useAppLanguage } from '~/hooks/useAppLanguage'

type Plan = {
  name: string
  monthly: string
  yearly: string
  note: string
  features: string[]
  recommended?: boolean
}

type Copy = {
  navFeatures: string
  navPricing: string
  navWorkspace: string
  navMainSiteLabel: string
  navEnter: string
  badge: string
  title: string
  subtitle: string
  ctaPrimary: string
  ctaSecondary: string
  painTitle: string
  painItems: string[]
  solutionTitle: string
  solutionItems: string[]
  featureTitle: string
  featureCards: Array<{ title: string; desc: string; icon: string }>
  pricingTitle: string
  pricingSubtitle: string
  monthlyLabel: string
  yearlyLabel: string
  pricingCta: string
  pricingMockNote: string
}

const COPY: Record<'zh-CN' | 'en-US', Copy> = {
  'zh-CN': {
    navFeatures: '功能',
    navPricing: '定价',
    navWorkspace: '工作区',
    navMainSiteLabel: '返回官网',
    navEnter: '进入 Notebook',
    badge: 'AI 时代的学习操作系统',
    title: '长视频不是问题，低效学习才是',
    subtitle:
      'Professor 把大量冗长的视频和文档提炼成关键知识点，并进行深度解读，让你在更短时间掌握核心知识，极大提高学习效率，并提供 AI 解答，持续深化理解。项目开源，欢迎共建。',
    // Slogan line displayed under the headline for Chinese.
    ctaPrimary: '立即开始',
    ctaSecondary: '查看工作区',
    painTitle: '你可能也遇到过这些问题',
    painItems: [
      '视频内容很长，真正有效的信息却很分散。',
      '海量学习资料摆在面前，反而不知道从哪里开始。',
      '年轻人更习惯通过视频理解世界，但传统学习方法跟不上节奏。',
      'AI 时代需要“元学习”能力：更快提炼、更快验证、更快迁移。',
    ],
    solutionTitle: 'Professor 的解决思路',
    solutionItems: [
      '先提炼大纲，再逐章深度解读，压缩学习时间但不丢核心信息。',
      '把视频、文本、文档统一沉淀到一个知识工作区，便于复习与追问。',
      '在问答阶段结合资料与模型能力，帮助你从“看懂”走向“会用”。',
    ],
    featureTitle: '核心功能',
    featureCards: [
      { title: '视频解读', desc: '导入 B 站 / YouTube，自动获取字幕并生成结构化解读。', icon: 'smart_display' },
      { title: '深度问答', desc: '围绕当前资料持续追问，快速打通卡点与知识盲区。', icon: 'forum' },
      { title: '知识组织', desc: '每个 Notebook 形成独立知识资产，可沉淀、可检索、可复用。', icon: 'account_tree' },
    ],
    pricingTitle: '定价方案',
    pricingSubtitle: '先选适合你的学习节奏，后续可随时升级。',
    monthlyLabel: '按月',
    yearlyLabel: '按年（更优惠）',
    pricingCta: '立即开通',
    pricingMockNote: '点击“立即开通”进入支付页。',
  },
  'en-US': {
    navFeatures: 'Features',
    navPricing: 'Pricing',
    navWorkspace: 'Workspace',
    navMainSiteLabel: 'Back to main site',
    navEnter: 'Open Notebook',
    badge: 'Learning OS for the AI Era',
    title: 'Long videos are not the problem. Inefficient learning is.',
    subtitle:
      'Professor compresses long videos and documents into structured interpretation, so you grasp core knowledge faster and deepen through follow-up Q&A. It is open source and built in public.',
    ctaPrimary: 'Get Started',
    ctaSecondary: 'View Workspace',
    painTitle: 'Common learning bottlenecks',
    painItems: [
      'Videos are long, but high-value information is scattered.',
      'Massive learning resources can be overwhelming to even start.',
      'Younger learners prefer video-first learning, while old methods lag behind.',
      'The AI era requires meta-learning: faster extraction, validation, and transfer.',
    ],
    solutionTitle: 'How Professor solves it',
    solutionItems: [
      'Outline first, then chapter-level deep interpretation to save time without losing key information.',
      'Unify video, text, and files in one workspace for review and iterative questioning.',
      'In Q&A, combine source-grounded context with model reasoning to move from understanding to application.',
    ],
    featureTitle: 'Core Features',
    featureCards: [
      {
        title: 'Video Interpretation',
        desc: 'Import Bilibili / YouTube and generate structured interpretation from subtitles.',
        icon: 'smart_display',
      },
      {
        title: 'Deep Q&A',
        desc: 'Ask continuously on the current source and close understanding gaps quickly.',
        icon: 'forum',
      },
      {
        title: 'Knowledge Organization',
        desc: 'Each Notebook becomes a reusable, searchable knowledge asset.',
        icon: 'account_tree',
      },
    ],
    pricingTitle: 'Pricing',
    pricingSubtitle: 'Start with your pace and upgrade anytime.',
    monthlyLabel: 'Monthly',
    yearlyLabel: 'Yearly (save more)',
    pricingCta: 'Choose Plan',
    pricingMockNote: 'Click "Choose Plan" to continue to checkout.',
  },
}

const PLANS_ZH: Plan[] = [
  {
    name: 'Free',
    monthly: '¥0',
    yearly: '¥0',
    note: '免费体验',
    features: ['每月 10 个视频或文章解读', '标准问答', '基础功能可用'],
  },
  {
    name: 'Pro',
    monthly: '¥9.9',
    yearly: '¥99',
    note: '个人高频学习',
    features: ['每天 10 个视频或文章解读', '优先队列', '完整问答体验'],
    recommended: true,
  },
  {
    name: 'Premium',
    monthly: '¥29.9',
    yearly: '¥299',
    note: '不限量学习',
    features: ['视频或文章解读不限量', '最高优先级', '完整高级能力'],
  },
]

const PLANS_EN: Plan[] = [
  {
    name: 'Free',
    monthly: '¥0',
    yearly: '¥0',
    note: 'Free tier',
    features: ['10 video/article interpretations per month', 'Standard Q&A', 'Core features'],
  },
  {
    name: 'Pro',
    monthly: '¥9.9',
    yearly: '¥99',
    note: 'For active individuals',
    features: ['10 video/article interpretations per day', 'Priority queue', 'Full Q&A experience'],
    recommended: true,
  },
  {
    name: 'Premium',
    monthly: '¥29.9',
    yearly: '¥299',
    note: 'Unlimited learning',
    features: ['Unlimited video/article interpretations', 'Highest priority', 'Full advanced capabilities'],
  },
]

export default function Home() {
  const { language, setLanguage } = useAppLanguage()
  const isZh = language === 'zh-CN'
  const copy = useMemo(() => COPY[isZh ? 'zh-CN' : 'en-US'], [isZh])
  const plans = isZh ? PLANS_ZH : PLANS_EN
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [quoteVisible, setQuoteVisible] = useState(true)

  const rotatingQuotes = useMemo(
    () =>
      isZh
        ? [
            'B 站评论区有句名言：收藏从未停止，学习从未开始。使用 Professor，收藏即是学习的开始。',
            '学得快不如学得会，学得会不如学得能复用。',
          ]
        : [
            'A classic line from Bilibili comments: bookmarks never stop, learning never starts. With Professor, bookmarking becomes the start of learning.',
            'Fast learning is not enough. Transferable learning is the goal.',
          ],
    [isZh],
  )

  useEffect(() => {
    setQuoteIndex(0)
    setQuoteVisible(true)
    const timer = setInterval(() => {
      setQuoteVisible(false)
      window.setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % rotatingQuotes.length)
        setQuoteVisible(true)
      }, 260)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [rotatingQuotes])

  return (
    <>
      <Head>
        <title>Professor</title>
      </Head>
      <div className="min-h-screen bg-[#f6f9ff] text-slate-900">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex w-full items-center justify-between gap-6 px-6 py-3 sm:px-10">
            <a
              href="https://www.xipilabs.com"
              aria-label={copy.navMainSiteLabel}
              className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-900"
            >
              <img src="/xipi_log_notext.png" alt="XiPiLabs logo" className="h-5 w-5 object-contain" />
              <span className="tracking-[0.02em] text-emerald-700">XiPiLabs</span>
            </a>
            <div className="flex flex-1 justify-center">
              <div className="flex w-full max-w-7xl items-center justify-between gap-6">
                <div className="flex min-w-0 items-center gap-8">
                  <div className="flex shrink-0 items-center gap-3">
                    <img src="/logo.svg" alt="Professor logo" className="h-7 w-7" />
                    <span className="text-lg font-bold text-slate-900">Professor</span>
                  </div>
                  <nav className="hidden items-center gap-6 sm:flex">
                    <a
                      href="#features"
                      className="text-sm font-medium text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline"
                    >
                      {copy.navFeatures}
                    </a>
                    <a
                      href="#workspace"
                      className="text-sm font-medium text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline"
                    >
                      {copy.navWorkspace}
                    </a>
                    <a
                      href="#pricing"
                      className="text-sm font-medium text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline"
                    >
                      {copy.navPricing}
                    </a>
                  </nav>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href="https://github.com/chenjiangbo/Professor"
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="Open GitHub repository"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                  >
                    <Github width="18" height="18" />
                  </a>
                  <LanguageSwitcher language={language} onChange={setLanguage} />
                  <Link
                    href="/notebooks"
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    {copy.navEnter}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-6 pb-16 pt-10 sm:px-10">
          <section className="rounded-2xl border border-slate-200 bg-white px-6 py-10 shadow-[0_14px_36px_rgba(30,64,175,0.08)] sm:px-10">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
                {copy.badge}
              </div>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                {copy.title}
              </h1>
              {isZh ? (
                <p
                  className="mt-4 text-2xl font-black tracking-tight text-[#1f2a44] sm:text-3xl"
                  style={{ fontFamily: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif' }}
                >
                  AI 时代学习方法的革命
                </p>
              ) : null}
              <p className="mx-auto mt-5 max-w-3xl text-base text-slate-600 sm:text-lg">{copy.subtitle}</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/notebooks"
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700"
                >
                  {copy.ctaPrimary}
                </Link>
                <a
                  href="#workspace"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  {copy.ctaSecondary}
                </a>
              </div>
              <div className="mx-auto mt-4 min-h-[56px] max-w-3xl px-1 py-1 text-left">
                <p
                  className={`text-sm leading-relaxed text-slate-700 transition-all duration-500 ${
                    quoteVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
                  }`}
                >
                  <span className="material-symbols-outlined mr-1 inline align-[-2px] text-[16px] text-blue-700">
                    auto_stories
                  </span>
                  {rotatingQuotes[quoteIndex]}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold text-slate-900">{copy.painTitle}</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {copy.painItems.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-6">
              <h2 className="text-xl font-bold text-slate-900">{copy.solutionTitle}</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {copy.solutionItems.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="material-symbols-outlined mt-0.5 text-[16px] text-blue-700">check_circle</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="features" className="mt-12">
            <h2 className="text-2xl font-extrabold text-slate-900">{copy.featureTitle}</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {copy.featureCards.map((card) => (
                <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="material-symbols-outlined text-[24px] text-blue-700">{card.icon}</span>
                  <h3 className="mt-2 text-lg font-bold text-slate-900">{card.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{card.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="workspace" className="relative mt-12">
            <div className="mb-5">
              <h2 className="text-2xl font-extrabold text-slate-900">{isZh ? '工作区演示' : 'Workspace Demo'}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {isZh
                  ? '视频、解读、问答在同一工作流里闭环。'
                  : 'Video, interpretation, and Q&A in one closed learning loop.'}
              </p>
            </div>

            <div className="pointer-events-none absolute -left-4 top-20 z-10 hidden rounded-xl border border-slate-200 bg-white p-3 shadow-lg md:flex md:items-center md:gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 text-center leading-10 text-blue-700">
                <span className="material-symbols-outlined text-[18px]">neurology</span>
              </div>
              <div>
                <p className="text-xs text-slate-500">Active</p>
                <p className="text-sm font-bold text-slate-900">AI Mentorship</p>
              </div>
            </div>

            <div className="pointer-events-none absolute -right-4 bottom-16 z-10 hidden rounded-xl border border-slate-200 bg-white p-3 shadow-lg md:flex md:items-center md:gap-3">
              <div className="h-10 w-10 rounded-full bg-violet-100 text-center leading-10 text-violet-700">
                <span className="material-symbols-outlined text-[18px]">auto_awesome_motion</span>
              </div>
              <div>
                <p className="text-xs text-slate-500">Processing</p>
                <p className="text-sm font-bold text-slate-900">Multi-video Synthesis</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.12)]">
              <div className="grid md:grid-cols-5">
                <div className="border-b border-slate-200 p-5 md:col-span-2 md:border-b-0 md:border-r">
                  <div className="relative overflow-hidden rounded-xl bg-[#0a1a44]">
                    <div className="flex aspect-video items-center justify-center">
                      <button className="rounded-full border border-white/30 bg-white/20 p-4 text-white">
                        <span className="material-symbols-outlined text-[34px]">play_arrow</span>
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-3 right-3 h-1 rounded-full bg-white/25">
                      <div className="h-1 w-1/3 rounded-full bg-blue-500" />
                    </div>
                  </div>

                  <h3 className="mt-4 text-2xl font-bold text-slate-900">Introduction to Quantum Computing</h3>
                  <div className="mt-3 flex gap-2">
                    <span className="rounded-md bg-slate-100 px-3 py-1 text-sm text-slate-700">Physics</span>
                    <span className="rounded-md bg-slate-100 px-3 py-1 text-sm text-slate-700">Lecture 1</span>
                  </div>

                  <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-semibold text-blue-700">
                      <span className="material-symbols-outlined mr-1 inline text-[14px]">smart_toy</span>
                      AI Mentor
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {isZh
                        ? '我已解析这段视频。核心概念包括叠加态与纠缠。你想先看摘要，还是直接开始测验？'
                        : 'I have analyzed this video. Key concepts include superposition and entanglement. Start with a summary or jump to a quiz?'}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800">
                        {isZh ? '生成摘要' : 'Generate Summary'}
                      </button>
                      <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800">
                        {isZh ? '生成测验' : 'Create Quiz'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 md:col-span-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h3 className="text-4xl font-black text-slate-900 md:text-5xl">Deep Note: Quantum Basics</h3>
                    <span className="material-symbols-outlined text-slate-400">more_horiz</span>
                  </div>

                  <div className="mt-5 space-y-5">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-md bg-blue-100 px-2 py-1 text-sm font-medium text-blue-700">
                          12:04
                        </span>
                        <h4 className="text-3xl font-bold text-slate-900 md:text-4xl">Superposition Principle</h4>
                      </div>
                      <p className="mt-3 text-lg leading-relaxed text-slate-700">
                        Unlike classical bits that are either 0 or 1, a qubit can exist in a superposition of both
                        states simultaneously.
                      </p>
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-lg text-slate-700">
                        |ψ⟩ = α|0⟩ + β|1|
                        <br />
                        |α|² + |β|² = 1
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-md bg-blue-100 px-2 py-1 text-sm font-medium text-blue-700">
                          24:15
                        </span>
                        <h4 className="text-3xl font-bold text-slate-900 md:text-4xl">Quantum Entanglement</h4>
                      </div>
                      <p className="mt-3 text-lg leading-relaxed text-slate-700">
                        When qubits become entangled, the state of one qubit cannot be described independently of the
                        others.
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-6 text-lg text-slate-700">
                        <li>Enables quantum teleportation protocols</li>
                        <li>Crucial for quantum cryptography (QKD)</li>
                        <li>Basis for quantum error correction</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="pricing" className="mt-14">
            <div className="text-center">
              <h2 className="text-3xl font-black text-slate-900">{copy.pricingTitle}</h2>
              <p className="mt-2 text-slate-600">{copy.pricingSubtitle}</p>
            </div>
            <div className="mt-5 flex justify-center">
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
                <button
                  onClick={() => setBilling('monthly')}
                  className={`rounded-md px-4 py-1.5 text-sm font-semibold ${
                    billing === 'monthly' ? 'bg-slate-900 text-white' : 'text-slate-700'
                  }`}
                >
                  {copy.monthlyLabel}
                </button>
                <button
                  onClick={() => setBilling('yearly')}
                  className={`rounded-md px-4 py-1.5 text-sm font-semibold ${
                    billing === 'yearly' ? 'bg-slate-900 text-white' : 'text-slate-700'
                  }`}
                >
                  {copy.yearlyLabel}
                </button>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-xl border bg-white p-5 ${
                    plan.recommended ? 'border-blue-600 shadow-[0_12px_28px_rgba(37,99,235,0.2)]' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                    {plan.recommended ? (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{plan.note}</p>
                  <div className="mt-4 text-4xl font-black text-slate-900">
                    {billing === 'monthly' ? plan.monthly : plan.yearly}
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-slate-700">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/shop"
                    className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    {copy.pricingCta}
                  </Link>
                </div>
              ))}
            </div>
            {copy.pricingMockNote ? (
              <p className="mt-4 text-center text-xs text-slate-500">{copy.pricingMockNote}</p>
            ) : null}
          </section>
        </main>
      </div>
    </>
  )
}
