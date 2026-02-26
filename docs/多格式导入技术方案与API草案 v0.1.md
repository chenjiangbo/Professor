# 多格式导入技术方案与 API 草案 v0.1

## 1. 目标与范围

本阶段目标：在保持现有 Notebook 主体验不变的前提下，补齐多格式导入的后端基础能力（先打通数据模型与 API 草案）。

支持的 source 类型（规划）：

- `bilibili_url`
- `text`
- `subtitle_file`（`.srt/.vtt/.ass`）
- `pdf`
- `docx`
- `md`
- `txt`

不在本阶段实现：

- 用户体系与多租户隔离
- `BBDown login` 模式（全站共享账号风险高）
- 复杂 OCR（扫描 PDF）

## 2. 鉴权策略（B 站）

当前策略：

- 默认：`SESSDATA` 模式
- 可选：`Full Cookie` 模式（推荐）
- 暂不启用：`BBDown login` 模式

原因：当前项目对所有访问者开放，缺乏用户隔离，`BBDown login` 会导致全局共享登录态和不可控风控风险。

## 3. 数据模型（已落库骨架）

### 3.1 `sources`

用于统一承载视频/文本/文件导入对象。

核心字段：

- `id` UUID
- `notebook_id` UUID
- `video_id` UUID（兼容历史视频实体，允许空）
- `type` TEXT
- `platform` TEXT
- `external_id` TEXT
- `source_url` TEXT
- `title` TEXT
- `original_name` TEXT
- `mime_type` TEXT
- `status` TEXT（`queued|extracting|processing_outline|processing_explaining|ready|error`）
- `summary` TEXT
- `chapters` JSONB
- `extracted_text` TEXT
- `raw_storage_path` TEXT
- `language` TEXT
- `interpretation_mode` TEXT
- `last_error` TEXT
- `created_at/updated_at`

### 3.2 `source_jobs`

用于后台异步任务编排和可观测性。

核心字段：

- `id` UUID
- `source_id` UUID
- `stage` TEXT（`extract|outline|explain`）
- `status` TEXT（`queued|running|success|error`）
- `attempts/max_attempts`
- `error`
- `meta` JSONB
- `started_at/finished_at`
- `created_at/updated_at`

## 4. 导入处理流水线（统一）

1. 创建 source（`queued`）
2. 文本抽取/标准化（`extracting`）
3. 大纲生成（`processing_outline`）
4. 逐章解读（`processing_explaining`）
5. 完成（`ready`）或失败（`error`）

## 5. API 草案

以下接口为 v0 草案，命名可在实现时微调。

### 5.1 创建导入任务（统一入口）

`POST /api/sources/import`

请求体（示例）：

```json
{
  "notebookId": "uuid",
  "interpretationMode": "concise",
  "items": [
    { "type": "bilibili_url", "url": "https://www.bilibili.com/video/BV..." },
    { "type": "text", "title": "临时笔记", "text": "..." }
  ]
}
```

返回（示例）：

```json
{
  "batchId": "uuid",
  "total": 2,
  "items": [{ "id": "source-uuid", "status": "queued" }]
}
```

### 5.2 文件上传

`POST /api/sources/upload`（`multipart/form-data`）

字段：

- `notebookId`
- `interpretationMode`
- `files[]`

返回：与 `import` 类似，返回 source 列表。

### 5.3 查询 Notebook 下 source 列表

`GET /api/notebooks/:id/sources`

查询参数：

- `status`（可选）
- `type`（可选）
- `q`（可选）

### 5.4 查询 source 详情

`GET /api/sources/:id`

返回：source 全量信息（含 `summary/chapters/extracted_text/last_error`）。

### 5.5 重试 source

`POST /api/sources/:id/reimport`

行为：重置状态并重新入队，不删除历史 source 记录。

### 5.6 删除 source

`DELETE /api/sources/:id`

行为：删除 source 与其 jobs；如有文件，异步清理存储。

### 5.7 查询 source jobs

`GET /api/sources/:id/jobs`

用于排查卡点和前端状态展示。

## 6. 前端交互草案

导入弹窗分三栏：

- URL 导入（支持多个）
- 文本粘贴
- 文件拖拽上传

列表与详情：

- 左侧：source 列表（状态徽标）
- 右侧：
  - 解读（summary + chapters）
  - Source 原文（可搜索）
  - 错误详情（失败时）

## 7. 开发里程碑

- M1：数据模型 + API 草案 + 状态机（当前）
- M2：`text/md/txt` 导入
- M3：`subtitle/pdf/docx` 导入
- M4：前端统一导入弹窗与 source 详情页
- M5：回归测试与发布文档
