export function extractSentenceWithTimestamp(sentence: string) {
  return sentence
    .replace('0:', '0.0') // Normalize second-0 edge case.
    .match(/^\s*(\d+[\.:]?\d+?)([: sec].*)/)
}
