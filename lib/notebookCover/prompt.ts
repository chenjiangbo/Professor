function compactText(input: string | null | undefined): string {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildNotebookCoverPrompt(title: string, description?: string | null): string {
  const cleanTitle = compactText(title)
  const cleanDescription = compactText(description)

  if (!cleanTitle) {
    throw new Error('Notebook title is required to generate cover')
  }

  const descriptionLine = cleanDescription
    ? `Notebook description/context: ${cleanDescription}`
    : 'Notebook description/context: No extra description provided.'

  return [
    'Create a notebook cover background image based directly on the notebook topic.',
    'The image must reflect the concrete subject from the title and description, not a generic knowledge metaphor.',
    'Avoid recurring book, library, notebook, graduation, study desk, or abstract "learning" symbols unless the topic itself is explicitly about those things.',
    'The composition must be full-bleed and fill the entire canvas edge to edge. Do not create a centered poster, framed illustration, inner border, white margin, blank side area, or floating card-like composition.',
    'If the topic is finance or stocks, prefer market charts, trading screens, candlesticks, price movement, exchange visuals, or macro-finance imagery.',
    'If the topic is engineering, science, history, art, or another domain, choose subject-specific objects, scenes, symbols, and visual context from that domain.',
    'Visual quality should stay clean and strong, but subject fidelity is more important than having a uniform house style.',
    'Leave enough clear space for frontend title and description overlay.',
    'Absolutely do not place letters, words, captions, labels, signatures, logos, watermarks, or UI screenshots inside the image.',
    `Notebook title/topic: ${cleanTitle}`,
    descriptionLine,
  ].join('\n')
}
