import { VideoService } from '~/lib/types'
import { runYtDlpJson } from '~/lib/youtube/ytdlp'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { buildYouTubeAuthArgs } from '~/lib/youtube/auth'

export type YouTubePreviewItem = {
  externalId: string
  title: string
  platform: VideoService.YouTube
  sourceUrl: string
}

export type YouTubeExpandMode = 'current' | 'all'

export function isYouTubeUrl(inputUrl: string): boolean {
  try {
    const u = new URL(inputUrl)
    const host = u.hostname.toLowerCase()
    return host === 'youtu.be' || host.endsWith('youtube.com')
  } catch {
    return false
  }
}

export function normalizeYouTubeVideoId(inputUrl: string): string {
  try {
    const u = new URL(inputUrl)
    const host = u.hostname.toLowerCase()
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\/+/, '').trim()
      if (id) return id
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return v
      const m = u.pathname.match(/\/shorts\/([^/?]+)/)
      if (m?.[1]) return m[1]
      const e = u.pathname.match(/\/embed\/([^/?]+)/)
      if (e?.[1]) return e[1]
    }
  } catch {
    // ignore
  }
  return inputUrl
}

export async function fetchYouTubeVideoMeta(url: string): Promise<{ title: string; videoId: string }> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-preview-'))
  const authArgs = await buildYouTubeAuthArgs(tempDir)
  const data = await runYtDlpJson([...authArgs, '--no-playlist', url], tempDir)
  const videoId = String(data?.id || normalizeYouTubeVideoId(url)).trim()
  const title = String(data?.title || '未命名视频').trim() || '未命名视频'
  return { title, videoId }
}

export async function buildYouTubePreviewItems(
  inputUrl: string,
  options?: { expandMode?: YouTubeExpandMode },
): Promise<YouTubePreviewItem[]> {
  const expandMode = options?.expandMode || 'current'

  if (expandMode === 'all') {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-playlist-'))
    const authArgs = await buildYouTubeAuthArgs(tempDir)
    const data = await runYtDlpJson([...authArgs, '--flat-playlist', inputUrl], tempDir)
    const entries = Array.isArray(data?.entries) ? data.entries : []

    if (!entries.length) {
      const current = await fetchYouTubeVideoMeta(inputUrl)
      return [
        {
          externalId: `yt-${current.videoId}`,
          title: current.title,
          platform: VideoService.YouTube,
          sourceUrl: `https://www.youtube.com/watch?v=${current.videoId}`,
        },
      ]
    }

    return entries
      .map((entry: any) => {
        const id = String(entry?.id || '').trim()
        if (!id) return null
        const title = String(entry?.title || '').trim() || `YouTube 视频 ${id}`
        return {
          externalId: `yt-${id}`,
          title,
          platform: VideoService.YouTube as const,
          sourceUrl: `https://www.youtube.com/watch?v=${id}`,
        }
      })
      .filter(Boolean) as YouTubePreviewItem[]
  }

  const current = await fetchYouTubeVideoMeta(inputUrl)
  return [
    {
      externalId: `yt-${current.videoId}`,
      title: current.title,
      platform: VideoService.YouTube,
      sourceUrl: `https://www.youtube.com/watch?v=${current.videoId}`,
    },
  ]
}
