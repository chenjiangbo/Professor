# Vertex 原生能力复用方案（模板优先）

## 1. 目标

- 先不抽独立 npm 包，先做“模板复用”（Template First）。
- 目标是让其他项目 1-2 小时内接入已验证的 Vertex 原生能力（问答、搜索、提示词组织、错误处理）。
- 等跑稳后再决定是否抽独立包。

---

## 2. 为什么先做模板，不先做 npm 包

- 当前能力还在高频迭代，直接抽包会引入版本发布和兼容成本。
- 模板方式改动最直接：复制 + 少量替换即可落地。
- 模板稳定后再抽包，成本最低，风险最小。

---

## 3. 建议的模板目录

在本项目里先沉淀一个可复制目录（例如 `template/vertex-ai/`），建议包含：

```text
template/vertex-ai/
  README.md
  .env.example
  lib/ai/vertex.ts
  pages/api/chat.ts
  pages/api/labs/ai-chat.ts
  lib/openai/videoInterpretation.ts
  prompts/
    qa.system.md
    interpretation.coverage.md
    interpretation.article.md
  test/
    chat-smoke.sh
    import-smoke.sh
```

说明：

- `lib/ai/vertex.ts`：统一 Vertex provider 创建、模型名解析、项目/区域解析。
- `pages/api/chat.ts`：主问答接口（含 google_search 工具、流式返回）。
- `pages/api/labs/ai-chat.ts`：实验问答接口（快速验证）。
- `lib/openai/videoInterpretation.ts`：导入后生成覆盖点 + 成文解读流程。
- `prompts/`：把提示词文本独立出来，便于跨项目复用和版本管理。

---

## 4. 其他项目如何使用（标准流程）

### 步骤 A：复制模板

把 `template/vertex-ai/` 复制到目标项目（例如 `src/ai/` 或 `lib/ai/`）。

### 步骤 B：安装依赖

目标项目至少需要：

```bash
npm i ai @ai-sdk/google-vertex zod
```

说明：

- 版本要与项目现有 `ai` 主版本匹配（当前本项目是 `ai@5`，`@ai-sdk/google-vertex@3.x`）。

### 步骤 C：配置环境变量

在目标项目 `.env` 增加：

```env
GOOGLE_APPLICATION_CREDENTIALS=/app/vertex-sa.json
VERTEXAI_PROJECT=crafty-willow-469010-d3
VERTEXAI_LOCATION=global
VERTEX_MODEL=gemini-3.1-pro-preview
```

### 步骤 D：挂载密钥文件（Docker）

在目标项目 compose 中挂载：

```yaml
environment:
  GOOGLE_APPLICATION_CREDENTIALS: /app/vertex-sa.json
volumes:
  - ./your-service-account.json:/app/vertex-sa.json:ro
```

### 步骤 E：接入前端

- 如果是聊天场景：前端 `useChat({ api: '/api/chat' })` 指向模板接口。
- 如果有“当前资料上下文”：把当前文档/视频解析结果拼到后端 `system prompt` 的上下文变量。

### 步骤 F：跑 smoke test

- `chat-smoke.sh`：验证 `/api/chat` 200 + 流式返回。
- `import-smoke.sh`：验证导入后状态可到 `ready`（如项目有导入流程）。

---

## 5. 迁移时只改这几项（最小改造原则）

每个新项目仅改：

- 业务上下文拼装函数（例如 `buildVideoContext`）。
- Prompt 内容（行业领域词汇）。
- 数据存储读写（DB 表名、字段名）。
- 前端容器样式（不改接口协议）。

不要先改：

- Vertex provider 初始化方式。
- 流式返回协议。
- Tool 调用协议（`google_search`）。
- 错误处理主流程。

---

## 6. Prompt 管理建议（模板阶段）

- 将提示词从代码挪到 `prompts/*.md`，运行时读取并替换变量。
- 每次调整 prompt 都记录版本号（例如 `qa.system.v3`）。
- 建议保留三份基线 prompt：
  1. `qa.system.md`
  2. `interpretation.coverage.md`
  3. `interpretation.article.md`

这样在多个项目里可以“同结构、不同领域词”复用。

---

## 7. 升级与回滚策略

### 升级

- 先在一个项目验证新 prompt / 新模型。
- 稳定后同步到模板目录，再批量推广到其他项目。

### 回滚

- 模板目录按 tag 管理（例如 `vertex-template-v0.3`）。
- 任何项目出现质量回退，直接切回上一个模板 tag。

---

## 8. 什么时候再抽成 npm 包

满足以下条件再抽包：

- 连续 2-4 周内接口和提示词结构基本稳定。
- 至少 2 个项目复用同一套实现且改动很小。
- 团队对版本发布流程（语义化版本、变更日志）有明确要求。

达到条件后，把模板中的“稳定层”抽成包：

- `vertex client`
- `chat stream wrapper`
- `tooling wrapper`
- `error normalization`

业务 prompt 和上下文拼装仍放各项目本地。

---

## 9. 你的项目当前可直接复用的核心文件

建议作为第一版模板基线：

- `lib/ai/vertex.ts`
- `pages/api/chat.ts`
- `pages/api/labs/ai-chat.ts`
- `lib/openai/videoInterpretation.ts`

这些文件已经是 Vertex 原生链路，且已通过当前项目实测。

---

## 10. 实施清单（可直接执行）

1. 在本仓库创建 `template/vertex-ai/` 并复制上述核心文件。
2. 把提示词拆到 `template/vertex-ai/prompts/`。
3. 加 `README.md`（说明变量、依赖、路由、已知限制）。
4. 增加两个 smoke 脚本。
5. 在下一个项目按“第 4 节”接入并验证。
6. 验证通过后，再决定是否进入 npm 包阶段。
