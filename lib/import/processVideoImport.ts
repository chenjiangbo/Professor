import { updateVideo, upsertVideoLocalization } from '~/lib/repo'
import { SourceType, VideoService } from '~/lib/types'
import { fetchSubtitleByBBDown } from '~/lib/subtitle/bbdown'
import { fetchSubtitleByYtDlp } from '~/lib/subtitle/ytdlp'
import { fetchBilibiliVideoMeta } from '~/lib/bilibili/fetchBilibiliVideoMeta'
import { fetchYouTubeVideoMeta } from '~/lib/youtube/preview'
import { generateVideoInterpretation } from '~/lib/openai/videoInterpretation'
import { translateTranscriptToLanguage } from '~/lib/openai/translate'
import { validateSubtitleQuality } from '~/lib/subtitle/quality'
import { normalizeInterpretationMode, type InterpretationMode } from '~/lib/interpretationMode'
import { parseRequiredAppLanguage } from '~/lib/i18n'
import {
  getBBDownAuthRecord,
  getDecryptedBBDownCookie,
  updateBBDownAuthValidation,
  validateBBDownAuthCookie,
} from '~/lib/bbdown/auth'
import { getDecryptedYouTubeAuth, getYouTubeAuthRecord, validateYouTubeAuthLocal } from '~/lib/youtube/auth'

export type ProcessVideoImportArgs = {
  userId: string
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
  contentLanguage?: 'zh-CN' | 'en-US'
}

