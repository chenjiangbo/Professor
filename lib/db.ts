import { Pool } from 'pg'

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
})

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS videos (
      id UUID PRIMARY KEY,
      notebook_id UUID REFERENCES notebooks(id) ON DELETE CASCADE,
      batch_id UUID,
      platform TEXT,
      external_id TEXT,
      source_url TEXT,
      title TEXT,
      status TEXT,
      duration TEXT,
      summary TEXT,
      chapters JSONB,
      transcript TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS import_batches (
      id UUID PRIMARY KEY,
      notebook_id UUID REFERENCES notebooks(id) ON DELETE CASCADE,
      total_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL;
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS subtitle_language TEXT;
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS subtitle_source TEXT;
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS last_error TEXT;
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS interpretation_mode TEXT NOT NULL DEFAULT 'concise';
    CREATE TABLE IF NOT EXISTS notes (
      id UUID PRIMARY KEY,
      notebook_id UUID REFERENCES notebooks(id) ON DELETE CASCADE,
      video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
      title TEXT,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY,
      notebook_id UUID REFERENCES notebooks(id) ON DELETE CASCADE,
      role TEXT NOT NULL, -- 'user' | 'assistant'
      content TEXT NOT NULL,
      video_ids JSONB, -- Optional: which videos were referenced
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
}

ensureTables().catch((e) => {
  console.error('Failed to ensure tables', e)
})

export { pool }
