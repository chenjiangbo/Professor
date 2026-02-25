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
}

export type CommonSubtitleItem = {
  text: string
  index: number
  s?: number | string
}
