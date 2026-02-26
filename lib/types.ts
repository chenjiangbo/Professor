export type VideoConfig = {
  videoId: string
  service?: VideoService.Bilibili
  pageNumber?: null | string
  showTimestamp?: boolean
  showEmoji?: boolean
  outputLanguage?: string
  detailLevel?: number
  sentenceNumber?: number
  outlineLevel?: number
}

export enum VideoService {
  Bilibili = 'bilibili',
  Text = 'text',
  File = 'file',
}

export type SourceType = 'bilibili' | 'text' | 'file'

export type CommonSubtitleItem = {
  text: string
  index: number
  s?: number | string
}
