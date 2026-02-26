###

**任务目标**： 重构 `/Users/xipilabs/dev/Experiment/Professor/pages/api/chat.ts`，废弃之前基于“严格约束 Prompt + 文本硬截断”的问答逻辑。我们需要引入 Vercel AI SDK 的原生 `tools` 功能，配合最新的 Gemini 3 系列模型（如 `gemini-3.1-pro` 或当前可用最新版本），实现一个能够自主决定何时使用本地上下文、何时调用外部搜索引擎的智能学习导师。

**核心架构调整要求：**

#### 1. 升级依赖与模型配置

- 确保 Vercel AI SDK (`ai` 包) 和对应的 Google Provider (`@ai-sdk/google`) 是最新版本。
- 将模型引擎切换至最新版本（例如 `google('gemini-3.1-pro')`，具体取决于 API 侧的命名规范），以充分利用其原生工具调用能力和极低的上下文缓存（Prompt Caching）成本。

#### 2. 重写 `chat.ts` 中的 `streamText` 逻辑

不再进行繁琐的阶段判定，直接将完整的“解读 + 原文”作为 System Prompt 的初始 Context（得益于最新模型的超长窗口，几 MB 文本完全可以直接传入），并为其配备一个 `webSearch` 工具。

**代码结构示例（请根据项目实际使用的搜索引擎调整，如 Tavily, Serper 或自建 API）：**

TypeScript

```plain
import { streamText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
// 引入你选择的搜索服务，例如 Tavily 或自定义 fetch
import { performWebSearch } from '@/lib/search';

export async function POST(req: Request) {
  const { messages, videoContext } = await req.json();

  // 1. 构建全局 System Prompt
  const systemPrompt = `
你是一位博学、善于启发的深度学习导师。你的核心任务是帮助用户高效吸收当前提供的资料，并解答他们因此产生的任何发散性疑问。

【当前资料上下文】：
${videoContext}

【工作原则】：
1. 优先溯源：回答应首先立足于提供的资料，提炼核心观点。
2. 无缝扩展与求证：当用户提出资料范围外的问题（例如询问具体的训练方法、背后的科学原理、最新数据），或者需要验证某些事实时，**你必须主动调用 webSearch 工具获取最新信息**，切勿回答“上下文缺失”。
3. 清晰界定：在自然流畅的对话中，让用户明白哪些是资料中提到的，哪些是你通过知识库或搜索扩展的。
4. 启发思考：除了给出答案，可以适当提供可执行的建议或思考方向。
  `;

  // 2. 调用 streamText 并注入 tools
  const result = await streamText({
    model: google('gemini-3.1-pro'), // 使用最新模型
    system: systemPrompt,
    messages,
    // 开启最多允许模型连续调用几次工具（例如：搜索后发现不够，再搜一次）
    maxSteps: 3,
    tools: {
      webSearch: tool({
        description: '当用户提出的问题超出当前视频资料范围，或者需要查询最新资讯、具体的操作方法、科学研究、数据验证时，调用此工具进行网络搜索。',
        parameters: z.object({
          query: z.string().describe('用于在搜索引擎中查询的最佳检索词'),
        }),
        execute: async ({ query }) => {
          // 调用实际的搜索 API
          const searchResults = await performWebSearch(query);
          return searchResults;
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
```

#### 3. 前端交互的配合调整（UI 层）

- **移除冗余的模式开关**：既然模型已经具备自主判断能力，前端不再需要“仅基于当前内容”、“允许知识补充”、“允许联网搜索”等复杂的单选按钮。
- **增加 Tool 执行状态展示**：当模型决定调用 `webSearch` 时，Vercel AI SDK 会吐出 tool_call 的流。前端需要捕获这个状态，并展示一个类似“🔍 正在全网检索：[检索词]...”的加载动画，提升用户的等待体验。
- **来源引用（Citations）**：如果模型调用了搜索，要求在回答末尾以 Markdown 链接的形式附上参考来源，前端保持原生 Markdown 渲染即可。

#### 4. 执行约束

请先分析上述方案，确认理解后，直接给出修改后的 `chat.ts` 完整代码以及新建的搜索工具函数 `lib/search.ts` 的代码骨架。
