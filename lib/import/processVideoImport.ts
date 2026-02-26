import { updateVideo } from '~/lib/repo'
import { SourceType, VideoService } from '~/lib/types'
import { fetchSubtitleByBBDown } from '~/lib/subtitle/bbdown'
import { fetchBilibiliVideoMeta } from '~/lib/bilibili/fetchBilibiliVideoMeta'
import { generateVideoInterpretation } from '~/lib/openai/videoInterpretation'
import { validateSubtitleQuality } from '~/lib/subtitle/quality'
import { normalizeInterpretationMode, type InterpretationMode } from '~/lib/interpretationMode'

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
      const title = String(rawTitle || 'Imported source').trim()
      if (!transcript) {
        await updateVideo(dbVideoId, {
          status: 'error',
          title,
          summary: 'Import failed: empty source text',
          last_error: 'Empty source text',
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
        const err = e?.message || 'Interpretation generation failed'
        await updateVideo(dbVideoId, {
          status: 'error',
          title,
          transcript,
          summary: `Interpretation generation failed: ${err}`,
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

    await updateVideo(dbVideoId, { status: 'processing_subtitle', last_error: null })

    let title = 'Untitled video'
    let transcript = ''
    let subtitleMeta: Record<string, any> = {}
    let subtitleError = ''

    try {
      const meta = await fetchBilibiliVideoMeta(String(videoId || ''))
      if (meta?.title) {
        title = meta.title
      }
    } catch (e: any) {
      console.error('Failed to fetch bilibili title metadata', e?.message || e)
    }

    try {
      const bbdownSubtitle = await fetchSubtitleByBBDown(String(sourceUrl || ''), pageNumber)
      if (bbdownSubtitle?.text) {
        transcript = bbdownSubtitle.text
        subtitleMeta = {
          subtitle_language: bbdownSubtitle.language,
          subtitle_source: bbdownSubtitle.isAi ? 'ai' : 'human',
        }
      }
      if (!transcript) {
        subtitleError = 'BBDown did not return any subtitle text'
      }
    } catch (e: any) {
      subtitleError = e?.message || 'Unknown BBDown error'
      console.error('BBDown subtitle fetch failed', subtitleError)
    }

    if (!transcript) {
      await updateVideo(dbVideoId, {
        title: title || 'Untitled video',
        status: 'error',
        subtitle_source: 'bbdown-only',
        summary: `BBDown subtitle fetch failed: ${subtitleError || 'No subtitles available'}`,
        last_error: subtitleError || 'No subtitles available',
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
        summary: `Subtitle quality check failed: ${quality.reason}`,
        last_error: quality.reason,
      })
      return
    }

    await updateVideo(dbVideoId, {
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
      await updateVideo(dbVideoId, {
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
            await updateVideo(dbVideoId, { status: 'processing_explaining' })
          }
        },
        mode,
      })
      summary = interpretation.summary
      chapters = JSON.stringify(interpretation.chapters)
    } catch (e: any) {
      const outlineError = e?.message || 'Unknown outline error'
      console.error('video interpretation failed', outlineError)
      await updateVideo(dbVideoId, {
        status: 'error',
        title: title || 'Untitled video',
        transcript,
        ...subtitleMeta,
        summary: `Outline generation failed: ${outlineError}`,
        last_error: outlineError,
      })
      return
    }

    await updateVideo(dbVideoId, {
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
    await updateVideo(dbVideoId, { status: 'error', summary: `Import error: ${e.message}`, last_error: e.message })
  }
}

export function runVideoImportInBackground(args: ProcessVideoImportArgs) {
  setTimeout(() => {
    processVideoImport(args).catch((e) => {
      console.error('background import crashed', e)
    })
  }, 0)
}
