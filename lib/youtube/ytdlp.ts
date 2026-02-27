import { spawn } from 'child_process'

type RunYtDlpArgs = {
  args: string[]
  cwd?: string
}

function resolveYtDlpBin() {
  return process.env.YTDLP_BIN || 'yt-dlp'
}

function resolveYtDlpTimeoutMs() {
  const raw = process.env.YTDLP_TIMEOUT_MS
  if (!raw) return 60_000
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('YTDLP_TIMEOUT_MS 必须是正整数毫秒值')
  }
  return Math.floor(parsed)
}

export async function runYtDlp({ args, cwd }: RunYtDlpArgs): Promise<{ stdout: string; stderr: string }> {
  const bin = resolveYtDlpBin()
  const timeoutMs = resolveYtDlpTimeoutMs()

  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (buf) => {
      stdout += String(buf)
    })
    child.stderr.on('data', (buf) => {
      stderr += String(buf)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`yt-dlp 执行超时（>${timeoutMs}ms）`))
        return
      }
      if (code !== 0) {
        reject(new Error(`yt-dlp 执行失败（exit=${code}）：${stderr.slice(-1200)}`))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

export async function runYtDlpJson(args: string[], cwd?: string): Promise<any> {
  const fullArgs = ['-J', '--no-warnings', ...args]
  const { stdout } = await runYtDlp({ args: fullArgs, cwd })
  const text = String(stdout || '').trim()
  if (!text) {
    throw new Error('yt-dlp 未返回 JSON 数据')
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('yt-dlp 返回的 JSON 解析失败')
  }
}
