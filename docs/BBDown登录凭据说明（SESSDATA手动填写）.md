# BBDown 登录凭据说明（SESSDATA 手动填写）

## 1. 为什么采用“手动填 SESSDATA”而不是 `BBDown login`

1. `BBDown login` 通常依赖命令行交互（扫码/确认），在 Docker/服务端场景不稳定，且不适合 Web 用户流程。
2. Web 应用里让用户手动填 `SESSDATA` 或完整 Cookie，可以直接走 API 保存，流程可控、可审计。
3. 可做状态校验（`/x/web-interface/nav` 的 `isLogin`），比“命令行登录是否成功”更可观测。

## 2. SESSDATA 如何获取

1. 用户先在浏览器登录 [Bilibili](https://www.bilibili.com)。
2. 打开开发者工具（F12）-> `Application`（或“应用”）-> `Cookies` -> `https://www.bilibili.com`。
3. 找到 `SESSDATA` 字段，复制其 value。
4. 在系统 `/settings` 的 **Bilibili / BBDown Login** 区域粘贴并保存。

## 3. SESSDATA 有效期

1. 本质是 B 站登录态 Cookie，属于“会过期/会失效”的令牌，不是永久有效。
2. 常见失效原因：
   - 账号主动退出登录
   - 异地登录风控导致会话失效
   - B 站侧自然过期或安全策略刷新
3. 本系统会长期保存“你填入的值”，但当值在 B 站侧失效后，仍需要用户重新粘贴最新值。

## 4. 当前系统中的保存方式

1. 存储位置：数据库 `app_settings` 表（key=`bbdown_auth`）。
2. 存储内容：加密密文（AES-256-GCM），不保存明文。
3. 页面展示：仅展示掩码值，防止明文泄露。
4. 稳定性要求：生产环境需固定 `CREDENTIAL_ENCRYPTION_KEY`，否则可能无法解密历史凭据。

## 5. 是否支持“每个访问者各自 B 站账号”

当前版本：不支持真正的按用户隔离。

1. 现在应用没有用户身份体系（匿名可访问），所以 BBDown 凭据只能是“系统级全局一份”。
2. 若要“每人一份账号”，需要先引入用户登录（最小也要 session/user_id），再按 `user_id` 保存各自凭据。
3. 在完成用户体系前，不建议开放多人共用同一实例的凭据写入权限。

## 6. 运行时行为（实现）

1. BBDown 字幕下载时自动读取持久化 Cookie，并通过 `-c` 注入。
2. 登录校验接口：
   - `GET /api/settings/bbdown-auth`
   - `POST /api/settings/bbdown-auth`
   - `POST /api/settings/bbdown-auth/validate`
   - `DELETE /api/settings/bbdown-auth`
3. legacy 回退链路仍保留 `BILIBILI_SESSION_TOKEN` 兼容，但不建议继续使用。
