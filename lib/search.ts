type GoogleSearchItem = {
  title: string
  link: string
  snippet: string
}

function buildFriendlyFailure(reason: string) {
  return `Web search is unavailable now: ${reason}`
}

export async function performWebSearch(query: string): Promise<string> {
  const q = String(query || '').trim()
  if (!q) {
    return 'Web search skipped: empty query.'
  }

  const apiKey = process.env.GOOGLE_SEARCH_API_KEY || ''
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID || ''

  if (!apiKey || !engineId) {
    return buildFriendlyFailure('missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_ENGINE_ID.')
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx: engineId,
      q,
      num: '5',
      safe: 'off',
    })

    const resp = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      return buildFriendlyFailure(`Google Custom Search API error ${resp.status}: ${text.slice(0, 180)}`)
    }

    const json = (await resp.json()) as any
    const items: GoogleSearchItem[] = Array.isArray(json?.items)
      ? json.items
          .slice(0, 5)
          .map((item: any) => ({
            title: String(item?.title || '').trim(),
            link: String(item?.link || '').trim(),
            snippet: String(item?.snippet || '').trim(),
          }))
          .filter((item: GoogleSearchItem) => Boolean(item.title && item.link))
      : []

    if (!items.length) {
      return `No web results found for query: "${q}".`
    }

    return JSON.stringify(
      {
        query: q,
        results: items,
      },
      null,
      2,
    )
  } catch (error: any) {
    return buildFriendlyFailure(error?.message || 'network error')
  }
}
