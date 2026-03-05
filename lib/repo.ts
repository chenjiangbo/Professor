import { randomUUID } from 'crypto'
import { pool } from './db'
import type { AppLanguage } from './i18n'

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

function namespacedSettingKey(userId: string, key: string): string {
  return `${userId}:${key}`
}

export async function listNotebooks(userId: string) {
  const { rows } = await pool.query('SELECT * FROM notebooks WHERE owner_user_id=$1 ORDER BY updated_at DESC', [userId])
  return rows
}

export async function createNotebook(userId: string, data: { title: string; description?: string }) {
  const id = randomUUID()
  const { rows } = await pool.query(
    'INSERT INTO notebooks (id,owner_user_id,title,description) VALUES ($1,$2,$3,$4) RETURNING *',
    [id, userId, data.title, data.description || null],
  )
  return rows[0]
}

export async function getNotebook(userId: string, id: string) {
  const { rows } = await pool.query('SELECT * FROM notebooks WHERE id=$1 AND owner_user_id=$2', [id, userId])
  return rows[0] || null
}

export async function updateNotebook(userId: string, id: string, data: { title?: string; description?: string }) {
  const { rows } = await pool.query(
    `UPDATE notebooks
     SET title=COALESCE($3,title), description=COALESCE($4,description), updated_at=now()
     WHERE id=$1 AND owner_user_id=$2
     RETURNING *`,
    [id, userId, data.title || null, data.description || null],
  )
  return rows[0] || null
}

export async function deleteNotebook(userId: string, id: string) {
  await pool.query('DELETE FROM notebooks WHERE id=$1 AND owner_user_id=$2', [id, userId])
}

export async function listVideos(userId: string, notebookId: string, language?: AppLanguage) {
  if (!language) {
    const { rows } = await pool.query(
      `SELECT v.*
       FROM videos v
       JOIN notebooks n ON n.id = v.notebook_id
       WHERE v.notebook_id=$1 AND n.owner_user_id=$2
       ORDER BY v.created_at DESC`,
      [notebookId, userId],
    )
    return rows
  }

  const { rows } = await pool.query(
    `SELECT
       v.id,
       v.notebook_id,
       v.batch_id,
       v.platform,
       v.external_id,
       v.source_url,
       v.title,
       COALESCE(vl.status, v.status) AS status,
       v.duration,
       COALESCE(vl.summary, v.summary) AS summary,
       COALESCE(vl.chapters, v.chapters) AS chapters,
       COALESCE(vl.transcript, v.transcript) AS transcript,
       v.subtitle_language,
       v.subtitle_source,
       COALESCE(vl.last_error, v.last_error) AS last_error,
       v.interpretation_mode,
       v.source_type,
       v.generation_profile,
       v.source_mime,
       v.created_at,
       v.updated_at,
       $3::text AS content_language,
       (vl.id IS NOT NULL) AS localization_ready
     FROM videos v
     JOIN notebooks n ON n.id = v.notebook_id
     LEFT JOIN video_localizations vl ON vl.video_id = v.id AND vl.language = $3
     WHERE v.notebook_id=$1 AND n.owner_user_id=$2
     ORDER BY v.created_at DESC`,
    [notebookId, userId, language],
  )
  return rows
}

