import fs from 'fs'
import { createVertex, type GoogleVertexProvider } from '@ai-sdk/google-vertex'

function resolveProjectIdFromCredentialsFile() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credentialsPath) return undefined

  try {
    const raw = fs.readFileSync(credentialsPath, 'utf8')
    const parsed = JSON.parse(raw) as { project_id?: string }
    return parsed.project_id || undefined
  } catch {
    return undefined
  }
}

export function resolveVertexProjectId() {
  return (
    process.env.VERTEX_PROJECT_ID ||
    process.env.VERTEXAI_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    resolveProjectIdFromCredentialsFile()
  )
}

export function resolveVertexLocation() {
  return process.env.VERTEX_LOCATION || process.env.VERTEXAI_LOCATION || 'global'
}

export function resolveVertexModel() {
  const model =
    process.env.VERTEX_FORCE_MODEL ||
    process.env.VERTEX_CHAT_MODEL ||
    process.env.VERTEX_MODEL ||
    process.env.GOOGLE_VERTEX_MODEL ||
    'gemini-2.5-pro'
  return normalizeVertexModelName(model)
}

export function resolveVertexFallbackModel() {
  const model =
    process.env.VERTEX_FALLBACK_MODEL ||
    process.env.GOOGLE_VERTEX_FALLBACK_MODEL ||
    (resolveVertexModel() === 'gemini-2.5-pro' ? '' : 'gemini-2.5-pro')
  return normalizeVertexModelName(model || '')
}

export function resolveVertexInterpretationCoverageModel() {
  const model =
    process.env.VERTEX_INTERPRETATION_COVERAGE_MODEL ||
    process.env.VERTEX_COVERAGE_MODEL ||
    process.env.VERTEX_OUTLINE_MODEL ||
    'gemini-2.5-flash'
  return normalizeVertexModelName(model)
}

export function resolveVertexInterpretationArticleModel() {
  const model =
    process.env.VERTEX_INTERPRETATION_ARTICLE_MODEL || process.env.VERTEX_ARTICLE_MODEL || resolveVertexModel()
  return normalizeVertexModelName(model)
}

export function createVertexProvider(): GoogleVertexProvider {
  const project = resolveVertexProjectId()
  const location = resolveVertexLocation()
  if (!project) {
    throw new Error('Missing Vertex project id. Set VERTEX_PROJECT_ID or VERTEXAI_PROJECT.')
  }

  return createVertex({
    project,
    location,
  })
}

function normalizeVertexModelName(model: unknown) {
  return String(model || '')
    .trim()
    .replace(/^google\//, '')
}
