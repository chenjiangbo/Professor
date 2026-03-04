# Professor 技术方案 v3（中英双语与语言切换）

> 版本：v3.0  
> 日期：2026-03-04  
> 目标：在当前导入与解读链路上，支持中文/英文双语体验，并明确“字幕可得性边界”。

---

## 1. 需求结论（本轮确认）

1. 系统支持中文与英文双语。
2. 英文模式下：界面英文、问答英文、学习内容英文（字幕/转录/总结/章节）。
3. 中文模式下：界面中文、问答中文、学习内容中文。
4. 页面右上角提供语言切换器。
5. 默认语言来自浏览器语言（`navigator.language`）。
6. 字幕下载策略默认尝试中英文字幕。
7. 现实约束：部分视频只存在一种字幕轨（尤其 YouTube 可能只有原生字幕且没有 AI 字幕）；这属于平台客观限制，系统不能“下载出不存在的字幕轨”。

---

## 2. 核心原则

### 2.1 严格区分两类数据

1. `downloaded subtitles`：平台实际返回并下载成功的字幕轨。
2. `derived localization`：基于已有字幕/转录翻译或生成出的目标语言内容。

说明：翻译得到的文本只能标记为 `derived`，不能标记为“已下载字幕”。

### 2.2 核心流程不使用兜底掩盖失败

1. 要求下载字幕时，必须明确记录每种语言是否下载成功。
2. 若目标语言下载失败但可由另一语言翻译生成，需明确标注“来源为翻译”。
3. 若下载与翻译都失败，状态进入 `error`，并返回可执行错误信息。

### 2.3 环境与配置严格校验

1. 语言参数缺失或非法直接报错。
2. Cookie 未配置/失效直接给出引导，不做静默降级。

---

## 3. 语言模型设计

### 3.1 语言字段

1. `uiLanguage`: `zh-CN | en-US`
2. `contentLanguage`: `zh-CN | en-US`

### 3.2 默认值规则

1. 首次访问：根据浏览器语言决定。
2. 若浏览器语言前缀是 `zh`，默认 `zh-CN`；否则默认 `en-US`。
3. 用户切换后持久化到 `localStorage`，并可同步到服务端 `app_settings`（可选）。

---

## 4. 字幕与内容生产策略

### 4.1 下载阶段（Download）

对每个视频，按平台能力尝试下载：

1. 中文字幕轨（human > ai）。
2. 英文字幕轨（human > ai）。

下载产物分别记录：

1. `subtitle_zh_status`: `ready | unavailable | failed`
2. `subtitle_en_status`: `ready | unavailable | failed`
3. 对应错误信息与元数据（语言、来源 human/ai、文件路径摘要）

### 4.2 平台限制处理

1. 如果平台只提供一种字幕轨：
   1. 已提供语言标记为 `ready`。
   2. 缺失语言标记为 `unavailable`。
2. `unavailable` 是业务可预期状态，不等于系统异常。

### 4.3 目标语言内容生成（Localization）

以 `contentLanguage` 为目标，生成该语言的：

1. transcript
2. summary
3. chapters
4. chat context

来源优先级：

1. 优先使用同语言已下载字幕轨。
2. 若无同语言下载字幕，但有另一语言字幕轨，则通过翻译生成目标语言 transcript，并标记 `translated_from_language`。
3. 若两者都不可用，则进入 `error`。

### 4.4 UI 展示约束

1. 在视频页显示“当前语言内容来源”：
   1. `Downloaded subtitle`
   2. `Translated from zh-CN`
   3. `Translated from en-US`
2. 不把翻译文本显示为“downloaded subtitle”。

---

## 5. 问答双语策略

### 5.1 输入

`POST /api/chat` 增加必填：

1. `contentLanguage`

### 5.2 检索

1. 只检索与 `contentLanguage` 一致的本地化内容。
2. 若该语言内容未 ready，返回 `409`，提示先生成该语言内容。

### 5.3 输出语言强约束

1. `en-US`：系统提示词明确“必须英文回答”。
2. `zh-CN`：系统提示词明确“必须中文回答”。
3. 检测输出语言不一致时，进行一次受控重试；仍失败则报错（不返回错误语言内容）。

