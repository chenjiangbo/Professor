import { VideoService } from '~/lib/types'

export type BilibiliPreviewItem = {
  externalId: string
  title: string
  platform: VideoService.Bilibili
  sourceUrl: string
  pageNumber?: string
}

export type BilibiliExpandMode = 'current' | 'all'

export function splitInputUrls(raw: string): string[] {
  const text = String(raw || '')
  const urls = text
    .split(/[\s,，;；]+/)
    .map((u) => u.trim())
    .filter(Boolean)

  const unique: string[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    if (!seen.has(u)) {
      seen.add(u)
      unique.push(u)
    }
  }
  return unique
}

export async function resolveBilibiliUrl(inputUrl: string): Promise<string> {
  if (!inputUrl.includes('b23.tv')) {
    return inputUrl
  }
  try {
    const res = await fetch(inputUrl, { redirect: 'follow' })
    return res.url || inputUrl
  } catch {
    return inputUrl
  }
}

export function isBilibiliUrl(inputUrl: string): boolean {
  try {
    const u = new URL(inputUrl)
    return /(^|\.)bilibili\.com$/.test(u.hostname) || /(^|\.)b23\.tv$/.test(u.hostname)
  } catch {
    return false
  }
}

export function normalizeBilibiliVideoId(originalUrl: string): string {
  try {
    const urlObj = new URL(originalUrl)
    const match = urlObj.pathname.match(/BV[0-9A-Za-z]+/)
    if (match) return match[0]
  } catch {
    // ignore
  }
  return originalUrl
}

export async function fetchBilibiliPages(bvid: string) {
  const api = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
  const res = await fetch(api)
  if (!res.ok) {
    throw new Error('获取 B 站视频信息失败')
  }

  const data = await res.json()
  const pages = data?.data?.pages || []
  if (pages.length > 0) {
    return pages.map((p: any) => ({
      title: p.part || `P${p.page}`,
      page: Number(p.page || 1),
      cid: p.cid || p.page,
    }))
  }

  // Fallback only when standard pages are unavailable.
  const episodes = data?.data?.ugc_season?.sections?.flatMap((s: any) => s?.episodes || [])?.filter(Boolean) || []
  return episodes.map((ep: any, idx: number) => ({
    title: ep.title || ep.arc?.title || `Episode ${idx + 1}`,
    page: idx + 1,
    cid: ep.cid || ep.id || idx + 1,
  }))
}

function selectPagesByMode(pages: any[], resolvedUrl: string, expandMode: BilibiliExpandMode): any[] {
  if (!pages.length) return pages
  if (expandMode === 'all') return pages

  const selectedPage = extractPageNumberFromUrl(resolvedUrl)
  if (!selectedPage) {
    return [pages[0]]
  }

  const matched = pages.find((p: any, idx: number) => {
    const pageNum = Number(p.page || p.page_id || p.id || idx + 1)
    return String(pageNum) === selectedPage
  })
  return matched ? [matched] : [pages[0]]
}

export async function buildBilibiliPreviewItems(
  inputUrl: string,
  options?: { expandMode?: BilibiliExpandMode },
): Promise<BilibiliPreviewItem[]> {
  const resolvedUrl = await resolveBilibiliUrl(inputUrl)
  const bvid = normalizeBilibiliVideoId(resolvedUrl)
  const pages = await fetchBilibiliPages(bvid)
  const pickedPages = selectPagesByMode(pages, resolvedUrl, options?.expandMode || 'current')

  if (!pickedPages?.length) {
    return [
      {
        externalId: bvid,
        title: 'Untitled video',
        platform: VideoService.Bilibili,
        sourceUrl: resolvedUrl,
      },
    ]
  }

  const base = resolvedUrl.split('?')[0]
  return pickedPages.map((p: any, idx: number) => {
    const pageNum = Number(p.page || p.page_id || p.id || idx + 1)
    const safePage = Number.isNaN(pageNum) ? idx + 1 : pageNum
    const cid = p.cid || p.id || idx

    return {
      externalId: `${bvid}-p${safePage}-c${cid}`,
      title: p.title || `P${safePage}`,
      platform: VideoService.Bilibili,
      sourceUrl: `${base}?p=${safePage}`,
      pageNumber: String(safePage),
    }
  })
}

export function extractPageNumberFromUrl(originalUrl: string): string | undefined {
  try {
    const urlObj = new URL(originalUrl)
    const p = urlObj.searchParams.get('p')
    if (!p) return undefined
    const num = Number(p)
    return Number.isNaN(num) ? undefined : String(num)
  } catch {
    return undefined
  }
}
