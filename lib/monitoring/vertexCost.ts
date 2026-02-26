import { GoogleAuth } from 'google-auth-library'

const MONITORING_SCOPE = 'https://www.googleapis.com/auth/monitoring.read'
const MONITORING_API_BASE = 'https://monitoring.googleapis.com/v3'
const TOKEN_METRIC_TYPE = 'aiplatform.googleapis.com/publisher/online_serving/token_count'
const INVOCATION_METRIC_TYPE = 'aiplatform.googleapis.com/publisher/online_serving/model_invocation_count'
const PUBLISHER_MODEL_RESOURCE = 'aiplatform.googleapis.com/PublisherModel'

type TokenBucket = 'input' | 'output'

interface MonitoringPoint {
  interval?: {
    endTime?: string
  }
  value?: {
    int64Value?: string
    doubleValue?: number
  }
}

interface MonitoringTimeSeries {
  metric?: {
    labels?: Record<string, string>
  }
  resource?: {
    labels?: Record<string, string>
  }
  points?: MonitoringPoint[]
}

interface MonitoringListResponse {
  timeSeries?: MonitoringTimeSeries[]
  nextPageToken?: string
}

interface DailyUsageAccumulator {
  inputTokens: number
  outputTokens: number
  invocations: number
}

export interface VertexCostDailyRecord {
  date: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  invocations: number
  estimatedCostUsd: number
}

export interface VertexCostSummary {
  projectId: string
  model: string
  windowDays: number
  pricing: {
    inputPricePerMillionUsd: number
    outputPricePerMillionUsd: number
  }
  totals: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    invocations: number
    estimatedCostUsd: number
  }
  daily: VertexCostDailyRecord[]
  updatedAt: string
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value.trim()
}