---

## 6. 前端改造

### 6.1 右上角语言切换

1. 全局 Header 右上角新增语言切换器：`中文 | English`。
2. 切换后立即更新：
   1. UI 文案语言。
   2. 当前页面数据请求语言参数。
   3. Chat 提交的 `contentLanguage`。

### 6.2 文案国际化

1. 引入字典文件：
   1. `locales/zh-CN.ts`
   2. `locales/en-US.ts`
2. 页面/组件/API 错误信息统一走 key，不再散落硬编码。

### 6.3 可见状态提示

当某语言字幕不可得时，显示：

1. `Source subtitles for this language are unavailable on the platform.`
2. 若存在翻译版内容：`Using translated content from <language>.`
3. 若 Cookie 问题导致失败：显示按钮跳转 `/settings`。

---

## 7. 数据模型调整

### 7.1 新表建议：`video_localizations`

字段建议：

1. `id`
2. `video_id`
3. `language` (`zh-CN | en-US`)
4. `transcript`
5. `summary`
6. `chapters` (JSONB)
7. `status` (`queued/processing_subtitle/processing_outline/processing_explaining/ready/error`)
8. `last_error`
9. `source_language`（该条内容原始语言）
10. `translated_from_language`（若为翻译产物）
11. `subtitle_origin` (`downloaded | translated`)
12. `created_at/updated_at`
13. 唯一键：`UNIQUE(video_id, language)`

### 7.2 `videos` 表保留

1. 保留视频源信息、导入状态总览、平台元信息。
2. 逐步把单语言文本字段迁出到 `video_localizations`。

---

## 8. API 合同更新

### 8.1 导入接口

1. `POST /api/videos/import-batch`
2. 新增字段：
   1. `contentLanguage`（必填）
   2. `downloadLanguages`（默认 `['zh-CN','en-US']`）

### 8.2 重导接口

1. `POST /api/videos/:id/reimport`
2. 新增字段：
   1. `contentLanguage`（必填）

### 8.3 查询接口

1. `GET /api/videos?id=...&lang=...`
2. `GET /api/notebooks/:id/videos?lang=...`

返回对应语言 localization 视图。

### 8.4 问答接口

1. `POST /api/chat`
2. 新增字段：
   1. `contentLanguage`（必填）

---

## 9. 失败场景与引导

### 9.1 Cookie 未配置/失效

错误文本包含：

1. 问题原因。
2. 操作建议：到 `/settings` 配置对应平台凭据。

### 9.2 目标语言字幕不可得

1. 标记 `unavailable`。
2. 若可翻译生成，则继续生成并标记 `translated`。
3. 若不可翻译生成，则返回 `error`。

### 9.3 语言产物未就绪

Chat / 视频页请求该语言内容时：

1. 返回 `409` + `Localization not ready for requested language`。
2. 前端提供“Generate this language”按钮。

---

## 10. 实施步骤

### M1：语言框架与 UI 切换

1. 建立 i18n 字典。
2. 右上角语言切换器。
3. 浏览器语言默认逻辑。

### M2：数据与接口

1. 新建 `video_localizations`。
2. API 增加 `contentLanguage` 与 `lang`。
3. 存量迁移脚本。

### M3：导入管线双语化

1. 下载阶段尝试中英文字幕。
2. 记录各语言下载状态与错误。
3. 目标语言内容生成与来源标注。

### M4：Chat 双语强约束

1. 仅检索对应语言内容。
2. 输出语言一致性校验与重试。

### M5：验收与回归

1. Bilibili/YouTube 各 4 类样本：
   1. 中英双字幕
   2. 仅中文
   3. 仅英文
   4. 无字幕
2. 双语切换一致性与错误引导验证。

---

## 11. 验收标准

1. 右上角语言切换可实时生效，默认跟随浏览器语言。
2. 英文模式下：UI/问答/学习内容均为英文。
3. 中文模式下：UI/问答/学习内容均为中文。
4. 平台仅单字幕时，系统准确显示“可得性限制”。
5. 翻译产物标注清晰，不伪装成下载字幕。
6. Cookie 问题时有明确 `/settings` 引导。
