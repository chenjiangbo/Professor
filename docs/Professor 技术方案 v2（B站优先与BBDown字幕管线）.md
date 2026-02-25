# Professor 技术方案 v2（B 站优先与 BBDown 字幕管线）

> 版本：v2.0  
> 日期：2026-02-23  
> 目标：在保留现有 Notebook 结构能力的前提下，优先完成“B 站视频导入 = 字幕获取 + 大纲生成 + 逐章深度讲解”的核心链路。

---

## 1. 范围调整（Scope）

### 1.1 In Scope（本轮必须实现）

1. 平台聚焦 B 站（Bilibili）。
2. 视频导入主链路改为：
   - 解析 B 站链接（单视频 / 多 P / 合集）
   - 使用 BBDown 拉取字幕
   - 字幕规范化与语言回退
   - 基于字幕生成大纲
   - 按大纲逐章生成深度讲解
   - 将结果写入现有 Notebook/Video 结构
3. Notebook 的组织、聊天、笔记、视频管理结构保持不变。

### 1.2 Out of Scope（本轮暂不做）

1. YouTube / Podcast / 本地音视频导入。
2. 无字幕情况下的本地 ASR（Whisper 本地转写）作为备选，不进入本轮主实现。
3. 复杂检索增强（向量检索/多跳检索）不作为首要里程碑。

---

## 2. 业务目标与成功标准

### 2.1 业务目标

1. 导入 B 站视频后，稳定产出“可学习”的结构化内容（大纲 + 逐章讲解）。
2. 让“导入即学习材料准备完成”，替代当前“导入后仍需多步操作”的体验。

### 2.2 成功标准（验收）

1. 对有字幕视频，导入成功率 > 95%。
2. 对无人工中文字幕视频，可回退到 AI 字幕或英文字幕，且导入不失败（状态为 `ready` 或 `ready_with_fallback`）。
3. 每个视频产出：
   - `outline`（章节数组）
   - `deep_explanations`（逐章讲解）
4. Notebook 现有功能（视频列表、问答、笔记）无回归。

---

## 3. 字幕策略（核心）

## 3.1 数据源与工具

- 主工具：BBDown（命令行）
- 运行方式：由服务端调用本机/容器内 BBDown 执行，获取字幕文件后解析。

### 3.2 字幕优先级（严格按策略）

按以下顺序选择字幕，命中即停止：

1. 人工中文字幕（zh-CN / zh-Hans / zh）
2. AI 中文字幕
3. 人工英文字幕（en）
4. AI 英文字幕

> 解释：符合“优先中文字幕；允许 AI 字幕；没有中文字幕则英文”的要求。

### 3.3 无字幕处理

- 若 BBDown 未返回任何可用字幕：
  - 当前阶段：标记 `no-subtitle` 并记录原因（可重试）。
  - 可选预留：后续接入 ASR 回退。

---

## 4. 导入与生成流水线设计

### 4.1 总体流程

1. 用户在 Notebook 输入 B 站链接并确认导入。
2. 后端创建 `videos` 记录，状态 `processing_subtitle`。
3. 异步任务调用 `BBDownSubtitleProvider` 下载并解析字幕。
4. 字幕规范化（时间轴、去噪、分段）。
5. 调用 LLM 生成章节大纲（Outline）。
6. 以章节为单位并行/串行调用 LLM 生成 `deep_explanations`。
7. 聚合写库：`transcript + outline + deep_explanations + summary`。
8. 状态更新为 `ready`（或 `ready_with_fallback`）。

### 4.2 详细步骤

#### Step A：链接解析

- 仅接受 B 站域名（`bilibili.com`, `b23.tv` 先解短链再继续）。
- 解析出 `bvid`、`p`（多 P）信息。
- 多 P 场景：每个 P 作为一条可导入项。

#### Step B：字幕下载（BBDown）

- 新增服务层：`lib/subtitle/bbdown.ts`
- 对每个目标视频执行：
  - 调 BBDown 获取字幕文件到临时目录
  - 扫描字幕元数据（语言、是否 AI、文件路径）
  - 按优先级选中最佳字幕
- 结果对象：
  - `selectedLanguage`
  - `selectedSource`（human/ai）
  - `subtitlePath`
  - `fallbackLevel`（0~3）

