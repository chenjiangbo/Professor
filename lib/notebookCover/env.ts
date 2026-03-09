import path from 'path'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return String(value).trim()
}

export function resolveNotebookCoverModel(): string {
  return requireEnv('VERTEX_NOTEBOOK_COVER_MODEL')
}

export function resolveNotebookCoverStorageDir(): string {
  const configured = requireEnv('NOTEBOOK_COVER_STORAGE_DIR')
  return path.resolve(configured)
}
