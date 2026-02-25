## 环境要求

nodejs 18.0 +

## 操作指引

1. clone 本仓库
2. 运行 `npm install`
3. 复制 [.example.env](.example.env) 到同级目录，并将其改名为 `.env`
4. 填写 `.env` 文件中所有的必填项 （也就是除了 Optional 下的所有内容）
   1. 在 https://platform.openai.com/account/api-keys 生成 key，复制它并赋值到 OPENAI_API_KEY
   2. 设置 `CREDENTIAL_ENCRYPTION_KEY`（建议 32 位以上随机字符串，并长期固定，不要频繁改）
   3. 在 https://savesubs.com 中使用 F12 打开开发者控制台，导航至 application -> Cookies -> ...savesubs.com -> **cf_clearance**，复制该值并赋值到 `SAVESUBS_X_AUTH_TOKEN`
   4. 登录 https://upstash.com，在 `Create a Redis Database` 页下点击 `Create database`
      ![img_3.jpg](public/deploy-ch/img_3.jpg)
      根据情况输入基本信息:
      ![img_4.png](public/deploy-ch/img_4.png)
      进入该数据库的控制台，下滑到 `REST API` 栏，点击复制`UPSTASH_REDIS_REST_URL`和 `UPSTASH_REDIS_REST_TOKEN`，赋值到同名变量
      ![img_5.png](public%2Fdeploy-ch%2Fimg_5.png)
   5. 登录 https://supabase.com/ ，新建一个 project
      ![img_6.png](public%2Fdeploy-ch%2Fimg_6.png)
      确认后，点击右侧导航的齿轮进入设置，复制 `URL` 到 `SUPABASE_HOSTNAME`，复制 `key` 到 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
      ![img_7.png](public%2Fdeploy-ch%2Fimg_7.png)
5. 使用 `#` 注释掉 Optional 下的所有项 （可选）
6. 运行 `npm run dev`
7. 打开系统设置页 `/settings`，在 **Bilibili / BBDown Login** 区域手动粘贴 SESSDATA（或完整 Cookie）并点击 `Save`
8. 点击 `Validate` 校验登录态，显示 `valid` 后即可稳定下载字幕

> 说明：`BILIBILI_SESSION_TOKEN` 仅保留为旧逻辑兼容项，推荐始终使用 `/settings` 的持久化配置方式。
