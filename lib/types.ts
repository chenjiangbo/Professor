export type VideoConfig = {
  videoId: string
  service?: VideoService.Bilibili | VideoService.YouTube | VideoService.Douyin
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
  YouTube = 'youtube',
  Douyin = 'douyin',
  Text = 'text',
  File = 'file',
}

export type SourceType = 'bilibili' | 'youtube' | 'douyin' | 'text' | 'file'

export type CommonSubtitleItem = {
  text: string
  index: number
  s?: number | string
}
