> 说明（2026-02-23）：本方案已进入历史版本。当前请优先参考  
> `docs/Professor 技术方案 v2（B站优先与BBDown字幕管线）.md`。

## 0. 背景与目标

### 0.1 背景

- 现有基础设施：
  - 已有一套后端系统部署在你自己的服务器（阿里云东京），包括：
    - `gateway`（统一登录：Apple / Google 等）
    - 官网
    - 产品 1：Taleweave（PC 端 + 后台）
  - 登录体系（Apple / Google）已经在 `gateway` 集成，其他产品通过共享登录使用。
- 新产品 Professor 的目标：
  - 针对「大量通过 B 站等视频学习」的个人，提供一个「看总结代替看视频 + 基于 Notebook 深度问答 + 笔记」的学习助手。
  - MVP 重点：
    1. 支持从 B 站系列/合集一次性导入一批视频。
    2. 对每个视频生成「中/深度总结 + 章节大纲（带时间戳）」。
    3. 把视频组织到 Notebook 中，支持基于单个、多个或整个 Notebook 视频进行问答。
    4. 提供类似 NotebookLM 的笔记空间（绑定视频/Notebook）。
  - LLM 方案：
    - 默认使用 Google Gemini（价格低，有赠金），同时支持 OpenAI 等多模型切换。
    - MVP 可能开源，需要让用户自己配置 API Key。
- 代码基线：
  - 后端能力计划复用 BibiGPT 的开源代码：BibiGPT 是一个基于 Next.js 构建的网页应用，支持对 B 站和 YouTube 视频进行字幕提取和 AI 总结。
  - BibiGPT 商业版已经有更完整的功能，但你当前可直接访问的是开源版（无 Notebook 功能），所以方案以「fork 开源 BibiGPT + 自己扩展 Notebook / QA / 笔记」为主。

### 0.2 非功能性前提

- 部署在你自己的服务器，而不是 Vercel / Supabase。
- 继续使用你现有的 PostgreSQL 实例。
- 登录 & 用户表由 `gateway` 负责，Professor 只接受 `gateway` 发放的登录态（JWT / Cookie），不重复做 OAuth。

---

## 1. 技术栈选型（含简单解释）

### 1.1 前端 & Web 应用框架

- **Next.js（App Router）**
  - 作用：基于 React 的 Web 应用框架，用来：
    - 写页面（路由、布局、SEO）；
    - 写后端接口（API routes / Route Handlers）；
    - 做服务器端渲染（SSR）和客户端渲染（SPA）；
  - 好处：一个项目里同时包含前端 UI 和轻量后端，减少多项目维护。
  - BibiGPT 本身就是基于 Next.js 搭建。
- **React**
  - 作用：构建 UI 组件，管理前端界面及状态。
  - 在 Next.js 里所有页面和组件本质上都是 React 组件。
- **TypeScript**
  - 在 JavaScript 上增加类型系统，提升可维护性和智能提示，对 AI coder 也更友好。
- **UI：Tailwind CSS + shadcn/ui**
  - Tailwind：原子化 CSS，快速开发响应式页面。
  - shadcn/ui：基于 Radix + Tailwind 的组件集，提供按钮、对话框、表单等基础组件，统一视觉风格。

简单理解：

- React = 画界面。
- Next.js = 带路由和 API 的完整 Web 应用框架。
- TypeScript = 帮你少踩 bug 的 JS。
- Tailwind + shadcn/ui = 高效好看的前端 UI 组合。

### 1.2 后端

- **后端运行环境**：Node.js（运行 Next.js 应用）
- **后端逻辑写法**：使用 Next.js 的 Route Handlers（`app/api/**/route.ts`），以 RESTful JSON API 形式对前端（以及未来 iOS）提供服务。
- **业务逻辑来源**：
  - Fork BibiGPT 的代码库，重用：
    - B 站（和 YouTube）的视频解析 / 字幕获取逻辑；
    - 调用 LLM 生成总结的 pipeline（改造成可配置模型、可持久化结果）。

### 1.3 数据库

- **PostgreSQL**（沿用你现有实例）
  - 新建一组 `professor_*` 的表。x
  - 未来如需向量检索，可安装 `pgvector` 扩展，但 MVP 不强依赖，可以先用「合并总结 + 单次长上下文」方案。

### 1.4 鉴权

