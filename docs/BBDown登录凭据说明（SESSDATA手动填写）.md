# BBDown 登录凭据说明（扫码登录 + 手动凭据）

## 1. 支持的登录方式

1. 扫码登录（推荐）：在 `/settings` 的 **BBDown 扫码登录** 区域点击“开始扫码登录”，用 Bilibili App 扫码并确认，系统自动保存 Cookie。
2. 手动凭据（备用）：手动粘贴完整 Cookie 或 `SESSDATA`。
3. 两种方式都会在保存后做校验（`/x/web-interface/nav` 的 `isLogin`）。

## 2. 手动模式下，SESSDATA 如何获取

1. 用户先在浏览器登录 [Bilibili](https://www.bilibili.com)。
2. 打开开发者工具（F12）-> `Application`（或“应用”）-> `Cookies` -> `https://www.bilibili.com`。
3. 找到 `SESSDATA` 字段，复制其 value。
4. 在系统 `/settings` 的 **Bilibili / BBDown Login** 区域粘贴并保存。

## 3. 登录态有效期

1. 本质是 B 站登录态 Cookie，属于“会过期/会失效”的令牌，不是永久有效。
2. 常见失效原因：
   - 账号主动退出登录
   - 异地登录风控导致会话失效
   - B 站侧自然过期或安全策略刷新
3. 本系统会长期保存登录凭据，但当值在 B 站侧失效后，仍需要重新登录（扫码或手动更新）。

## 4. 当前系统中的保存方式（安全）

1. 存储位置：数据库 `app_settings` 表（key=`bbdown_auth`）。
2. 存储内容：加密密文（AES-256-GCM），不保存明文。
3. 页面展示：仅展示掩码值，防止明文泄露。
4. 稳定性要求：生产环境需固定 `CREDENTIAL_ENCRYPTION_KEY`，否则可能无法解密历史凭据。

## 5. 是否支持“每个访问者各自 B 站账号”

当前版本：支持按用户隔离。

1. 系统通过用户身份（`user_id`）命名空间保存凭据，不同用户互不共享。
2. 扫码会话也按用户隔离，只允许当前登录用户查看/取消自己的扫码状态。
3. 并发限制：每个用户同一时间只允许一个活跃扫码会话。

## 6. 运行时行为（实现）

1. BBDown 字幕下载时自动读取持久化 Cookie，并通过 `-c` 注入。
2. 手动凭据接口：
   - `GET /api/settings/bbdown-auth`
   - `POST /api/settings/bbdown-auth`
   - `POST /api/settings/bbdown-auth/validate`
   - `DELETE /api/settings/bbdown-auth`
3. 扫码登录接口：
   - `POST /api/settings/bbdown-auth/qr/start`
   - `GET /api/settings/bbdown-auth/qr/status`
   - `POST /api/settings/bbdown-auth/qr/cancel`
4. 核心流程无兜底：扫码失败、校验失败都会直接返回错误，不会静默切换其他流程。
