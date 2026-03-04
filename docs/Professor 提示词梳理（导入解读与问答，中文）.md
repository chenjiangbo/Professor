# Professor 提示词梳理（导入解读与问答，中文）

本文档基于当前本地代码梳理「导入视频/文本」与「问答」实际使用的提示词，仅保留中文路径。

## 1. 代码入口与适用范围

- 解读（大纲 + 章节解读）入口：`lib/openai/videoInterpretation.ts`
- 导入流程入口：`lib/import/processVideoImport.ts`
- 问答入口：`pages/api/chat.ts`

导入流程中：

- `sourceType === 'text' | 'file'`：有文本就直接走解读（除 `mode=none`）。
- `sourceType === 'bilibili' | 'youtube'`：先拉字幕，再走解读（除 `mode=none`）。
- 两类导入最终都调用 `generateVideoInterpretation(title, transcript, { mode, language })`。

## 2. 导入解读提示词（中文）

## 2.1 大纲提取（coverage）提示词

来源函数：`generateCoverageMap(...)`

用途：先把全文压缩成「一句话总览 + 关键信息点列表」，作为后续章节解读的强约束输入。

### 2.1.1 主提示词模板（中文）

```text
你是一位知识压缩助手。提取后续解读必须覆盖的关键信息点，忽略寒暄、重复与口头语。
视频标题：{title}

输出纯文本，并严格遵守以下格式（不要 JSON、不要 Markdown 标题、不要代码块）：
SUMMARY:
<一句话总结>

POINTS:
- <信息点1>
- <信息点2>
- <信息点3>

格式说明：
- SUMMARY 后只写一句核心观点。
- POINTS 下输出关键信息点（详解模式建议 14-24 条；精简模式建议 10-18 条），每行一个信息点。
- 详解模式：优先保留数据、案例、论据与推理链细节。
- 不要输出任何额外说明。
{retryHint}

原始转录：
{transcript}
```

### 2.1.2 重试附加文案（中文）

当首轮输出疑似截断时：

```text
重试：上次输出疑似被截断。请压缩措辞并完整输出 SUMMARY 与 POINTS。
```

当首轮输出主要是格式问题时：

```text
重试：保持语义不变，仅修复格式并严格输出 SUMMARY 与 POINTS。
```

### 2.1.3 关键参数

- `temperature = 0`
- `maxOutputTokens`：
  - `detailed`：`5600`
  - `concise`：`4200`
- 解析硬约束：必须有 `SUMMARY`，且 `POINTS` 至少 1 条。

## 2.2 深度解读（article）提示词

来源函数：`generateFullArticle(...)`

用途：基于大纲阶段抽取出的 `coverage_points` 写成完整章节文章。

### 2.2.1 主提示词模板（中文）

```text
你是一位深度解读编辑。请基于转录写一篇连贯、清晰、可读性强的深度文章。
视频标题：{title}

写作要求：
1) 必须覆盖关键信息点，不遗漏核心内容。
2) 忠于转录事实，不得编造细节。
3) 可补充必要背景解释，但不得偏离主题。
4) 全文保持自然连贯，段落间有清晰过渡。
5) 风格应像成熟专栏作者，避免机械化罗列。
6) 使用 Markdown 增强可读性：可加粗重点、引用关键句、适度使用列表。
7) 使用 Markdown，并用 4-8 个二级标题（##）组织全文。  （concise 时为 3-6 个）
8) 当前为详解模式：在保证可读性前提下尽量保留细节、证据、数据与推理过程。  （仅 detailed 时追加）
9) 重试：上次输出不完整，请输出完整文章。  （仅重试时追加）

必须覆盖的关键信息点：
1. {coveragePoint1}
2. {coveragePoint2}
...

原始转录：
{transcript}
```

### 2.2.2 关键参数

- `temperature = 0.4`
- `maxOutputTokens`：
  - `detailed`：`12000`
  - `concise`：`6000`

## 2.3 解读结果结构化说明（非提示词，但与大纲展示强相关）

来源函数：`splitArticleIntoSections(...)`

- 解析规则：以 `## ` 二级标题切段，作为章节。
- 若文章开头没有 `##`，第一段会落入默认标题：`Integrated Interpretation`。
- 若整篇都没有可识别标题，走兜底分段（按段落分块生成 `Part 1/2/3` 等标题）。

这也是出现“章节 1 是 Integrated Interpretation”的直接原因：模型输出首段未命中 `## 标题` 规则。

## 2.4 文本导入与视频导入在提示词上的区别

- 提示词本身：没有区别，统一走上述两段提示词。
- 区别只在输入来源：
  - 文本/文件：`transcript = rawText`，标题默认可能是 `Imported content`（当用户没填标题）。
  - 视频：`transcript` 来自字幕下载（必要时可翻译），标题优先来自平台元数据。

## 3. 问答提示词（中文）

来源函数：`buildPromptPrefix(...)`（`pages/api/chat.ts`）

用途：为 Notebook 问答构造系统提示词。

### 3.1 问答系统提示词模板（中文）

```text
你是一位知识扎实且善于启发的学习教练。

[当前学习资料]
{context 或 “(未选择资料，上下文为空。)”}

[回答原则]
1. 优先基于给定资料作答。
2. 当问题超出资料时，可结合通用知识补充。
3. 必要时自然说明信息来源。
4. 避免机械化表达，适当使用类比。
5. 涉及时效数据或政策时，给出依据并避免武断。

[输出要求]
- 使用清晰 Markdown。
- 必须使用中文回答。
- 仅输出最终答案，不输出推理草稿。
```

### 3.2 `context` 拼接格式（会直接影响问答质量）

每个视频上下文按以下结构拼接，然后多个视频用 `\n\n---\n\n` 连接：

```text
Title: {video.title}

Summary:
{video.summary}

Chapters:
## 1. {chapterTitle}
{chapterSummary}
## 2. {chapterTitle}
{chapterSummary}
...

Source Text:
{video.transcript}
```

说明：

- 当前 `context` 标签名是英文（`Title/Summary/Chapters/Source Text`），但中文问答系统提示明确要求“必须使用中文回答”。

## 4. 与提示词效果直接相关的运行约束

这些不是提示词正文，但会显著影响“是否丢细节”。

- 输入转录截断（`normalizeTranscript`）：
  - `detailed`：最多 `18000` 字节
  - `concise`：最多 `10000` 字节
- 模型重试：由环境变量控制
  - `VERTEX_MODEL_MAX_ATTEMPTS`
  - `VERTEX_MODEL_RETRY_BASE_DELAY_MS`
  - `VERTEX_MODEL_RETRY_MAX_DELAY_MS`
- 超时：
  - `VERTEX_COVERAGE_TIMEOUT_MS`
  - `VERTEX_ARTICLE_TIMEOUT_MS`