export async function processVideoImport(args: ProcessVideoImportArgs) {
  const {
    userId,
    dbVideoId,
    sourceType,
    videoId,
    sourceUrl,
    pageNumber,
    interpretationMode,
    rawTitle,
    rawText,
    sourceMime,
    contentLanguage,
  } = args
  const targetLanguage = parseRequiredAppLanguage(contentLanguage)
  const syncVideoState = async (patch: Record<string, any>) => {
    await updateVideo(dbVideoId, patch)
    const localizationPatch = {
      transcript: Object.prototype.hasOwnProperty.call(patch, 'transcript') ? patch.transcript ?? null : undefined,
      summary: Object.prototype.hasOwnProperty.call(patch, 'summary') ? patch.summary ?? null : undefined,
      chapters: Object.prototype.hasOwnProperty.call(patch, 'chapters') ? patch.chapters ?? null : undefined,
      status: Object.prototype.hasOwnProperty.call(patch, 'status') ? patch.status ?? null : undefined,
      last_error: Object.prototype.hasOwnProperty.call(patch, 'last_error') ? patch.last_error ?? null : undefined,
    }
    await upsertVideoLocalization(dbVideoId, targetLanguage, localizationPatch)
  }

  try {
    await upsertVideoLocalization(dbVideoId, targetLanguage, { status: 'queued', last_error: null })

    if (sourceType === 'text' || sourceType === 'file') {
      const transcript = String(rawText || '').trim()
      const title = String(rawTitle || 'Imported content').trim()
      if (!transcript) {
        await syncVideoState({
          status: 'error',
          title,
          summary: 'Import failed: source text is empty.',
          last_error: 'Source text is empty.',
        })
        return
      }

      const mode = normalizeInterpretationMode(interpretationMode)

      await syncVideoState({
        status: mode === 'none' ? 'processing_extract' : 'processing_outline',
        title,
        transcript,
        source_mime: sourceMime || null,
        subtitle_source: 'direct-import',
        last_error: null,
      })

      if (mode === 'none') {
        await syncVideoState({
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
              await syncVideoState({ status: 'processing_explaining' })
            }
          },
          mode,
          language: targetLanguage,
        })
        summary = interpretation.summary
        chapters = JSON.stringify(interpretation.chapters)
      } catch (e: any) {
        const err = e?.message || 'Interpretation generation failed'
        await syncVideoState({
          status: 'error',
          title,
          transcript,
          summary: `Interpretation generation failed: ${err}`,
          last_error: err,
        })
        return
      }

      await syncVideoState({
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
      await syncVideoState({
        status: 'error',
        summary: `Import failed: unsupported source type "${sourceType}".`,
        last_error: `Unsupported source type "${sourceType}".`,
      })
      return
    }

    await syncVideoState({ status: 'processing_subtitle', last_error: null })

    let title = 'Untitled video'
    let transcript = ''
    let subtitleMeta: Record<string, any> = {}
    let subtitleError = ''

    if (sourceType === 'bilibili') {
      try {
        const meta = await fetchBilibiliVideoMeta(userId, String(videoId || ''))
        if (meta?.title) {
          title = meta.title
        }
      } catch (e: any) {
        console.error('Failed to fetch bilibili title metadata', e?.message || e)
      }
    } else if (sourceType === 'youtube') {
      try {
        const meta = await fetchYouTubeVideoMeta(userId, String(sourceUrl || ''))
        if (meta?.title) {
          title = meta.title
        }
      } catch (e: any) {
        console.error('Failed to fetch youtube title metadata', e?.message || e)
      }
    }

    try {
      if (sourceType === 'bilibili') {
        const bbdownSubtitle = await fetchSubtitleByBBDown(userId, String(sourceUrl || ''), pageNumber, targetLanguage)
        if (bbdownSubtitle?.text) {
          transcript = bbdownSubtitle.text
          subtitleMeta = {
            subtitle_language: bbdownSubtitle.language,
            subtitle_source: bbdownSubtitle.isAi ? 'ai' : 'human',
          }
        }
      } else if (sourceType === 'youtube') {
        const ytdlpSubtitle = await fetchSubtitleByYtDlp(userId, String(sourceUrl || ''), targetLanguage)
        if (ytdlpSubtitle?.text) {
          transcript = ytdlpSubtitle.text
          subtitleMeta = {
            subtitle_language: ytdlpSubtitle.language,
            subtitle_source: ytdlpSubtitle.isAi ? 'ai' : 'human',
          }
        }
      }

      if (!transcript && sourceType === 'bilibili') {
        subtitleError = 'Bilibili did not provide subtitle tracks, or BBDown did not output subtitle files.'
      }
      if (!transcript && sourceType === 'youtube') {
        subtitleError = 'YouTube did not provide usable subtitle tracks, or yt-dlp did not output subtitle files.'
      }
    } catch (e: any) {
      subtitleError = e?.message || (sourceType === 'bilibili' ? 'Unknown BBDown error' : 'Unknown yt-dlp error')
      console.error(`${sourceType} subtitle fetch failed`, subtitleError)
    }

    if (!transcript) {
      const authIssueHint =
        sourceType === 'bilibili' ? await getBBDownAuthIssueHint(userId) : await getYouTubeAuthIssueHint(userId)
      const resolvedSubtitleError = [subtitleError || 'No usable subtitles available.', authIssueHint]
        .filter(Boolean)
        .join(' ')
      await syncVideoState({
        title: title || 'Untitled video',
        status: 'error',
        subtitle_source: sourceType === 'bilibili' ? 'bbdown-only' : 'ytdlp-only',
        summary: `Subtitle download failed: ${resolvedSubtitleError}`,
        last_error: resolvedSubtitleError,
      })
      return
    }

    const subtitleLang =
      subtitleMeta.subtitle_language === 'zh' ? 'zh-CN' : subtitleMeta.subtitle_language === 'en' ? 'en-US' : null
    if (subtitleLang && subtitleLang !== targetLanguage) {
      try {
        transcript = await translateTranscriptToLanguage(title, transcript, targetLanguage)
        subtitleMeta = {
          ...subtitleMeta,
          subtitle_source: `translated-from-${subtitleLang}`,
          subtitle_language: targetLanguage === 'zh-CN' ? 'zh' : 'en',
        }
      } catch (e: any) {
        const reason = e?.message || 'Transcript translation failed'
        await syncVideoState({
          status: 'error',
          title,
          ...subtitleMeta,
          summary: `Subtitle translation failed: ${reason}`,
          last_error: reason,
        })
        return
      }
    }

    const quality = validateSubtitleQuality({ title, transcript })
    if (!quality.ok) {
      await syncVideoState({
        title,
        status: 'error',
        transcript,
        ...subtitleMeta,
        summary: `Subtitle quality validation failed: ${quality.reason}`,
        last_error: quality.reason,
      })
      return
    }

    await syncVideoState({
      status: 'processing_outline',
      title: title || 'Untitled video',
      transcript,
      ...subtitleMeta,
      last_error: null,
    })

    let summary = ''
    let chapters: string | null = null
    const mode = normalizeInterpretationMode(interpretationMode)
    if (mode === 'none') {
      await syncVideoState({
        status: 'ready',
        title: title || 'Untitled video',
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
      const interpretation = await generateVideoInterpretation(title || 'Untitled video', transcript, {
        onStage: async (stage) => {
          if (stage === 'explaining') {
            await syncVideoState({ status: 'processing_explaining' })
          }
        },
        mode,
        language: targetLanguage,
      })
      summary = interpretation.summary
      chapters = JSON.stringify(interpretation.chapters)
    } catch (e: any) {
      const outlineError = e?.message || 'Unknown outline generation error'
      console.error('video interpretation failed', outlineError)
      await syncVideoState({
        status: 'error',
        title: title || 'Untitled video',
        transcript,
        ...subtitleMeta,
        summary: `Outline generation failed: ${outlineError}`,
        last_error: outlineError,
      })
      return
    }

    await syncVideoState({
      status: 'ready',
      title: title || 'Untitled video',
      transcript,
      summary,
      chapters,
      interpretation_mode: mode,
      last_error: null,
    })
  } catch (e: any) {
    console.error('process video import failed', e.message)
    await syncVideoState({
      status: 'error',
      summary: `Import failed unexpectedly: ${e.message}`,
      last_error: e.message,
    })
  }
}

export function runVideoImportInBackground(args: ProcessVideoImportArgs) {
  setTimeout(() => {
    processVideoImport(args).catch((e) => {
      console.error('background import crashed', e)
    })
  }, 0)
}

async function getBBDownAuthIssueHint(userId: string): Promise<string> {
  try {
    const record = await getBBDownAuthRecord(userId)
    if (!record) {
      return 'No Bilibili credential is configured. Go to Settings and add a valid Bilibili cookie (SESSDATA or full cookie).'
    }

    const cookie = await getDecryptedBBDownCookie(userId)
    if (!cookie) {
      return 'Saved Bilibili credential could not be decrypted. Go to Settings and save it again.'
    }

    const validation = await validateBBDownAuthCookie(cookie)
    if (validation.valid) {
      await updateBBDownAuthValidation(userId, 'valid')
      return ''
    }

    await updateBBDownAuthValidation(userId, 'invalid', validation.message)
    return `Saved Bilibili credential is invalid (${validation.message}). Go to Settings and update it.`
  } catch (e: any) {
    return `Bilibili credential state is abnormal (${
      e?.message || 'unknown error'
    }). Go to Settings and validate it again.`
  }
}

async function getYouTubeAuthIssueHint(userId: string): Promise<string> {
  try {
    const record = await getYouTubeAuthRecord(userId)
    if (!record) {
      return 'No YouTube credential is configured. Go to Settings and add a valid YouTube cookie/cookies.txt.'
    }

    const auth = await getDecryptedYouTubeAuth(userId)
    if (!auth?.value) {
      return 'Saved YouTube credential could not be decrypted. Go to Settings and save it again.'
    }

    const validation = validateYouTubeAuthLocal(auth)
    if (validation.valid) return ''
    return `Saved YouTube credential is invalid (${validation.message}). Go to Settings and update it.`
  } catch (e: any) {
    return `YouTube credential state is abnormal (${
      e?.message || 'unknown error'
    }). Go to Settings and validate it again.`
  }
}