#### Step C：字幕标准化

- 统一转换到内部结构：

```ts
{
  items: Array<{ startSec: number; endSec: number; text: string }>,
  plainText: string,
  language: 'zh' | 'en',
  source: 'human' | 'ai',
}
```

- 处理规则：
  - 去 HTML 标签、控制字符
  - 合并超短句
  - 保留时间轴用于后续章节定位

#### Step D：大纲生成

- Prompt 输入：标题 + 标准化字幕 + 目标章节数量区间
- Prompt 输出（JSON）：

```json
[
  {
    "chapter_index": 1,
    "title": "...",
    "start_sec": 0,
    "end_sec": 320,
    "summary": "..."
  }
]
```

- 强约束：必须返回合法 JSON（失败自动重试 1~2 次）。

#### Step E：逐章深度讲解

- 对每章提取对应字幕片段，逐章调用 LLM：
  - 解释核心概念
  - 给出上下文与因果
  - 给出术语注释/延伸阅读点
- 输出结构：

```json
[
  {
    "chapter_index": 1,
    "deep_explanation": "...",
    "key_points": ["..."],
    "terms": [{ "name": "...", "explain": "..." }]
  }
]
```

#### Step F：存储与展示

- 写入 `videos`：
  - `transcript`
  - `chapters`（大纲 + 深度讲解合并）
  - `summary`（整视频综述）
  - `status`
- 前端视频详情页优先展示“章节+讲解”而非单段摘要。

---

## 5. 数据模型调整（最小侵入）

当前 `videos` 已有 `summary`、`chapters`、`transcript`，建议先不拆新表，仅扩展 `chapters` JSON 结构。

### 5.1 `videos.status` 扩展值

- `processing_subtitle`
- `processing_outline`
- `processing_chapters`
- `ready`
- `ready_with_fallback`
- `no-subtitle`
- `error`

### 5.2 `videos.chapters` JSON 结构（v2）

```json
[
  {
    "chapter_index": 1,
    "title": "...",
    "start_sec": 0,
    "end_sec": 320,
    "summary": "...",
    "deep_explanation": "...",
    "key_points": ["..."],
    "terms": [{ "name": "...", "explain": "..." }]
  }
]
```

### 5.3 可选新增字段（建议）

- `videos.subtitle_language`（zh/en）
- `videos.subtitle_source`（human/ai）
- `videos.subtitle_fallback_level`（0~3）
- `videos.pipeline_version`（如 `v2-bbdown`）

---

## 6. API 设计调整

### 6.1 保留 API

- `GET /api/notebooks`
- `GET /api/notebooks/:id/videos`
- `GET/POST /api/notes`
- `POST /api/chat`

### 6.2 调整 API

1. `POST /api/videos/preview`

- 输入仅接受 B 站链接。
- 返回多 P 结果，不再处理 YouTube。

2. `POST /api/videos`

- 导入后立即异步启动 v2 管线（BBDown + Outline + Chapter Explain）。
- 导入参数新增：
  - `chapterTargetCount`（可选）
  - `explainDepth`（可选）

3. `POST /api/videos/:id/summarize`

- 语义改为“重新生成章节讲解（rebuild）”，而不是旧的单段总结。

---

## 7. 代码结构改造建议

### 7.1 新增模块

1. `lib/subtitle/bbdown.ts`

- `fetchBilibiliSubtitlesByBBDown()`
- `selectBestSubtitle()`

2. `lib/subtitle/normalizeSubtitle.ts`

- 字幕清洗、分句、时间轴标准化

3. `lib/llm/outline.ts`

- `generateOutlineFromTranscript()`

4. `lib/llm/chapterExplain.ts`

- `generateChapterExplanations()`

5. `lib/pipeline/importVideoV2.ts`

- 编排整个导入流水线

### 7.2 现有模块调整

1. `lib/fetchSubtitle.ts`

- 改为 B 站专用分发，YouTube 分支下线或标记废弃。

2. `pages/api/videos/preview.ts`

- 移除 YouTube 分支。

3. `pages/api/videos/index.ts`

- 导入后调用 `importVideoV2`。