- **统一登录由 gateway 实现**：
  - gateway 登录成功后，发放一个带有 `user_id` 的 JWT，存放在 Cookie 或 LocalStorage（推荐 HttpOnly Cookie）。
  - Professor 通过：
    - 反向代理共享 Cookie 域名，或
    - gateway 为 Professor 提供 `GET /whoami` 之类的接口。
  - 实际集成你已经在 Taleweave 里做过一次，这里只需要照搬思路。

本技术方案里默认：Professor 可以从请求里拿到可信的 `user_id`，无需重复实现 OAuth。

### 1.5 LLM & ASR

- **LLM Provider（抽象层）**
  - 支持：
    - Gemini（默认）
    - OpenAI（可选）
  - 在代码里统一通过接口 `LLMProvider`，背后通过配置选择不同实现。
- **ASR（语音转写）**
  - MVP 阶段策略：
    - 优先使用 B 站自带字幕（和 BibiGPT 一样）。
    - 如果没有字幕，可以暂时不做自动转写（或作为后期增强，用 Whisper）。

---

## 2. 系统架构概览

### 2.1 模块拆分

1. **Gateway（已有，Python）**
   - 做：Apple/Google 登录、用户主表、发 JWT。
   - 不改动。
2. **Professor（新，Next.js 应用）**
   - 负责：
     - Notebook / 视频 / 笔记 / 问答的页面及业务逻辑。
     - 调用 BibiGPT 派生的内部模块完成：B 站解析、字幕抓取、总结生成。
     - 调用 LLM Provider。
3. **PostgreSQL（已有实例）**
   - 增加 Professor 相关的表。
4. **LLM / ASR 外部服务**
   - Google Gemini API
   - OpenAI API（可选）
   - BibiGPT 目前基于 OpenAI，可参考其调用方式改成可配置。
5. **反向代理（Nginx 或其他）**
   - 路由：
     - `/gateway/*` → 现有后端
     - `/professor/*` → Next.js

### 2.2 请求流程举例

1. 用户通过 gateway 登录，拿到登录 Cookie（含 `user_id`）。
2. 访问 `https://yourdomain.com/professor`。
3. 反向代理将请求转发给 Professor。
4. Professor 在 middleware 里解析 Cookie 获取 `user_id`，注入到请求上下文。
5. 前端请求 `/api/notebooks` 等接口时，后端根据 `user_id` 做数据隔离。

---

## 3. 数据库表设计（带字段说明）

命名采用 `professor_*` 前缀，所有表字段尽量简单直白。

### 3.1 Notebook 表（professor_notebooks）

代表一个主题/方向的「知识本」，类似 NotebookLM 的 Notebook。

```sql
professor_notebooks (
  id              UUID        PK
  user_id         VARCHAR     -- 来自 gateway 的用户 ID（或 UUID），不在此表维护用户信息
  title           TEXT        -- Notebook 名称，如“独立开发者生态”
  description     TEXT NULL   -- 自我备注，可选
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
)
```

**用途**：

- 将一组视频组织在一个 Notebook 下，用于整体学习 & 问答。

---

### 3.2 视频表（professor_videos）

记录某个 Notebook 下的一条视频资源（主要是 B 站视频）。

```sql
professor_videos (
  id                UUID        PK
  notebook_id       UUID        FK → professor_notebooks.id
  user_id           VARCHAR     -- 冗余 user_id，方便按用户筛选
  platform          VARCHAR(32) -- 'bilibili' / 'youtube' / 'local' 等
  source_url        TEXT        -- 原始链接
  external_id       TEXT        -- 平台视频 ID，如 B 站的 bvid
  external_part     INTEGER     -- B 站多 P 视频时的第几 P，单 P 填 1
  title             TEXT        -- 视频标题
  duration_seconds  INTEGER     -- 时长（秒），可为空，解析不到时为 NULL
  cover_url         TEXT NULL   -- 封面 URL，可选
  language          VARCHAR(16) -- 识别语言，如 'zh', 'en' 等，可选
  status            VARCHAR(32) -- 'pending' / 'transcribing' / 'summarizing' / 'ready' / 'error'
  error_message     TEXT NULL   -- 错误信息记录
  created_at        TIMESTAMPTZ
  updated_at        TIMESTAMPTZ
)
```

**用途**：

- 显示 Notebook 下视频列表。
- 跟踪每个视频的处理状态。

---

### 3.3 转写表（professor_transcripts）

存储每个视频的文字转写（从字幕或 ASR 得到）。

```sql
professor_transcripts (
  id           UUID      PK
  video_id     UUID      FK → professor_videos.id
  raw_text     TEXT      -- 完整文本（按时间顺序拼接）
  segments     JSONB     -- 可选，数组形式 [{start: 秒, end: 秒, text: "..."}, ...]
  created_at   TIMESTAMPTZ
)
```

