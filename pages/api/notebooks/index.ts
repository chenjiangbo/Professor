import type { NextApiRequest, NextApiResponse } from 'next'
import { createNotebook, listNotebooks } from '~/lib/repo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const data = await listNotebooks()
    res.status(200).json(data)
    return
  }
  if (req.method === 'POST') {
    const { title, description } = req.body || {}
    if (!title) {
      res.status(400).json({ error: 'title required' })
      return
    }
    const created = await createNotebook({ title, description })
    res.status(201).json(created)
    return
  }
  res.setHeader('Allow', 'GET,POST')
  res.status(405).end()
}