4. `pages/notebooks/[id].tsx`

- 导入文案与提示改为“仅支持 B 站”。

---

## 8. Prompt 设计（v2）

### 8.1 Outline Prompt（结构化）

目标：稳定返回可切章 JSON。
要求：

1. 章节覆盖完整时间轴。
2. 不重叠、不遗漏。
3. 标题简洁、学习导向。

### 8.2 Chapter Explain Prompt（教学化）

每章输出：

1. 章节核心结论
2. 关键论证链路
3. 术语解释
4. 与前后章节关系
5. 学习建议（可选）

> 注意：Prompt 输出必须要求 JSON，便于前端渲染与问答引用。

---

## 9. 任务执行与重试机制

### 9.1 异步模型

- 当前可先沿用“接口内启动异步 IIFE”的轻量方式。
- 后续建议迁移到队列（BullMQ/自建 worker）以提升稳定性。

### 9.2 重试策略

1. BBDown 失败：重试 2 次（指数退避）。
2. LLM JSON 解析失败：重试 1~2 次。
3. 某章节讲解失败：记录章节错误并继续其他章节，最终状态 `ready_with_fallback`。

---

## 10. 可观测性与运维

### 10.1 日志

每个视频记录 `trace_id`，关键节点打印：

- subtitle_fetch_start/end
- outline_start/end
- chapter_explain_start/end
- pipeline_done

### 10.2 指标

- 导入总耗时
- 字幕回退层级分布
- 章节生成失败率
- 重新生成触发率

---

## 11. 里程碑与交付计划

### M1（1~2 天）

1. B 站-only 入口限制（preview/import）
2. BBDown provider 接入
3. 字幕优先级策略落地

### M2（2~3 天）

1. Outline 生成
2. 逐章讲解生成
3. `chapters` 结构落库

### M3（1~2 天）

1. 视频详情页按章节展示
2. 重生成功能（rebuild）
3. 错误态与回退提示完善

---

## 12. 风险与应对

1. BBDown 不同版本输出格式差异

- 方案：封装适配层，避免业务逻辑依赖 CLI 原始文本。

2. AI 字幕质量波动

- 方案：章节切分先按时间，再做语义修正；必要时降低章节粒度。

3. LLM 输出不稳定

- 方案：JSON Schema 校验 + 重试 + 兜底模板。

4. 长视频 token 成本

- 方案：先做时间分段再逐章处理，避免整段一次性提交。

---

## 13. 与现有 Notebook 功能的关系

不变部分：

1. Notebook CRUD
2. 视频列表组织
3. 笔记系统
4. Notebook 级聊天问答入口

变化部分：

1. 视频导入后的内容产物，从“单段摘要优先”改为“章节化深度讲解优先”。
2. 视频上下文质量提升后，Notebook QA 的答案质量会同步提升。

---

## 14. 实施结论

v2 的核心不是新增更多入口，而是把“B 站视频导入”做成稳定、可学习、可复用的知识生产流水线：

**B 站链接 -> BBDown 字幕 -> 大纲 -> 逐章深度讲解 -> Notebook 知识资产**

这是当前阶段的最高优先级路径。

---

## 15. 新增需求补充（批量导入 + 前端非阻塞）

### 15.1 批量 URL 导入（同一次粘贴）

导入框支持一次粘贴多个 URL，支持以下分隔符：

1. 换行
2. 空格
3. 逗号（`,` / `，`）
4. 分号（`;` / `；`）

处理规则：

1. 前端先本地拆分去重（trim + normalize）。
2. 仅保留 B 站链接，非法链接就地标红并提示。
3. 支持一次性提交为“批任务（batch）”。

### 15.2 前端非阻塞（核心体验）

目标：用户提交导入后可继续进行 Notebook 其他操作（问答、记笔记、浏览），无需等待字幕下载和 LLM 生成完成。

实现策略：

1. 导入接口返回 `batchId` + 每个视频的初始状态。
2. 后台异步执行（任务队列/worker）。
3. 前端通过轮询或 SSE 订阅任务进度，增量刷新视频状态。
4. 页面右下角增加“后台任务面板”，展示：
   - 排队中 / 下载字幕 / 生成大纲 / 逐章解读 / 完成 / 失败
   - 可点击失败重试