**用途**：

- 作为后续生成总结、章节大纲的输入。
- 如果未来要做更细粒度操作，也可以使用 `segments`。

---

### 3.4 总结表（professor_summaries）

存储针对某视频的总结和章节大纲，可以有不同模式（中度 / 深度）。

```sql
professor_summaries (
  id           UUID        PK
  video_id     UUID        FK → professor_videos.id
  mode         VARCHAR(16) -- 'medium' / 'deep'
  summary_text TEXT        -- 总结全文（对你来说，深度总结是主要使用的）
  outline      JSONB       -- 章节大纲数组，如：
                           -- [
                           --   { "index": 1, "start_seconds": 0,   "title": "导言", "brief": "介绍整体主题..." },
                           --   { "index": 2, "start_seconds": 180, "title": "Stripe 是什么", ... },
                           -- ]
  tokens_used  INTEGER     -- 记录调用模型用了多少 token（方便成本监控，可选）
  created_at   TIMESTAMPTZ
)
```

**用途**：

- 前端展示视频详情页（中/深度总结 + 章节大纲）。
- Notebook 级问答时的基础材料（会基于这些总结做检索或合并）。

---

### 3.5 检索片段表（professor_video_chunks）

用于后续（可选）的向量检索优化。MVP 阶段可以先暂时不用 pgvector，这张表可以先设计，后面再增强。

```sql
professor_video_chunks (
  id            UUID        PK
  video_id      UUID        FK → professor_videos.id
  notebook_id   UUID        FK → professor_notebooks.id
  mode          VARCHAR(16) -- 与 summary.mode 对齐，一般取 'deep'
  chunk_index   INTEGER     -- 第几段
  chunk_text    TEXT        -- 从深度总结中切出来的一小段（比如一节/一小节）
  embedding     VECTOR NULL -- pgvector 类型，存储该段文本向量（MVP 可以先不启用）
  created_at    TIMESTAMPTZ
)
```

**用途**：

- Notebook 级问答时，可以先在 `chunk_text` 上做关键词/全文检索，后期再升级为向量检索。
- embedding 列可以晚一点再启用。

---

### 3.6 笔记表（professor_notes）

用户在视频或 Notebook 下写的自己的笔记。

```sql
professor_notes (
  id           UUID        PK
  user_id      VARCHAR     -- 来自 gateway
  notebook_id  UUID        FK → professor_notebooks.id
  video_id     UUID NULL   -- 若为某个视频的笔记则填 video_id，若为 Notebook 级笔记则为 NULL
  title        TEXT NULL   -- 短标题，可选
  content      TEXT        -- 笔记正文
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ
)
```

**用途**：

- 视频详情页 / Notebook 页右边的笔记区。
- 未来可以做搜索和复盘。

---

### 3.7 任务表（professor_jobs）（可选但建议）

为了处理长耗时任务（转写 / 总结），可以设计一个简单任务表，用于后台 Worker 消费。

```sql
professor_jobs (
  id           UUID        PK
  job_type     VARCHAR(32) -- 'transcribe' / 'summarize'
  video_id     UUID        FK → professor_videos.id
  status       VARCHAR(32) -- 'pending' / 'running' / 'done' / 'error'
  error_message TEXT NULL
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ
)
```

**用途**：

- 将导入后的视频放入处理队列；
- 后台脚本/Worker 定时轮询 `pending` 任务进行处理。

---

### 3.8 LLM 配置表（professor_llm_configs）（支持用户配置 API Key）

用于开源版场景，让每个用户配置自己的 API Key（Gemini / OpenAI 等）。

```sql
professor_llm_configs (
  id              UUID        PK
  user_id         VARCHAR     -- 来自 gateway
  provider        VARCHAR(32) -- 'gemini' / 'openai' / 'custom'
  api_key_enc     TEXT        -- 加密或简单混淆后的 key（具体加密方式由你现有后端策略决定）
  is_default      BOOLEAN     -- 是否为该用户当前默认配置
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
)
```

**用途**：

- 用户在设置里输入自己 OpenAI / Gemini Key。
- 在调用 LLM 时，根据当前用户查表，若无配置则 fallback 到系统级 Key（环境变量）。

---

## 4. 与 BibiGPT 的集成方式

### 4.1 工程结构

