import { CommonSubtitleItem } from '~/lib/types'

export type YoutubeSubtitleItem = { start: number; lines: string[] }
/* { "from": 16.669, "content": "make the slides more engaging" } */
export type BilibiliSubtitleItem = { from: number; content: string }

export function reduceYoutubeSubtitleTimestamp(subtitles: Array<YoutubeSubtitleItem> = []) {
  return reduceSubtitleTimestamp<YoutubeSubtitleItem>(
    subtitles,
    (i) => i.start,
    (i) => i.lines.join(' '),
    true,
  )
}

export function reduceBilibiliSubtitleTimestamp(
  subtitles: Array<BilibiliSubtitleItem> = [],
  shouldShowTimestamp?: boolean,
): Array<CommonSubtitleItem> {
  return reduceSubtitleTimestamp<BilibiliSubtitleItem>(
    subtitles,
    (i) => i.from,
    (i) => i.content,
    shouldShowTimestamp,
  )
}
export function reduceSubtitleTimestamp<T>(
  subtitles: Array<T> = [],
  getStart: (i: T) => number,
  getText: (i: T) => string,
  shouldShowTimestamp?: boolean,
): Array<CommonSubtitleItem> {
  // Split subtitles into grouped chunks.
  const TOTAL_GROUP_COUNT = 30
  // If subtitles are sparse, merge every ~7 lines.
  const MINIMUM_COUNT_ONE_GROUP = 7
  const eachGroupCount =
    subtitles.length > TOTAL_GROUP_COUNT ? subtitles.length / TOTAL_GROUP_COUNT : MINIMUM_COUNT_ONE_GROUP

  return subtitles.reduce((accumulator: CommonSubtitleItem[], current: T, index: number) => {
    // Compute current item group.
    const groupIndex: number = Math.floor(index / MINIMUM_COUNT_ONE_GROUP)

    // Initialize group text with its first item.
    if (!accumulator[groupIndex]) {
      accumulator[groupIndex] = {
        // 5.88 -> 5.9
        // text: current.start.toFixed() + ": ",
        index: groupIndex,
        s: getStart(current),
        text: shouldShowTimestamp ? getStart(current) + ' - ' : '',
      }
    }

    // Append current text to group content.
    accumulator[groupIndex].text = accumulator[groupIndex].text + getText(current) + ' '

    return accumulator
  }, [])
}