---

## 16. 大模型提示词策略（完整覆盖 + 深度增强）

> 目标不是“简短摘要”，而是“提高学习效率但不遗漏原视频字幕信息”。

### 16.1 两阶段生成（必须）

1. 阶段 A：先生成大纲（Coverage-first）
2. 阶段 B：再按大纲逐章深度解读（Depth-first）

这样做的原因：

1. 先锁定“覆盖边界”，减少遗漏。
2. 按章处理可控 token 成本，并提高解释深度。
3. 为后续 QA 提供稳定结构化上下文。

### 16.2 阶段 A（大纲）Prompt 约束

关键要求：

1. 大纲必须覆盖字幕时间轴全范围（首句到末句）。
2. 章节不能重叠，不能留空档。
3. 每章必须有“字幕证据摘要”（来自该章字幕，而非模型臆测）。
4. 输出必须是严格 JSON。

建议输出字段：

1. `chapter_index`
2. `title`
3. `start_sec`
4. `end_sec`
5. `subtitle_coverage_note`（说明本章覆盖了字幕中哪些关键点）

### 16.3 阶段 B（逐章解读）Prompt 约束

关键要求：

1. 不遗漏本章字幕中的关键信息点（先“忠实覆盖”，再“知识增强”）。
2. 在忠实覆盖基础上，用模型知识补充背景、原理、对比与应用场景。
3. 如启用联网搜索，必须将“外部补充”与“字幕原文信息”分开标注。
4. 输出结构化 JSON，便于前端渲染。

建议输出字段：

1. `chapter_index`
2. `core_takeaways`
3. `subtitle_faithful_explanation`
4. `knowledge_enhancement`
5. `external_evidence`（可选，含来源标题/链接）
6. `terms_and_concepts`
7. `practical_examples`

### 16.4 覆盖率自检（防遗漏）

每章解读后增加一个轻量“自检步骤”：

1. 输入：本章字幕 + 本章解读。
2. 输出：`coverage_score` 与遗漏点列表。
3. 若低于阈值（如 0.9），自动触发一次补全重写。

---

## 17. UI 功能设计（Notebook 内）

### 17.1 导入入口（改造）

位置：Notebook 详情页 `Import` 弹窗。

改造点：

1. 单行输入改为多行 `textarea`（placeholder 提示可粘贴多条 URL）。
2. 点击 `解析` 后展示列表：
   - 每条 URL 的解析状态
   - 视频标题（预览成功后）
   - 多 P 展开项（可全选/反选）
3. `开始导入` 按钮提交批任务，立即关闭或最小化弹窗。

### 17.2 后台任务面板（新增）

位置：Notebook 页面右下角浮层或侧边抽屉。

信息层级：

1. 批任务级：总数、完成数、失败数、预计剩余时间。
2. 视频级：当前阶段与进度。
3. 操作：失败重试、查看日志摘要、跳转视频详情。

### 17.3 视频列表状态可视化

在视频卡片增加细粒度状态标签：

1. `queued`
2. `subtitle`
3. `outline`
4. `chapter-explaining`
5. `ready`
6. `ready_with_fallback`
7. `error`

### 17.4 视频详情页展示优先级

按以下顺序展示：

1. 章节导航（时间轴）
2. 每章深度讲解（可折叠）
3. 原字幕对照（可展开）
4. “本章补充来源”（若启用了联网增强）

---

## 18. 后端接口与任务模型补充

### 18.1 API 建议

1. `POST /api/videos/import-batch`
   - 输入：`notebookId` + `urls[]`
   - 输出：`batchId` + `items[]`
2. `GET /api/import-batches/:batchId`
   - 返回批任务总体进度
3. `GET /api/import-batches/:batchId/items`
   - 返回视频级进度与错误信息
4. `POST /api/import-batches/:batchId/retry-failed`
   - 一键重试失败项

### 18.2 任务状态机

`queued -> parsing -> subtitle -> outline -> chapter_explaining -> done`
错误分支：
`* -> failed`（记录 `error_stage`、`error_message`、`retry_count`）

---

## 19. 开发计划（按优先级）