export async function countUserImportsToday(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM videos v
     JOIN notebooks n ON n.id = v.notebook_id
     WHERE n.owner_user_id = $1
       AND v.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')
       AND v.created_at < ((date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 day') AT TIME ZONE 'Asia/Shanghai')`,
    [userId],
  )
  return Number(rows[0]?.count || 0)
}

export async function createVideo(
  userId: string,
  data: {
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
  },
) {
  const id = randomUUID()
  const { rows } = await pool.query(
    `WITH target_notebook AS (
       SELECT id FROM notebooks WHERE id=$1 AND owner_user_id=$2
     )
     INSERT INTO videos (
       id, notebook_id, batch_id, platform, external_id, source_url, title, status, duration, interpretation_mode,
       source_type, generation_profile, source_mime
     )
     SELECT
       $3, target_notebook.id, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
     FROM target_notebook
     RETURNING *`,
    [
      data.notebookId,
      userId,
      id,
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

  if (!rows[0]) {
    throw new Error('Notebook not found or not accessible')
  }

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

export async function updateVideoForUser(userId: string, id: string, patch: any) {
  const fields = []
  const values: any[] = []
  let idx = 2
  for (const [key, val] of Object.entries(patch)) {
    fields.push(`${key}=$${++idx}`)
    values.push(val)
  }
  if (!fields.length) {
    const { rows } = await pool.query(
      `SELECT v.*
       FROM videos v
       JOIN notebooks n ON n.id = v.notebook_id
       WHERE v.id=$1 AND n.owner_user_id=$2`,
      [id, userId],
    )
    return rows[0] || null
  }

  const sql = `
    UPDATE videos v
    SET ${fields.join(',')}, updated_at=now()
    FROM notebooks n
    WHERE v.id=$1
      AND n.id = v.notebook_id
      AND n.owner_user_id=$2
    RETURNING v.*
  `
  const { rows } = await pool.query(sql, [id, userId, ...values])
  return rows[0] || null
}

export async function deleteVideo(userId: string, id: string) {
  await pool.query(
    `DELETE FROM videos v
     USING notebooks n
     WHERE v.id=$1 AND n.id = v.notebook_id AND n.owner_user_id=$2`,
    [id, userId],
  )
}

export async function getVideo(userId: string, id: string, language?: AppLanguage) {
  if (!language) {
    const { rows } = await pool.query(
      `SELECT v.*
       FROM videos v
       JOIN notebooks n ON n.id = v.notebook_id
       WHERE v.id=$1 AND n.owner_user_id=$2`,
      [id, userId],
    )
    return rows[0] || null
  }

  const { rows } = await pool.query(
    `SELECT
       v.id,
       v.notebook_id,
       v.batch_id,
       v.platform,
       v.external_id,
       v.source_url,
       v.title,
       COALESCE(vl.status, v.status) AS status,
       v.duration,
       COALESCE(vl.summary, v.summary) AS summary,
       COALESCE(vl.chapters, v.chapters) AS chapters,
       COALESCE(vl.transcript, v.transcript) AS transcript,
       v.subtitle_language,
       v.subtitle_source,
       COALESCE(vl.last_error, v.last_error) AS last_error,
       v.interpretation_mode,
       v.source_type,
       v.generation_profile,
       v.source_mime,
       v.created_at,
       v.updated_at,
       $3::text AS content_language,
       (vl.id IS NOT NULL) AS localization_ready
     FROM videos v
     JOIN notebooks n ON n.id = v.notebook_id
     LEFT JOIN video_localizations vl ON vl.video_id = v.id AND vl.language = $3
     WHERE v.id=$1 AND n.owner_user_id=$2`,
    [id, userId, language],
  )
  return rows[0] || null
}

export async function upsertVideoLocalization(
  videoId: string,
  language: AppLanguage,
  patch: {
    transcript?: string | null
    summary?: string | null
    chapters?: any
    status?: string | null
    last_error?: string | null
  },
) {
  const fields: string[] = []
  const values: any[] = []
  let idx = 3

  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'undefined') continue
    idx += 1
    fields.push(`${key}=$${idx}`)
    values.push(value)
  }

  const upsertAssignments = fields.length ? `${fields.join(',')}, updated_at=now()` : 'updated_at=now()'

  const { rows } = await pool.query(
    `INSERT INTO video_localizations (id, video_id, language)
     VALUES ($1, $2, $3)
     ON CONFLICT (video_id, language) DO UPDATE SET ${upsertAssignments}
     RETURNING *`,
    [randomUUID(), videoId, language, ...values],
  )
  return rows[0]
}

export async function addNote(
  userId: string,
  data: { notebookId: string; videoId?: string; title?: string; body: string },
) {
  const id = randomUUID()

  const notebook = await getNotebook(userId, data.notebookId)
  if (!notebook) {
    throw new Error('Notebook not found or not accessible')
  }

  if (data.videoId) {
    const video = await getVideo(userId, data.videoId)
    if (!video) {
      throw new Error('Video not found or not accessible')
    }
  }

  const { rows } = await pool.query(
    'INSERT INTO notes (id, notebook_id, video_id, title, body) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [id, data.notebookId, data.videoId || null, data.title || null, data.body],
  )
  return rows[0]
}

export async function listNotes(userId: string, filter: { notebookId?: string; videoId?: string }) {
  if (filter.videoId) {
    const { rows } = await pool.query(
      `SELECT no.*
       FROM notes no
       JOIN notebooks n ON n.id = no.notebook_id
       WHERE no.video_id=$1 AND n.owner_user_id=$2
       ORDER BY no.created_at DESC`,
      [filter.videoId, userId],
    )
    return rows
  }
  if (filter.notebookId) {
    const { rows } = await pool.query(
      `SELECT no.*
       FROM notes no
       JOIN notebooks n ON n.id = no.notebook_id
       WHERE no.notebook_id=$1 AND n.owner_user_id=$2
       ORDER BY no.created_at DESC`,
      [filter.notebookId, userId],
    )
    return rows
  }
  const { rows } = await pool.query(
    `SELECT no.*
     FROM notes no
     JOIN notebooks n ON n.id = no.notebook_id
     WHERE n.owner_user_id=$1
     ORDER BY no.created_at DESC`,
    [userId],
  )
  return rows
}

export async function createImportBatch(userId: string, notebookId: string, totalCount: number) {
  const id = randomUUID()
  const { rows } = await pool.query(
    `WITH target_notebook AS (
       SELECT id FROM notebooks WHERE id=$1 AND owner_user_id=$2
     )
     INSERT INTO import_batches (id, notebook_id, total_count)
     SELECT $3, target_notebook.id, $4 FROM target_notebook
     RETURNING *`,
    [notebookId, userId, id, totalCount],
  )

  if (!rows[0]) {
    throw new Error('Notebook not found or not accessible')
  }

  return rows[0]
}

export async function getImportBatch(userId: string, id: string) {
  const { rows } = await pool.query(
    `SELECT ib.*
     FROM import_batches ib
     JOIN notebooks n ON n.id = ib.notebook_id
     WHERE ib.id=$1 AND n.owner_user_id=$2`,
    [id, userId],
  )
  return rows[0] || null
}

export async function listImportBatchItems(userId: string, batchId: string) {
  const { rows } = await pool.query(
    `SELECT v.id, v.notebook_id, v.batch_id, v.platform, v.source_type, v.external_id, v.source_url, v.title, v.status, v.summary, v.created_at, v.updated_at
     FROM videos v
     JOIN notebooks n ON n.id = v.notebook_id
     WHERE v.batch_id=$1 AND n.owner_user_id=$2
     ORDER BY v.created_at DESC`,
    [batchId, userId],
  )
  return rows
}

export async function getImportBatchStats(userId: string, batchId: string) {
  const { rows } = await pool.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE v.status='ready')::int AS ready,
      COUNT(*) FILTER (WHERE v.status='error' OR v.status='no-subtitle')::int AS failed,
      COUNT(*) FILTER (WHERE v.status NOT IN ('ready','error','no-subtitle'))::int AS processing
     FROM videos v
     JOIN notebooks n ON n.id = v.notebook_id
     WHERE v.batch_id=$1 AND n.owner_user_id=$2`,
    [batchId, userId],
  )
  return rows[0] || { total: 0, ready: 0, failed: 0, processing: 0 }
}

export async function getAppSetting(userId: string, key: string): Promise<string | null> {
  await ensureAppSettingsTable()
  const scopedKey = namespacedSettingKey(userId, key)
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key=$1', [scopedKey])
  return rows[0]?.value || null
}

export async function setAppSetting(userId: string, key: string, value: string): Promise<void> {
  await ensureAppSettingsTable()
  const scopedKey = namespacedSettingKey(userId, key)
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [scopedKey, value],
  )
}

export async function deleteAppSetting(userId: string, key: string): Promise<void> {
  await ensureAppSettingsTable()
  const scopedKey = namespacedSettingKey(userId, key)
  await pool.query('DELETE FROM app_settings WHERE key=$1', [scopedKey])
}
