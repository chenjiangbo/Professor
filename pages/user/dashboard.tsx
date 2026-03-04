import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Sidebar } from '~/components/sidebar'

interface VertexCostDailyRecord {
  date: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  invocations: number
  estimatedCostUsd: number
}

interface VertexCostSummary {
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

const fetcher = async (url: string): Promise<VertexCostSummary> => {
  const response = await fetch(url)
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to fetch Vertex cost dashboard')
  }
  return payload as VertexCostSummary
}

function formatTokens(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString()
}

const WINDOW_OPTIONS = [1, 7, 30]

export default function DashboardPage() {
  const [days, setDays] = useState<number>(7)
  const { data, error, isLoading } = useSWR(`/api/admin/vertex-cost?days=${days}`, fetcher, {
    revalidateOnFocus: false,
  })

  const rows = useMemo(() => (data?.daily || []).slice().reverse(), [data?.daily])

  return (
    <>
      <Sidebar />
      <div className="p-4 md:ml-64">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Vertex Cost Dashboard</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Estimated cost based on Cloud Monitoring token metrics (not the final bill)
              </p>
            </div>
            <div className="flex items-center gap-2">
              {WINDOW_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  className={`rounded border px-3 py-1 text-sm ${
                    days === option
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
                  }`}
                >
                  {option}d
                </button>
              ))}
            </div>
          </div>

          {isLoading && (
            <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              Loading dashboard data...
            </div>
          )}

          {error && (
            <div className="dark:bg-red-950 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:text-red-200">
              {String(error.message || error)}
            </div>
          )}

          {!isLoading && !error && data && (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Estimated Cost</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(data.totals.estimatedCostUsd)}
                  </p>
                </div>
                <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Invocations</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {formatTokens(data.totals.invocations)}
                  </p>
                </div>
                <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Input Tokens</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {formatTokens(data.totals.inputTokens)}
                  </p>
                </div>
                <div className="rounded border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Output Tokens</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {formatTokens(data.totals.outputTokens)}
                  </p>
                </div>
              </div>

              <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <p>Project: {data.projectId}</p>
                <p>Model: {data.model}</p>
                <p>Total Tokens: {formatTokens(data.totals.totalTokens)}</p>
                <p>
                  Pricing: input ${data.pricing.inputPricePerMillionUsd}/1M, output $
                  {data.pricing.outputPricePerMillionUsd}/1M
                </p>
                <p>Updated At: {formatTimestamp(data.updatedAt)}</p>
              </div>

              <div className="overflow-auto rounded border border-gray-200 dark:border-gray-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Invocations</th>
                      <th className="px-3 py-2">Input Tokens</th>
                      <th className="px-3 py-2">Output Tokens</th>
                      <th className="px-3 py-2">Total Tokens</th>
                      <th className="px-3 py-2">Estimated Cost (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.date} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2">{row.date}</td>
                        <td className="px-3 py-2">{formatTokens(row.invocations)}</td>
                        <td className="px-3 py-2">{formatTokens(row.inputTokens)}</td>
                        <td className="px-3 py-2">{formatTokens(row.outputTokens)}</td>
                        <td className="px-3 py-2">{formatTokens(row.totalTokens)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.estimatedCostUsd)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-gray-500 dark:text-gray-400" colSpan={6}>
                          No monitoring data in this time range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
