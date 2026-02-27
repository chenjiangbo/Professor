import { updateVideo } from '~/lib/repo'
import { SourceType, VideoService } from '~/lib/types'
import { fetchSubtitleByBBDown } from '~/lib/subtitle/bbdown'
import { fetchSubtitleByYtDlp } from '~/lib/subtitle/ytdlp'
import { fetchBilibiliVideoMeta } from '~/lib/bilibili/fetchBilibiliVideoMeta'
import { fetchYouTubeVideoMeta } from '~/lib/youtube/preview'
import { generateVideoInterpretation } from '~/lib/openai/videoInterpretation'
import { validateSubtitleQuality } from '~/lib/subtitle/quality'
import { normalizeInterpretationMode, type InterpretationMode } from '~/lib/interpretationMode'
import {
  getBBDownAuthRecord,
  getDecryptedBBDownCookie,
  updateBBDownAuthValidation,
  validateBBDownAuthCookie,
} from '~/lib/bbdown/auth'

export type ProcessVideoImportArgs = {
  dbVideoId: string
  sourceType: SourceType
  videoId?: string
  sourceUrl?: string
  service?: VideoService
  rawTitle?: string
  rawText?: string
  sourceMime?: string
  generationProfile?: 'full_interpretation' | 'summary_only' | 'import_only'
  pageNumber?: string
  detailLevel?: number
  showEmoji?: boolean
  outlineLevel?: number
  sentenceNumber?: number
  outputLanguage?: string
  interpretationMode?: InterpretationMode
}

