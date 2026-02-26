# Vertex AI Template (Template-First)

这个目录用于把当前项目里已经验证过的 Vertex 原生能力，快速复制到其他项目。

## 包含内容

- `lib/ai/vertex.ts`：统一创建 Vertex provider，解析项目 ID / 区域 / 模型名。
- `pages/api/chat.ts`：主问答 API（流式输出 + `google_search` 工具）。
- `pages/api/labs/ai-chat.ts`：轻量实验问答 API。
- `lib/interpretation/videoInterpretation.ts`：两阶段解读（coverage -> article）。
- `prompts/*.md`：当前基线提示词（问答、覆盖点提炼、文章生成）。
- `test/chat-smoke.sh`：聊天接口烟测。
- `test/labs-chat-smoke.sh`：Labs 聊天接口烟测。

## 目标项目接入步骤

1. 复制目录：把 `template/vertex-ai` 复制到目标项目（例如 `src/ai-template`）。
2. 安装依赖：
   - `npm i ai @ai-sdk/google-vertex zod`
3. 配置环境变量（见 `.env.example`）。
4. 在 Docker/运行环境挂载服务账号 JSON，并设置 `GOOGLE_APPLICATION_CREDENTIALS`。
5. 接入 API 路由，并根据你项目的路径别名调整 import。
6. 执行 `test/*.sh` 先做接口连通验证。

## 需要你在目标项目里改的地方（最小改动）

- `~/` 路径别名：
  - 模板文件里沿用了当前项目的 `~/` 别名。
  - 如果目标项目不用这个别名，请改为相对路径或目标项目别名。
- 数据库读写：
  - `pages/api/chat.ts` 依赖 `~/lib/db`、`~/lib/repo`。
  - 需要替换成目标项目的数据层。
- 解读入口：
  - `lib/interpretation/videoInterpretation.ts` 依赖：
    - `~/lib/interpretationMode`
    - `~/lib/openai/getSmallSizeTranscripts`
  - 迁移时请替换为目标项目对应实现。

## 模型与配置

VERTEXAI_PROJECT=crafty-willow-469010-d3
VERTEXAI_LOCATION=global
VERTEX_MODEL=gemini-3.1-pro-preview

- 默认模型：`gemini-3.1-pro-preview`（可通过 `VERTEX_MODEL` 覆盖）。
- 推荐区域：`global`。

## 已知边界

- 该模板是“可复用基线”，不是开箱即用 SDK。
- 重点是复用 Vertex 原生调用和问答/解读主流程，业务数据层仍按项目落地。
- 等这套方案在多个项目稳定后，再考虑抽独立 npm 包。