function requirePositiveNumberEnv(name: string) {
  const value = requireEnv(name)
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid env ${name}: expected a positive number, got "${value}"`)
  }
  return numeric
}

function normalizeModelId(model: string) {
  return model
    .trim()
    .toLowerCase()
    .replace(/^google\//, '')
    .replace(/^publishers\/google\/models\//, '')
    .replace(/^models\//, '')
}

function modelMatches(reportedModelId: string, configuredModelId: string) {
  const reported = normalizeModelId(reportedModelId)
  const configured = normalizeModelId(configuredModelId)
  return reported === configured || reported.includes(configured)
}

function getReportedModelId(labels: Record<string, string> | undefined) {
  const modelUserId = String(labels?.model_user_id || '').trim()
  if (modelUserId) {
    return modelUserId
  }
  const modelVersionId = String(labels?.model_version_id || '').trim()
  if (modelVersionId) {
    return modelVersionId
  }
  throw new Error('Monitoring series is missing both resource.labels.model_user_id and model_version_id')
}

function parsePointValue(point: MonitoringPoint) {
  const intValue = point.value?.int64Value
  if (typeof intValue === 'string' && intValue.length > 0) {
    const numeric = Number(intValue)
    if (!Number.isFinite(numeric)) {
      throw new Error(`Invalid Monitoring int64Value: "${intValue}"`)
    }
    return numeric
  }

  const doubleValue = point.value?.doubleValue
  if (typeof doubleValue === 'number' && Number.isFinite(doubleValue)) {
    return doubleValue
  }

  throw new Error('Monitoring point is missing a numeric value')
}

function dayKeyFromPoint(point: MonitoringPoint) {
  const endTime = point.interval?.endTime
  if (!endTime) {
    throw new Error('Monitoring point is missing interval.endTime')
  }
  return endTime.slice(0, 10)
}

function classifyTokenBucket(typeLabel: string): TokenBucket {
  const normalized = typeLabel.toLowerCase()
  if (normalized.includes('input') || normalized.includes('prompt')) {
    return 'input'
  }
  if (normalized.includes('output') || normalized.includes('candidate')) {
    return 'output'
  }
  throw new Error(`Unsupported token metric label type: "${typeLabel}"`)
}

async function getMonitoringAccessToken() {
  const auth = new GoogleAuth({ scopes: [MONITORING_SCOPE] })
  const token = await auth.getAccessToken()
  if (!token) {
    throw new Error('Failed to acquire Monitoring API access token')
  }
  return token
}

async function listAlignedTimeSeries(
  accessToken: string,
  projectId: string,
  metricType: string,
  startTimeIso: string,
  endTimeIso: string,
) {
  const collected: MonitoringTimeSeries[] = []
  let pageToken = ''

  while (true) {
    const params = new URLSearchParams()
    params.set('filter', `metric.type="${metricType}" AND resource.type="${PUBLISHER_MODEL_RESOURCE}"`)
    params.set('interval.startTime', startTimeIso)
    params.set('interval.endTime', endTimeIso)
    params.set('aggregation.alignmentPeriod', '86400s')
    params.set('aggregation.perSeriesAligner', 'ALIGN_SUM')
    params.set('view', 'FULL')
    params.set('pageSize', '1000')
    if (pageToken) {
      params.set('pageToken', pageToken)
    }

    const url = `${MONITORING_API_BASE}/projects/${projectId}/timeSeries?${params.toString()}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Monitoring API request failed (${response.status}): ${body}`)
    }

    const payload = (await response.json()) as MonitoringListResponse
    if (Array.isArray(payload.timeSeries)) {
      collected.push(...payload.timeSeries)
    }

    if (!payload.nextPageToken) {
      break
    }
    pageToken = payload.nextPageToken
  }

  return collected
}

function getOrInitDailyUsage(map: Map<string, DailyUsageAccumulator>, day: string): DailyUsageAccumulator {
  const existing = map.get(day)
  if (existing) {
    return existing
  }

  const next: DailyUsageAccumulator = {
    inputTokens: 0,
    outputTokens: 0,
    invocations: 0,
  }
  map.set(day, next)
  return next
}

export async function fetchVertexCostSummary(windowDays: number): Promise<VertexCostSummary> {
  if (!Number.isInteger(windowDays) || windowDays <= 0 || windowDays > 90) {
    throw new Error(`Invalid windowDays: ${windowDays}. Expected integer between 1 and 90.`)
  }

  const projectId = requireEnv('VERTEXAI_PROJECT')
  const model = requireEnv('VERTEX_MODEL')
  const inputPricePerMillionUsd = requirePositiveNumberEnv('VERTEX_INPUT_PRICE_PER_1M_USD')
  const outputPricePerMillionUsd = requirePositiveNumberEnv('VERTEX_OUTPUT_PRICE_PER_1M_USD')

  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - windowDays * 24 * 60 * 60 * 1000)

  const accessToken = await getMonitoringAccessToken()
  const [tokenSeries, invocationSeries] = await Promise.all([
    listAlignedTimeSeries(accessToken, projectId, TOKEN_METRIC_TYPE, startTime.toISOString(), endTime.toISOString()),
    listAlignedTimeSeries(
      accessToken,
      projectId,
      INVOCATION_METRIC_TYPE,
      startTime.toISOString(),
      endTime.toISOString(),
    ),
  ])

  const configuredModel = normalizeModelId(model)
  const discoveredTokenModels = new Set<string>()
  const dailyUsageMap = new Map<string, DailyUsageAccumulator>()
  let matchedTokenSeriesCount = 0

  for (const series of tokenSeries) {
    const reportedModel = getReportedModelId(series.resource?.labels)
    discoveredTokenModels.add(reportedModel)

    if (!modelMatches(reportedModel, configuredModel)) {
      continue
    }
    matchedTokenSeriesCount += 1

    const tokenType = String(series.metric?.labels?.type || '').trim()
    if (!tokenType) {
      throw new Error('Monitoring token_count series is missing metric.labels.type')
    }
    const bucket = classifyTokenBucket(tokenType)
    const points = Array.isArray(series.points) ? series.points : []

    for (const point of points) {
      const day = dayKeyFromPoint(point)
      const value = parsePointValue(point)
      if (value < 0) {
        throw new Error(`Monitoring token_count contains negative value: ${value}`)
      }

      const row = getOrInitDailyUsage(dailyUsageMap, day)
      if (bucket === 'input') {
        row.inputTokens += value
      } else {
        row.outputTokens += value
      }
    }
  }

  if (tokenSeries.length > 0 && matchedTokenSeriesCount === 0) {
    throw new Error(
      `No token_count data matched VERTEX_MODEL="${model}". Discovered models: ${Array.from(discoveredTokenModels).join(
        ', ',
      )}`,
    )
  }

  const discoveredInvocationModels = new Set<string>()
  let matchedInvocationSeriesCount = 0
  for (const series of invocationSeries) {
    const reportedModel = getReportedModelId(series.resource?.labels)
    discoveredInvocationModels.add(reportedModel)
    if (!modelMatches(reportedModel, configuredModel)) {
      continue
    }
    matchedInvocationSeriesCount += 1

    const points = Array.isArray(series.points) ? series.points : []
    for (const point of points) {
      const day = dayKeyFromPoint(point)
      const value = parsePointValue(point)
      if (value < 0) {
        throw new Error(`Monitoring model_invocation_count contains negative value: ${value}`)
      }
      const row = getOrInitDailyUsage(dailyUsageMap, day)
      row.invocations += value
    }
  }

  if (invocationSeries.length > 0 && matchedInvocationSeriesCount === 0) {
    throw new Error(
      `No model_invocation_count data matched VERTEX_MODEL="${model}". Discovered models: ${Array.from(
        discoveredInvocationModels,
      ).join(', ')}`,
    )
  }

  const daily = Array.from(dailyUsageMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, usage]) => {
      const inputCost = (usage.inputTokens / 1_000_000) * inputPricePerMillionUsd
      const outputCost = (usage.outputTokens / 1_000_000) * outputPricePerMillionUsd
      return {
        date,
        inputTokens: Math.round(usage.inputTokens),
        outputTokens: Math.round(usage.outputTokens),
        totalTokens: Math.round(usage.inputTokens + usage.outputTokens),
        invocations: Math.round(usage.invocations),
        estimatedCostUsd: Number((inputCost + outputCost).toFixed(6)),
      }
    })

  const totals = daily.reduce(
    (acc, item) => {
      acc.inputTokens += item.inputTokens
      acc.outputTokens += item.outputTokens
      acc.totalTokens += item.totalTokens
      acc.invocations += item.invocations
      acc.estimatedCostUsd += item.estimatedCostUsd
      return acc
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      invocations: 0,
      estimatedCostUsd: 0,
    },
  )

  return {
    projectId,
    model,
    windowDays,
    pricing: {
      inputPricePerMillionUsd,
      outputPricePerMillionUsd,
    },
    totals: {
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      totalTokens: totals.totalTokens,
      invocations: totals.invocations,
      estimatedCostUsd: Number(totals.estimatedCostUsd.toFixed(6)),
    },
    daily,
    updatedAt: new Date().toISOString(),
  }
}
