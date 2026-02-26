import { randomUUID } from 'crypto'
import { pool } from './db'

let appSettingsReadyPromise: Promise<void> | null = null

async function ensureAppSettingsTable() {
  if (!appSettingsReadyPromise) {
    appSettingsReadyPromise = pool
      .query(
        `
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `,
      )
      .then(() => undefined)
      .catch((err) => {
        appSettingsReadyPromise = null
        throw err
      })
  }
  await appSettingsReadyPromise
}

export async function listNotebooks() {
  const { rows } = await pool.query('SELECT * FROM notebooks ORDER BY updated_at DESC')
  return rows
}

export async function createNotebook(data: { title: string; description?: string }) {
  const id = randomUUID()
  const { rows } = await pool.query('INSERT INTO notebooks (id,title,description) VALUES ($1,$2,$3) RETURNING *', [
    id,
    data.title,
    data.description || null,
  ])
  return rows[0]
}

export async function getNotebook(id: string) {
  const { rows } = await pool.query('SELECT * FROM notebooks WHERE id=$1', [id])
  return rows[0] || null
}

export async function updateNotebook(id: string, data: { title?: string; description?: string }) {
  const { rows } = await pool.query(
    `UPDATE notebooks SET title=COALESCE($2,title), description=COALESCE($3,description), updated_at=now() WHERE id=$1 RETURNING *`,
    [id, data.title || null, data.description || null],
  )
  return rows[0] || null
}

export async function deleteNotebook(id: string) {
  await pool.query('DELETE FROM notebooks WHERE id=$1', [id])
}

export async function listVideos(notebookId: string) {
  const { rows } = await pool.query('SELECT * FROM videos WHERE notebook_id=$1 ORDER BY created_at DESC', [notebookId])
  return rows
}

export async function createVideo(data: {
  notebookId: string
  platform: string
  externalId: string
  sourceUrl: string
  title: string
  status: string
  duration?: string
  batchId?: string
  interpretationMode?: string
  sourceType?: string
  generationProfile?: string
  sourceMime?: string
}) {
  const id = randomUUID()
  const { rows } = await pool.query(
    `INSERT INTO videos (
      id, notebook_id, batch_id, platform, external_id, source_url, title, status, duration, interpretation_mode,
      source_type, generation_profile, source_mime
    )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      id,
      data.notebookId,
      data.batchId || null,
      data.platform,
      data.externalId,
      data.sourceUrl,
      data.title,
      data.status,
      data.duration || null,
      data.interpretationMode || 'concise',
      data.sourceType || 'bilibili',
      data.generationProfile || 'full_interpretation',
      data.sourceMime || null,
    ],
  )
  return rows[0]
}

export async function updateVideo(id: string, patch: any) {
  const fields = []
  const values: any[] = []
  let idx = 1
  for (const [key, val] of Object.entries(patch)) {
    fields.push(`${key}=$${++idx}`)
    values.push(val)
  }
  if (!fields.length) {
    const { rows } = await pool.query('SELECT * FROM videos WHERE id=$1', [id])
    return rows[0] || null
  }
  const sql = `UPDATE videos SET ${fields.join(',')}, updated_at=now() WHERE id=$1 RETURNING *`
  const { rows } = await pool.query(sql, [id, ...values])
  return rows[0] || null
}

export async function deleteVideo(id: string) {
  await pool.query('DELETE FROM videos WHERE id=$1', [id])
}

export async function getVideo(id: string) {
  const { rows } = await pool.query('SELECT * FROM videos WHERE id=$1', [id])
  return rows[0] || null
}

export async function addNote(data: { notebookId: string; videoId?: string; title?: string; body: string }) {
  const id = randomUUID()
  const { rows } = await pool.query(
    'INSERT INTO notes (id, notebook_id, video_id, title, body) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [id, data.notebookId, data.videoId || null, data.title || null, data.body],
  )
  return rows[0]
}

export async function listNotes(filter: { notebookId?: string; videoId?: string }) {
  if (filter.videoId) {
    const { rows } = await pool.query('SELECT * FROM notes WHERE video_id=$1 ORDER BY created_at DESC', [
      filter.videoId,
    ])
    return rows
  }
  if (filter.notebookId) {
    const { rows } = await pool.query('SELECT * FROM notes WHERE notebook_id=$1 ORDER BY created_at DESC', [
      filter.notebookId,
    ])
    return rows
  }
  const { rows } = await pool.query('SELECT * FROM notes ORDER BY created_at DESC')
  return rows
}

export async function createImportBatch(notebookId: string, totalCount: number) {
  const id = randomUUID()
  const { rows } = await pool.query(
    `INSERT INTO import_batches (id, notebook_id, total_count) VALUES ($1,$2,$3) RETURNING *`,
    [id, notebookId, totalCount],
  )
  return rows[0]
}

export async function getImportBatch(id: string) {
  const { rows } = await pool.query('SELECT * FROM import_batches WHERE id=$1', [id])
  return rows[0] || null
}

export async function listImportBatchItems(batchId: string) {
  const { rows } = await pool.query(
    `SELECT id, notebook_id, batch_id, platform, source_type, external_id, source_url, title, status, summary, created_at, updated_at
     FROM videos
     WHERE batch_id=$1
     ORDER BY created_at DESC`,
    [batchId],
  )
  return rows
}

export async function getImportBatchStats(batchId: string) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='ready')::int AS ready,
      COUNT(*) FILTER (WHERE status='error' OR status='no-subtitle')::int AS failed,
      COUNT(*) FILTER (WHERE status NOT IN ('ready','error','no-subtitle'))::int AS processing
     FROM videos
     WHERE batch_id=$1`,
    [batchId],
  )
  return rows[0] || { total: 0, ready: 0, failed: 0, processing: 0 }
}

export async function getAppSetting(key: string): Promise<string | null> {
  await ensureAppSettingsTable()
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key=$1', [key])
  return rows[0]?.value || null
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await ensureAppSettingsTable()
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [key, value],
  )
}

export async function deleteAppSetting(key: string): Promise<void> {
  await ensureAppSettingsTable()
  await pool.query('DELETE FROM app_settings WHERE key=$1', [key])
}
