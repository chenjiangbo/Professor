# BibiGPT 代码概览与实现原理

## 核心架构

- 技术栈：Next.js（Pages 路由，Edge Runtime），React + Tailwind/shadcn，OpenAI Chat Completions（gpt-3.5-turbo），Upstash Redis（缓存与限流），Supabase Auth，LemonSqueezy 许可证校验。
- 入口页面：`pages/[...slug].tsx`（`pages/index.tsx` 仅转发），提交视频链接与生成配置后调用后端 `/api/sumup`。
- API 中间件：`middleware.ts` 负责授权与限流，并做结果缓存命中直接返回。
- 总结管线：字幕获取 → Prompt 构造 → 调 OpenAI（可流式 SSE）→ 结果缓存到 Redis → 前端展示。

## 前端流程（`pages/[...slug].tsx` + `hooks/useSummarize.ts`）

- 收集用户输入：视频 URL、摘要参数（语言/字数/大纲层级/emoji/时间戳等），可存 LocalStorage。
- URL 解析：`get-video-id` 识别 YouTube；B 站用 `utils/extractUrl`/`extractPage`，短链 b23.tv 会请求 `/api/b23tv`（代码已被移除，需注意）。
- 调用 `useSummarize.summarize`：
  - POST `/api/sumup` 携带 `videoConfig`（videoId、service、detailLevel 等）与 `userConfig`（userKey、shouldShowTimestamp）。
  - 支持流式读取响应，边收边渲染；非流式则等待完整 JSON。

## 后端流程（`pages/api/sumup.ts`）

1. 解析请求体，校验 videoId。
2. 字幕抓取：`fetchSubtitle(videoConfig, shouldShowTimestamp)`
   - 若无字幕且无视频描述，返回 501。
   - 将字幕裁剪压缩：`getSmallSizeTranscripts` 或直接用 description。
3. Prompt 生成：`getUserSubtitlePrompt` 或 `getUserSubtitleWithTimestampPrompt`，支持输出语言/emoji/大纲层级/字数约束。
4. OpenAI 调用：`fetchOpenAIResult`（模型固定 gpt-3.5-turbo，max_tokens 由 detailLevel 或 600/800），可流式。
5. 返回 SSE 流或 JSON。

## 中间件与配额控制（`middleware.ts` + `lib/upstash.ts`）

- 使用 Upstash RateLimit：
  - 未登录/无 key 的 IP：`FREE_LIMIT_COUNT/天`。
  - 自带 OpenAI key：`ratelimitForApiKeyIps`。
  - 已登录免费账户：`LOGIN_LIMIT_COUNT/天`。
- 用户 key 处理：
  - 如果是 OpenAI key：仅限流，不校验。
  - 否则按 Lemon 许可证校验：`validateLicenseKey`。
- 缓存：对 `getCacheId(videoConfig)` 先查 Redis；命中直接返回 JSON。

## 字幕抓取实现

- `lib/fetchSubtitle.ts` 根据 service 分发：
  - **B 站** `fetchBilibiliSubtitle(videoId, pageNumber, shouldShowTimestamp)`
    - 获取视频信息：`https://api.bilibili.com/x/web-interface/view`，必要时再拉 `x/player/v2` 获取分 P 字幕列表。
    - 需要环境变量 `BILIBILI_SESSION_TOKEN`（可逗号分隔多份 SESSDATA，随机取样）。
    - 选择 zh-CN 或首条字幕；无字幕则返回 desc/dynamic 文本；未做 ASR。
    - 时间戳处理：`reduceBilibiliSubtitleTimestamp`。
  - **YouTube** `fetchYoutubeSubtitle(videoId, shouldShowTimestamp)`
    - 通过 `savesubs.com/action/extract` 拿字幕列表（需 `SAVESUBS_X_AUTH_TOKEN`）。
    - 择优 zh-CN/English/自动字幕，按需下载 json/txt；时间戳处理：`reduceYoutubeSubtitleTimestamp`。
    - 无字幕时直接返回 null（未做 ASR）。

## Prompt 关键点（`lib/openai/prompt.ts`）

- `getUserSubtitlePrompt`：输出模板包含 Summary/Highlights，支持 emoji、最大层级（outlineLevel），子弹数（sentenceNumber），字数控制（detailLevel 映射）。
- `getUserSubtitleWithTimestampPrompt`：要求每条带起始秒数与字数限制。
- `limitTranscriptByteLength`/`getSmallSizeTranscripts`：确保字幕总字节不超阈值（默认 6200 字节，递归随机半采样+补全）。

## 结果处理与缓存（`lib/openai/fetchOpenAIResult.ts`）

- SSE 流解析：`eventsource-parser` 逐 chunk 推送到前端，同时累计到 tempData，结束后写 Redis 缓存。
- 非流式：直接 trim 结果（`trimOpenAiResult`）并缓存。

## 依赖与配置要点

- 环境变量（示例）：`OPENAI_API_KEY`、`BILIBILI_SESSION_TOKEN`、`SAVESUBS_X_AUTH_TOKEN`、`UPSTASH_RATE_REDIS_REST_URL/TOKEN`、`LEMON_API_KEY`、Supabase/Sentry 等。
- Next Edge 函数默认不含 Node 内置模块；`package.json` 中 `browser` 字段禁用 fs/path/os。

## 当前显著限制

- 未内置 ASR：B 站/YouTube 仅在存在字幕或描述时可用，无字幕的视频返回 501。
- b23.tv 短链 API 已在 Changelog 标注移除，前端仍调用 `/api/b23tv`，需补充或移除。
- 模型固定 gpt-3.5-turbo，未暴露多模型选择。
- 仅支持 B 站/YouTube，其他占位 service（podcast/meeting/local）未实现。
