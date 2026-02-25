import { updateVideo } from '~/lib/repo'
import { VideoService } from '~/lib/types'
import { fetchSubtitleByBBDown } from '~/lib/subtitle/bbdown'
import { fetchBilibiliVideoMeta } from '~/lib/bilibili/fetchBilibiliVideoMeta'
import { generateVideoInterpretation } from '~/lib/openai/videoInterpretation'
import { validateSubtitleQuality } from '~/lib/subtitle/quality'
import { normalizeInterpretationMode, type InterpretationMode } from '~/lib/interpretationMode'

export type ProcessVideoImportArgs = {
  dbVideoId: string
  videoId: string
  sourceUrl: string
  service: VideoService.Bilibili
  pageNumber?: string
  detailLevel?: number
  showEmoji?: boolean
  outlineLevel?: number
  sentenceNumber?: number
  outputLanguage?: string
  interpretationMode?: InterpretationMode
}

export async function processVideoImport(args: ProcessVideoImportArgs) {
  const { dbVideoId, videoId, sourceUrl, pageNumber, interpretationMode } = args

  try {
    await updateVideo(dbVideoId, { status: 'processing_subtitle', last_error: null })

    let title = 'Untitled video'
    let transcript = ''
    let subtitleMeta: Record<string, any> = {}
    let subtitleError = ''

    try {
      const meta = await fetchBilibiliVideoMeta(videoId)
      if (meta?.title) {
        title = meta.title
      }
    } catch (e: any) {
      console.error('Failed to fetch bilibili title metadata', e?.message || e)
    }

    try {
      const bbdownSubtitle = await fetchSubtitleByBBDown(sourceUrl, pageNumber)
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
