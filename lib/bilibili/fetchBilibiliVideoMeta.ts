import { getDecryptedBBDownCookie } from '~/lib/bbdown/auth'
import { sample } from '~/utils/fp'

export type BilibiliVideoMeta = {
  title?: string
  description?: string
}

export async function fetchBilibiliVideoMeta(videoId: string): Promise<BilibiliVideoMeta> {
  let cookie = ''
  try {
    cookie = (await getDecryptedBBDownCookie()) || ''
  } catch {
    cookie = ''
  }

  if (!cookie) {
    const sessdata = sample(process.env.BILIBILI_SESSION_TOKEN?.split(','))
    if (sessdata) cookie = `SESSDATA=${sessdata}`
  }

  const params = videoId.startsWith('av') ? `?aid=${videoId.slice(2)}` : `?bvid=${videoId}`
  const requestUrl = `https://api.bilibili.com/x/web-interface/view${params}`
  const response = await fetch(requestUrl, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
      Host: 'api.bilibili.com',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    method: 'GET',
    cache: 'no-cache',
    referrerPolicy: 'no-referrer',
  })

  const json = await response.json()
  return {
    title: json?.data?.title,
    description: json?.data?.desc,
  }
}
