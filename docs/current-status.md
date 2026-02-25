# 当前项目状态（2026-02-23）

## 最新决策（高优先级）

本项目进入 **v2 优先级调整**：

1. **仅聚焦 B 站视频导入**（其他来源暂缓）。
2. 视频导入核心链路切换为：
   - BBDown 字幕下载（优先中文字幕，允许 AI 字幕；无中文字幕则英文字幕）
   - 基于字幕生成章节大纲
   - 按章节生成深度讲解
3. Notebook 现有组织能力（notebooks/videos/notes/chat）保持不变。
4. 导入入口支持一次粘贴多个视频 URL（批量导入）。
5. 字幕下载与 LLM 生成均在后台异步执行，前端不阻塞，可继续其它操作。
6. BBDown 登录改为 Settings 手动填写 SESSDATA/Cookie 并持久化保存（加密存储 + 可校验状态）。

对应设计文档：

- `docs/Professor 技术方案 v2（B站优先与BBDown字幕管线）.md`
- `docs/BBDown登录凭据说明（SESSDATA手动填写）.md`

---

## 当前代码基线（已存在）

1. Notebook 主体功能已可用：

- `/api/notebooks`、`/api/notebooks/[id]`
- `/api/notebooks/[id]/videos`
- `/api/notebooks/[id]/chats`

2. 视频导入与展示链路已存在：

- `/api/videos/preview`
- `/api/videos`
- `/api/videos/[id]/summarize`
- `/api/videos/subtitle`

3. 数据层：PostgreSQL（`lib/db.ts`）+ `lib/repo.ts` CRUD。

4. LLM 与缓存：LiteLLM/OpenAI 兼容调用 + Redis 缓存与限流。
5. 系统配置：`app_settings`（用于持久化 BBDown 登录态等系统级配置）。

---

## 与 v2 目标的差距

1. 仍有 YouTube 逻辑分支（需下线或冻结）。
2. 章节化解读已接入，但“覆盖率自检 + 低分重写”尚未实现。
3. 联网增强目前为提示词层面约束，尚未接入可审计的外部来源字段。
4. 导入侧“展开全部分 P/合集”虽已支持，但缺少导入前预估数量提示。
5. 目前仍是系统级单租户登录态（无用户隔离），若要“每个访问者独立 B 站账号”需先引入用户身份体系。

---

## 下一步实施顺序（建议）

1. **M1 已完成（B 站-only + 批量导入 + BBDown）**

- 导入入口限制为 B 站链接。
- 支持一次粘贴多 URL，后台批量异步处理。
- BBDown 字幕优先链路已接入，失败时回退 legacy。
- 前端可在导入过程中继续使用 Q&A/Notes。

2. **M2 已完成基础版（两阶段生成）**

- 已实现“先大纲，再逐章深度讲解”。
- 结果已写入 `videos.summary` 与 `videos.chapters`。
- 状态机已覆盖 `processing_subtitle -> processing_outline -> ready/error`。

3. **M3 进行中（质量和体验增强）**

- 增加覆盖率自检与自动补写。
- 补充联网增强来源结构化存储。
- 导入前增加展开数量预估与确认。

---

## 关键文件（实施关注）

- `pages/api/videos/preview.ts`
- `pages/api/videos/index.ts`
- `pages/api/videos/[id]/summarize.ts`
- `lib/fetchSubtitle.ts`
- `lib/openai/prompt.ts`
- `lib/openai/fetchOpenAIResult.ts`
- `pages/notebooks/[id].tsx`
- `pages/videos/[id].tsx`