export async function processVideoImport(args: ProcessVideoImportArgs) {
  const { dbVideoId, sourceType, videoId, sourceUrl, pageNumber, interpretationMode, rawTitle, rawText, sourceMime } =
    args

  try {
    if (sourceType === 'text' || sourceType === 'file') {
      const transcript = String(rawText || '').trim()
      const title = String(rawTitle || '导入内容').trim()
      if (!transcript) {
        await updateVideo(dbVideoId, {
          status: 'error',
          title,
          summary: '导入失败：原文内容为空',
          last_error: '原文内容为空',
        })
        return
      }

      const mode = normalizeInterpretationMode(interpretationMode)

      await updateVideo(dbVideoId, {
        status: mode === 'none' ? 'processing_extract' : 'processing_outline',
        title,
        transcript,
        source_mime: sourceMime || null,
        subtitle_source: 'direct-import',
        last_error: null,
      })

      if (mode === 'none') {
        await updateVideo(dbVideoId, {
          status: 'ready',
          title,
          transcript,
          summary: '',
          chapters: null,
          interpretation_mode: mode,
          last_error: null,
        })
        return
      }

      let summary = ''
      let chapters: string | null = null
      try {
        const interpretation = await generateVideoInterpretation(title, transcript, {
          onStage: async (stage) => {
            if (stage === 'explaining') {
              await updateVideo(dbVideoId, { status: 'processing_explaining' })
            }
          },
          mode,
        })
        summary = interpretation.summary
        chapters = JSON.stringify(interpretation.chapters)
      } catch (e: any) {
        const err = e?.message || '解读生成失败'
        await updateVideo(dbVideoId, {
          status: 'error',
          title,
          transcript,
          summary: `解读生成失败：${err}`,
          last_error: err,
        })
        return
      }

      await updateVideo(dbVideoId, {
        status: 'ready',
        title,
        transcript,
        summary,
        chapters,
        interpretation_mode: mode,
        last_error: null,
      })
      return
    }

    if (sourceType !== 'bilibili' && sourceType !== 'youtube') {
      await updateVideo(dbVideoId, {
        status: 'error',
        summary: `导入失败：不支持的资源类型 ${sourceType}`,
        last_error: `不支持的资源类型 ${sourceType}`,
      })
      return
    }

    await updateVideo(dbVideoId, { status: 'processing_subtitle', last_error: null })

    let title = '未命名视频'
    let transcript = ''
    let subtitleMeta: Record<string, any> = {}
    let subtitleError = ''

    if (sourceType === 'bilibili') {
      try {
        const meta = await fetchBilibiliVideoMeta(String(videoId || ''))
        if (meta?.title) {
          title = meta.title
        }
      } catch (e: any) {
        console.error('Failed to fetch bilibili title metadata', e?.message || e)
      }
    } else if (sourceType === 'youtube') {
      try {
        const meta = await fetchYouTubeVideoMeta(String(sourceUrl || ''))
        if (meta?.title) {
          title = meta.title
        }
      } catch (e: any) {
        console.error('Failed to fetch youtube title metadata', e?.message || e)
      }
    }

    try {
      if (sourceType === 'bilibili') {
        const bbdownSubtitle = await fetchSubtitleByBBDown(String(sourceUrl || ''), pageNumber)
        if (bbdownSubtitle?.text) {
          transcript = bbdownSubtitle.text
          subtitleMeta = {
            subtitle_language: bbdownSubtitle.language,
            subtitle_source: bbdownSubtitle.isAi ? 'ai' : 'human',
          }
        }
      } else if (sourceType === 'youtube') {
        const ytdlpSubtitle = await fetchSubtitleByYtDlp(String(sourceUrl || ''))
        if (ytdlpSubtitle?.text) {
          transcript = ytdlpSubtitle.text
          subtitleMeta = {
            subtitle_language: ytdlpSubtitle.language,
            subtitle_source: ytdlpSubtitle.isAi ? 'ai' : 'human',
          }
        }
      }

      if (!transcript && sourceType === 'bilibili') {
        subtitleError = 'B 站未返回字幕轨道，或 BBDown 未产出字幕文件'
      }
      if (!transcript && sourceType === 'youtube') {
        subtitleError = 'YouTube 未提供可用字幕轨道，或 yt-dlp 未产出字幕文件'
      }
    } catch (e: any) {
      subtitleError = e?.message || (sourceType === 'bilibili' ? 'BBDown 未知错误' : 'yt-dlp 未知错误')
      console.error(`${sourceType} subtitle fetch failed`, subtitleError)
    }

    if (!transcript) {
      const authIssueHint = sourceType === 'bilibili' ? await getBBDownAuthIssueHint() : ''
      const resolvedSubtitleError = [subtitleError || '无可用字幕', authIssueHint].filter(Boolean).join('；')
      await updateVideo(dbVideoId, {
        title: title || '未命名视频',
        status: 'error',
        subtitle_source: sourceType === 'bilibili' ? 'bbdown-only' : 'ytdlp-only',
        summary: `字幕下载失败：${resolvedSubtitleError}`,
        last_error: resolvedSubtitleError,
      })
      return
    }

    const quality = validateSubtitleQuality({ title, transcript })
    if (!quality.ok) {
      await updateVideo(dbVideoId, {
        title,
        status: 'error',
        transcript,
        ...subtitleMeta,
        summary: `字幕质量校验失败：${quality.reason}`,
        last_error: quality.reason,
      })
      return
    }

    await updateVideo(dbVideoId, {
      status: 'processing_outline',
      title: title || '未命名视频',
      transcript,
      ...subtitleMeta,
      last_error: null,
    })

    let summary = ''
    let chapters: string | null = null
    const mode = normalizeInterpretationMode(interpretationMode)
    if (mode === 'none') {
      await updateVideo(dbVideoId, {
        status: 'ready',
        title: title || '未命名视频',
        transcript,
        summary: '',
        chapters: null,
        interpretation_mode: mode,
        ...subtitleMeta,
        last_error: null,
      })
      return
    }
    try {
      const interpretation = await generateVideoInterpretation(title || '未命名视频', transcript, {
        onStage: async (stage) => {
          if (stage === 'explaining') {
            await updateVideo(dbVideoId, { status: 'processing_explaining' })
          }
        },
        mode,
      })
      summary = interpretation.summary
      chapters = JSON.stringify(interpretation.chapters)
    } catch (e: any) {
      const outlineError = e?.message || '大纲生成未知错误'
      console.error('video interpretation failed', outlineError)
      await updateVideo(dbVideoId, {
        status: 'error',
        title: title || '未命名视频',
        transcript,
        ...subtitleMeta,
        summary: `大纲生成失败：${outlineError}`,
        last_error: outlineError,
      })
      return
    }

    await updateVideo(dbVideoId, {
      status: 'ready',
      title: title || '未命名视频',
      transcript,
      summary,
      chapters,
      interpretation_mode: mode,
      last_error: null,
    })
  } catch (e: any) {
    console.error('process video import failed', e.message)
    await updateVideo(dbVideoId, { status: 'error', summary: `导入异常：${e.message}`, last_error: e.message })
  }
}

export function runVideoImportInBackground(args: ProcessVideoImportArgs) {
  setTimeout(() => {
    processVideoImport(args).catch((e) => {
      console.error('background import crashed', e)
    })
  }, 0)
}

async function getBBDownAuthIssueHint(): Promise<string> {
  try {
    const record = await getBBDownAuthRecord()
    if (!record) return ''

    const cookie = await getDecryptedBBDownCookie()
    if (!cookie) {
      return '检测到已保存的 BBDown 登录凭据读取失败，请到 Settings 重新保存凭据'
    }

    const validation = await validateBBDownAuthCookie(cookie)
    if (validation.valid) {
      await updateBBDownAuthValidation('valid')
      return ''
    }

    await updateBBDownAuthValidation('invalid', validation.message)
    return `检测到已保存的 BBDown 登录凭据已失效（${validation.message}），请到 Settings 更新`
  } catch (e: any) {
    return `检测到已保存的 BBDown 登录凭据状态异常（${e?.message || 'unknown error'}），请到 Settings 重新验证`
  }
}
