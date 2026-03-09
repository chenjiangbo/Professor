import { Pool } from 'pg'
import { assertAuthConfiguration } from './requestAuth'

assertAuthConfiguration()

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
      cover_url TEXT,
      cover_status TEXT NOT NULL DEFAULT 'none',
      cover_updated_at TIMESTAMPTZ,
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
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'bilibili';
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS generation_profile TEXT NOT NULL DEFAULT 'full_interpretation';
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS source_mime TEXT;
    CREATE TABLE IF NOT EXISTS video_localizations (
      id UUID PRIMARY KEY,
      video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      language TEXT NOT NULL,
      transcript TEXT,
      summary TEXT,
      chapters JSONB,
      status TEXT,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(video_id, language)
    );
    CREATE INDEX IF NOT EXISTS idx_video_localizations_video_id ON video_localizations(video_id);
    CREATE INDEX IF NOT EXISTS idx_video_localizations_language ON video_localizations(language);
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
    CREATE TABLE IF NOT EXISTS sources (
      id UUID PRIMARY KEY,
      notebook_id UUID REFERENCES notebooks(id) ON DELETE CASCADE,
      video_id UUID REFERENCES videos(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      platform TEXT,
      external_id TEXT,
      source_url TEXT,
      title TEXT,
      original_name TEXT,
      mime_type TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      summary TEXT,
      chapters JSONB,
      extracted_text TEXT,
      raw_storage_path TEXT,
      language TEXT,
      interpretation_mode TEXT NOT NULL DEFAULT 'concise',
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_sources_notebook_id ON sources(notebook_id);
    CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
    CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
    CREATE TABLE IF NOT EXISTS source_jobs (
      id UUID PRIMARY KEY,
      source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 2,
      error TEXT,
      meta JSONB,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_source_jobs_source_id ON source_jobs(source_id);
    CREATE INDEX IF NOT EXISTS idx_source_jobs_status ON source_jobs(status);
    CREATE TABLE IF NOT EXISTS billing_orders (
      id UUID PRIMARY KEY,
      out_trade_no TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      product_code TEXT NOT NULL DEFAULT 'professor',
      plan_id TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CREATED',
      qr_code TEXT,
      expire_at TIMESTAMPTZ,
      alipay_trade_no TEXT,
      notify_payload JSONB,
      close_reason TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_billing_orders_user_id ON billing_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_billing_orders_product_code ON billing_orders(product_code);
    CREATE INDEX IF NOT EXISTS idx_billing_orders_status ON billing_orders(status);
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_code TEXT NOT NULL DEFAULT 'professor',
      plan_id TEXT NOT NULL,
      current_period_start TIMESTAMPTZ NOT NULL,
      current_period_end TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      last_order_id UUID REFERENCES billing_orders(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_product_unique ON subscriptions(user_id, product_code);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
  `)
  await pool.query("ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS product_code TEXT NOT NULL DEFAULT 'professor'")
  await pool.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS product_code TEXT NOT NULL DEFAULT 'professor'")

  await pool.query('ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS owner_user_id UUID')
  await pool.query('ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS cover_url TEXT')
  await pool.query("ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS cover_status TEXT NOT NULL DEFAULT 'none'")
  await pool.query('ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS cover_updated_at TIMESTAMPTZ')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notebooks_owner_user_id ON notebooks(owner_user_id)')

  const adminUserIdsRaw = process.env.PROFESSOR_ADMIN_USER_IDS
  const adminUserIds = String(adminUserIdsRaw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const { rows: nullOwnerRows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM notebooks WHERE owner_user_id IS NULL',
  )
  const nullOwnerCount = Number(nullOwnerRows[0]?.count || 0)

  if (nullOwnerCount > 0) {
    const bootstrapOwnerUserId = adminUserIds[0]
    if (!bootstrapOwnerUserId) {
      throw new Error(
        'Found notebooks with NULL owner_user_id, but PROFESSOR_ADMIN_USER_IDS is missing. Configure admin user IDs before startup.',
      )
    }
    await pool.query('UPDATE notebooks SET owner_user_id=$1 WHERE owner_user_id IS NULL', [bootstrapOwnerUserId])
  }

  await pool.query('ALTER TABLE notebooks ALTER COLUMN owner_user_id SET NOT NULL')

  const bootstrapOwnerUserId = adminUserIds[0]
  if (bootstrapOwnerUserId) {
    await pool.query(
      `
      WITH legacy_keys AS (
        SELECT key, value
        FROM app_settings
        WHERE key IN ('bbdown_auth', 'youtube_auth', 'default_interpretation_mode')
      )
      INSERT INTO app_settings (key, value, updated_at)
      SELECT $1 || ':' || legacy_keys.key, legacy_keys.value, now()
      FROM legacy_keys
      ON CONFLICT (key) DO NOTHING
      `,
      [bootstrapOwnerUserId],
    )
  }
}

ensureTables().catch((e) => {
  console.error('Failed to ensure tables', e)
})

export { pool }