### Sprint 1：批量导入与异步化（3~4 天）

1. 前端导入框支持多 URL 拆分与校验。
2. 新增 `import-batch` 接口与批任务表（或先用 Redis/DB 轻量实现）。
3. 后台 worker 能异步处理任务，前端可离开弹窗继续操作。
4. Notebook 页面加任务面板 + 状态刷新。

交付验收：

1. 一次粘贴 10 条 URL 可提交。
2. 提交后用户能继续使用页面，不阻塞。
3. 可看到每条视频进度与失败原因。

### Sprint 2：两阶段 Prompt 与章节深读（4~5 天）

1. 实现“先大纲后解读”管线。
2. 引入覆盖率自检与低分重写。
3. 完成章节结构入库与详情页渲染。

交付验收：

1. 每视频都有结构化章节。
2. 每章有深度解读且可追溯字幕内容。
3. 大纲与解读的 JSON 结构稳定可解析。

### Sprint 3：联网增强与质量提升（2~3 天）

1. 为章节解读增加可选联网增强开关。
2. 区分“字幕信息”与“外部补充”。
3. 增加重试与审计日志能力。

交付验收：

1. 启用联网时，解读深度明显提升。
2. 输出中可区分原文信息与外部知识来源。

---

## 20. 本轮实施原则

1. 优先把 B 站导入链路做深做稳，不扩平台。
2. 优先保证“完整覆盖”再追求“文风和压缩率”。
3. 前端必须非阻塞，导入是后台任务，不占用用户操作流。

---

## 21. 实现更新（2026-02-23）

### 21.1 导入展开策略（已落地）

`POST /api/videos/import-batch` 新增参数：

1. `expandMode="current"`（默认）：每个 URL 仅导入当前分 P；若 URL 无 `?p=`，默认导入第一页。
2. `expandMode="all"`：展开该 URL 对应的所有分 P/合集条目后批量导入。
3. 批任务安全阈值：展开后项目数超过 `MAX_IMPORT_BATCH_ITEMS`（默认 200）则拒绝提交，避免一次导入过大。

前端导入弹窗已增加“Import scope”单选：

1. Only current video/page（推荐，默认）
2. Expand all pages/episodes

### 21.2 两阶段生成管线（已落地）

后台导入任务改为：

1. `processing_subtitle`：BBDown 拉字幕（优先级：中文字幕 > 中文 AI > 英文 > 英文 AI）。
2. `processing_outline`：LLM 先输出 JSON 大纲（overview + chapters + coverage_audit）。
3. 逐章调用 LLM 生成深度讲解，并写入 `videos.chapters`。
4. 汇总章节目录写入 `videos.summary`，最终状态 `ready`。

实现文件：

1. `lib/openai/videoInterpretation.ts`
2. `lib/import/processVideoImport.ts`
3. `lib/subtitle/bbdown.ts`
4. `pages/api/videos/import-batch.ts`
5. `pages/notebooks/[id].tsx`

### 21.3 当前未完成项

1. 覆盖率自检与低分自动补写（待补）。
2. 联网增强来源的结构化落库（待补）。
3. 导入前“展开数量预估”提示（待补）。

### 21.4 BBDown 登录态持久化（已落地）

新增“手动填写 SESSDATA / Cookie 并长期保存”能力：

1. 新增 `app_settings` 表，保存 `bbdown_auth` 配置。
2. 凭据采用 AES-256-GCM 加密保存，前端仅显示掩码值。
3. 新增接口：
   - `GET /api/settings/bbdown-auth`
   - `POST /api/settings/bbdown-auth`
   - `POST /api/settings/bbdown-auth/validate`
   - `DELETE /api/settings/bbdown-auth`
4. 设置页 `/settings` 新增 **Bilibili / BBDown Login** 卡片，可执行 Save/Validate/Clear。
5. BBDown 下载字幕时自动注入持久化 Cookie；legacy 字幕回退链路也优先读取该配置。

运维要求：

1. 生产环境请固定配置 `CREDENTIAL_ENCRYPTION_KEY`，避免密钥变更导致历史凭据无法解密。
2. `BILIBILI_SESSION_TOKEN` 仅保留为兼容兜底项，不建议继续使用。
