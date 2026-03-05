明白，下面给你一版**方案 B（保留流式、支持多资源并发）**的详细实现方案，先评审，不改代码。

**目标**

1. 不中止任何已发送问题。
2. 资源 A、B 可并发流式生成。
3. 切换资源后，各自保留独立 `thinking...`、独立流式进度、独立输入草稿。
4. 回到任一资源，看到该资源自己的流式结果，不串台。

**核心思路**
把当前“单一全局 `useChat` 实例”改成“**每个 videoId 一个独立 chat session**（各自一个 `useChat`）”。

- 每个 session 独立维护：
  - `messages`
  - `status`（idle/submitted/streaming）
  - `input` 草稿
  - 历史同步状态
- UI 只显示当前资源的 session，但其它 session 不卸载（隐藏即可），让它们在后台继续流式完成。

---

**实现设计**

1. **新增组件：`VideoChatSession`**

- 位置建议：`components/notebook/VideoChatSession.tsx`
- 入参：
  - `notebookId`
  - `videoId`
  - `language`
  - `visible`（是否当前显示）
- 组件内部逻辑：
  - `useSWR('/api/notebooks/{id}/chats?videoId=...')` 拉该资源历史
  - `useChat({ api:'/api/chat', body:{ notebookId, videoIds:[videoId], contentLanguage } })`
  - 输入框、发送按钮、`Shift+Enter`、自动增高都放在这里
  - `Thinking...` 只看本 session 的 `status`
- 历史同步策略：
  - 用 `signatureRef` 防重复覆盖
  - **流式中不覆盖本地 messages**（避免把 streaming 内容冲掉）
  - 仅在 `status=idle` 时用后端历史对齐一次

2. **Notebook 页面改造（父组件）**

- 维护一个 `sessionVideoIds` 集合（访问过的资源）
- 用户切换资源时：
  - 如果新 `videoId` 不在集合，加入集合
- 渲染方式：
  - `sessionVideoIds.map(videoId => <VideoChatSession ... visible={videoId===activeVideoId} /> )`
  - 非当前 session 用 `hidden`/`display:none`，但**保持挂载**，确保后台流不被中断

3. **并发行为**

- A 资源发送后开始 streaming
- 切到 B，B 可以继续发送并 streaming
- A/B 两个 session 的请求并行，不互相禁用按钮
- 每个 session 只锁自己的发送按钮（该 session 正在 submitted/streaming 时禁用）

4. **后端接口**

- 现有 `/api/chat` 不改协议（已支持 `videoIds`）
- 现有 `/api/notebooks/{id}/chats?videoId=...` 不改
- 只需确保前端每个 session 请求都带自己的 `videoIds:[currentVideoId]`

---

**关键边界处理（高风险点，必须做）**

1. **切换时不丢流**

- 非活跃 session 不卸载，不重建 `useChat`

2. **历史覆盖冲突**

- streaming 状态禁止 `setMessages(history)`
- idle 后再做一次对齐

3. **资源删除/失效**

- 若某资源被删除，session 标记为只读并停止继续发送（已有请求让其自然结束）

4. **内存控制**

- 第一版先保证正确性，不做激进回收
- 后续可加 LRU：只回收 `idle` 且长时间未访问的 session，绝不回收 in-flight

---

**改动范围（预估）**

1. `pages/notebooks/[id].tsx`：移除全局 `useChat` 相关逻辑，改为 session 容器管理
2. 新增 `components/notebook/VideoChatSession.tsx`：承接聊天面板全部 UI + 流式逻辑
3. 可选新增 `hooks/usePerVideoChatSession.ts`（若你希望逻辑更清晰）

---

**验收用例（必须全过）**

1. 在 A 提问并看到 streaming，切到 B 提问，B 也 streaming。
2. 切回 A，A 仍继续流式，不变成 B 的内容。
3. A 完成后切到 B，B 仍显示 `thinking...` 直到自己的完成。
4. 页面刷新后，A/B 历史分别正确按 `videoId` 恢复。
5. 任一资源失败不影响其它资源会话。

---

如果你认可，我下一步按这个方案拆成小步提交：

1. 先抽 `VideoChatSession`（功能等价，不改行为）
2. 再接入多 session 并发
3. 最后做冲突与边界收口（history 同步守卫）