1. **Fork BibiGPT 仓库**（推荐使用较新的 fork，如 QianXuZOZ/BibiGPT 或 Yuiffy/BiliGPT）。
2. 把它作为 Professor 的「初始项目」，保留：
   - B 站 / YouTube URL 解析逻辑；
   - 字幕拉取逻辑（包括从 B 站接口获取字幕的部分）；
   - 调用 LLM 生成总结的 pipeline（services / utils 层）。
3. 对前端部分进行较大重写：
   - 放弃原有单页面 UI，改成：Notebook 列表页 / Notebook 详情页 / 视频详情页 / 设置页。
   - 仍然复用 Tailwind / shadcn/ui 作为样式基础。

### 4.2 后端改造重点

1. **抽象 LLM 调用层**
   - 将原来 BibiGPT 直接调用 OpenAI Chat API 的代码提取成 `LLMProvider` 接口。
   - 实现两个 Provider：
     - GeminiProvider
     - OpenAIProvider
   - 在生成总结 / 问答时，只调用 `llmProvider.chat(...)`。
2. **持久化总结结果**
   - BibiGPT 当前模式更偏「即时总结」，结果可能存 Redis 或直接返回。
   - 在 Professor 中，需要：
     - 在完成总结后，把结果写入 `professor_summaries`；
     - 将章节大纲写入 `outline` 字段；
     - 之后前端直接从 DB 读取，而不是每次重新总结。
3. **增加 Notebook & 视频管理 API**
   - 新增 `/api/notebooks`, `/api/videos` 相关接口，操作上述表。
4. **引入用户上下文**
   - 当前 BibiGPT 基本是公开使用，Professor 需要按 user_id 做数据隔离：
     - 所有 DB 查询都需要 `WHERE user_id = current_user_id` 限定。

---

## 5. LLM 支持与“世界知识”策略

### 5.1 多模型支持思路

- 在代码里定义统一接口（伪代码）：

```plain
interface LLMProvider {
  chat(params: {
    model: string;
    messages: { role: "system" | "user" | "assistant"; content: string }[];
  }): Promise<string>;
}
```

- 通过配置决定使用哪个 Provider：
  - 先查 `professor_llm_configs`（用户级）；
  - 没有则用环境变量 `LLM_PROVIDER_DEFAULT` 和对应 `API_KEY`。

### 5.2 关于「召回 + 世界知识」的实际策略（简化版）

你的反馈是：

现在我把一个视频的转写发给你，你直接回答就很好，不需要「只根据资料库回答」这类限制性的提示词。

所以在设计中：

1. **单视频场景：**
   - 直接使用该视频的深度总结作为 context：
     - Prompt 可以简单写成：
       - system: “你是一个帮助用户学习视频内容的 AI 助手。”
       - user: “这是这个视频的总结：xxx。我的问题是：yyy。”
   - 不需要告诉模型「只能基于这些内容回答」；
   - 模型自然会结合 context + 自身知识给出有深度的答案。
2. **多视频 / Notebook 场景（不使用复杂 RAG 也能先跑）：**
   - MVP 简化方案：
     - 对 Notebook 中选定的视频，取它们的深度总结或精简版总结；
     - 如果总长度不超过模型的上下文（Gemini 1.5 有很大上下文空间），可以直接拼接后一起给模型；
     - 提示词类似：
       - system: “你是帮助用户总结和理解多个视频内容的学习助手。”
       - user: “以下是若干视频的总结：A:... B:... C:...。请基于这些内容和你已有的知识，回答问题：yyy。”
   - 当视频很多、总长度超上下文时再考虑：
     - 使用简单的关键词筛选 / 分段 summarization，而不是一上来就做复杂的向量检索。

结论：

- MVP 不强制上 RAG/向量检索，可先基于「总结 + 大上下文模型」的方式，如果遇到上下文超限再做优化。
- 提示词不做“仅限资料库”的硬约束，让模型像你现在体验的一样自然发挥。

---

## 6. B 站系列导入设计

### 6.1 概念

- 用户在 Professor Notebook 页面中，输入一个 B 站链接，该链接可能是：
  - 单个视频；
  - 分 P 视频；
  - 合集 / 播放列表；
  - 稍后再看列表等。
- BibiGPT 开源版已经支持对 B 站/YouTube 视频 URL 的解析与字幕读取。

### 6.2 设计思路

1. 在 BibiGPT 代码中找到 B 站解析模块（一般在 `lib/` 或 `utils/` 下），抽成 `BilibiliService`：
   - `parseUrl(url) -> { type: 'single' | 'playlist', items: [...] }`
   - `getSubtitles(external_id, part)` → 返回字幕/转写。
