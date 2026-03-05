import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { VideoService } from '~/lib/types'
import { runYtDlpJson } from '~/lib/youtube/ytdlp'
import { buildDouyinAuthArgs } from '~/lib/douyin/auth'

export type DouyinPreviewItem = {
  externalId: string
  title: string
  platform: VideoService.Douyin
  sourceUrl: string
}

export type DouyinExpandMode = 'current' | 'all'

export function isDouyinUrl(inputUrl: string): boolean {
  try {
    const u = new URL(inputUrl)
    const host = u.hostname.toLowerCase()
    return host === 'v.douyin.com' || host.endsWith('douyin.com') || host.endsWith('iesdouyin.com')
  } catch {
    return false
  }
}

export function normalizeDouyinVideoId(inputUrl: string): string {
  try {
    const u = new URL(inputUrl)
    const host = u.hostname.toLowerCase()
    if (host === 'v.douyin.com') {
      return u.pathname.replace(/^\/+|\/+$/g, '') || inputUrl
    }
    const modalId = u.searchParams.get('modal_id')
    if (modalId && /^\d+$/.test(modalId)) return modalId
    const m = u.pathname.match(/\/video\/(\d+)/)
    if (m?.[1]) return m[1]
  } catch {
    // ignore
  }
  return inputUrl
}

export function normalizeDouyinVideoUrl(inputUrl: string): string {
  const id = normalizeDouyinVideoId(inputUrl)
  if (/^\d+$/.test(id)) {
    return `https://www.douyin.com/video/${id}`
  }
  return inputUrl
}

export async function fetchDouyinVideoMeta(userId: string, url: string): Promise<{ title: string; videoId: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-douyin-preview-'))
  const authArgs = await buildDouyinAuthArgs(userId, tempDir)
  const normalizedUrl = normalizeDouyinVideoUrl(url)
  let data: any
  try {
    data = await runYtDlpJson([...authArgs, '--no-playlist', normalizedUrl], tempDir)
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (/fresh cookies/i.test(msg)) {
      throw new Error(
        'Douyin requires fresh cookies. Please update Douyin auth in Settings with newly exported cookies.txt (recommended) or a fresh full cookie.',
      )
    }
    throw e
  }
  const videoId = String(data?.id || normalizeDouyinVideoId(normalizedUrl)).trim()
  const title = String(data?.title || 'Untitled video').trim() || 'Untitled video'
  return { title, videoId }
}

export async function buildDouyinPreviewItems(
  userId: string,
  inputUrl: string,
  _options?: { expandMode?: DouyinExpandMode },
): Promise<DouyinPreviewItem[]> {
  const normalizedUrl = normalizeDouyinVideoUrl(inputUrl)
  const current = await fetchDouyinVideoMeta(userId, normalizedUrl)
  return [
    {
      externalId: `dy-${current.videoId}`,
      title: current.title,
      platform: VideoService.Douyin,
      sourceUrl: normalizedUrl,
    },
  ]
}