2. Professor 的导入 API：

- `POST /api/notebooks/{id}/import-bilibili`
  - body: `{ url: string }`
  - 步骤：
    1. 调用 `BilibiliService.parseUrl(url)` 获取该链接下所有视频 item（标题、bvid、时长等）。
    2. 返回列表给前端显示，让用户勾选需要导入的项。
- `POST /api/notebooks/{id}/import-bilibili/confirm`
  - body: `{ items: [{ external_id, external_part, title, duration, cover_url }] }`
  - 步骤：
    1. 为每个 item 创建 `professor_videos` 记录，status=`pending`。
    2. 往 `professor_jobs` 写入对应的 `transcribe` / `summarize` 任务。

1. 后台 Worker：
   - 定时扫描 `professor_jobs` 中的 pending 任务，依次：
     - 调 `BilibiliService.getSubtitles` 获取字幕（或下载音频再做 ASR）；
     - 写入 `professor_transcripts`；
     - 调 LLMProvider 做中/深度总结和章节大纲，写入 `professor_summaries`；
     - 更新 `professor_videos.status = 'ready'`。

---

## 7. 开发阶段建议（给 AI coder 的具体落地顺序）

1. **项目初始化**
   - Fork BibiGPT 代码库，在你的 Git 仓库里新建 `professor` 项目。
   - 确保可以在本地 `npm install && npm run dev` 跑起来原始功能（总结单个视频）。
2. **接入 PostgreSQL（Professor 相关表）**
   - 选择一个 ORM（推荐 Prisma，TypeScript 体验好）。
   - 在现有 PostgreSQL 上创建文档中列出的各个 `professor_*` 表。
   - 在项目中配置数据库连接。
3. **抽象 LLMProvider**
   - 抽离 BibiGPT 现有的 OpenAI 调用逻辑。
   - 增加 `GeminiProvider`，实现 `chat` 方法。
   - 使用环境变量切换默认 Provider。
4. **实现「单个视频 → 转写 + 总结 + 落库」链路**
   - 新增 API：
     - `POST /api/videos/import-single`
   - 流程：
     - 解析 B 站 URL → 获取字幕 → 写入 `professor_transcripts`；
     - 调 LLM → 生成中/深度总结 + outline → 写入 `professor_summaries`；
     - 更新 `professor_videos` 状态；
     - 前端做一个简单页面展示总结内容。
5. **增加 Notebook 模块**
   - 实现 `professor_notebooks` 的 CRUD API；
   - 在前端实现 Notebook 列表 + Notebook 详情（视频列表）。
6. **实现 B 站系列导入**
   - 整合 `BilibiliService.parseUrl`；
   - 实现导入列表 → 勾选 → 批量创建 `professor_videos` + job 的逻辑。
7. **实现问答 API（单视频级）**
   - `POST /api/videos/{id}/qa`：
     - 从 `professor_summaries` 读出深度总结；
     - 构造 prompt（不限制模型只能使用这些内容）；
     - 返回答案；
   - 前端增加简单 Chat 区。
8. **实现 Notebook 级问答（MVP 简化版）**
   - `POST /api/notebooks/{id}/qa`：
     - 根据请求范围（全部视频/选中视频），取出对应视频的深度总结；
     - 长度不超上下文时直接拼接给大模型；
     - 超过时暂时采用：按每个视频先压缩为短摘要，再拼接。
   - 同样不设置「只能基于资料库」的硬约束，让模型自然使用自身知识扩展。
9. **添加笔记功能**
   - 实现 `professor_notes` 的 CRUD API；
   - 在视频详情页右侧添加笔记面板；
   - 在 Notebook 详情页添加「所有笔记列表」视图。
10. **添加用户 API Key 配置（可放在稍后）**
    - 实现 `professor_llm_configs` 表与 `/api/settings/llm` 接口；
    - 修改 LLMProvider 逻辑：若该用户有配置，则优先使用用户 Key。

---

这样一份技术方案，AI coder 看到后应该可以：

- 理解为什么选 Next.js / React / TS / Tailwind / shadcn；
- 明白要从 BibiGPT 复用哪些后端能力；
- 清楚每张表的用途和字段含义；
- 知道 LLM 多模型配置的思路；
- 知道 B 站系列导入、总结、问答的完整调用链。

如果你后面想，我也可以再单独帮你把「API 设计」写成一份 `api.md`（列出具体 URL、请求体和响应示例），方便你直接贴给 AI coder 生成代码。
