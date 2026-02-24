# Professor GitHub CI/CD 发布说明

## 1. 服务器一次性初始化（阿里云东京）

```bash
ssh xipi
mkdir -p /workspace/xipilabs/professor
cd /workspace/xipilabs/professor
```

确认外部网络已存在（和 hero 共用）：

```bash
docker network ls | grep xipi-network
```

如果没有，先创建：

```bash
docker network create xipi-network
```

准备生产环境变量：

```bash
cd /workspace/xipilabs/professor
cp /path/to/your/local/.env ./.env
# 或手动创建 .env，至少包含 .example.env 里必填项
```

## 2. GitHub 仓库 Secrets

在 `Settings -> Secrets and variables -> Actions -> New repository secret` 新增：

- `SERVER_HOST`: 你的服务器公网 IP / 域名
- `SERVER_USER`: SSH 用户名（比如 `xipi`）
- `SERVER_SSH_KEY`: 私钥内容（建议专门用于 CI 的 deploy key）

> 当前 workflow 固定使用 22 端口。如果你的 SSH 不是 22，请改 `.github/workflows/deploy-prod.yml` 里的 `port`。

## 3. 触发发布

首次建议手动触发：

1. 打开 `Actions -> Deploy Professor (Prod)`
2. 点击 `Run workflow`
3. 成功后在服务器检查：

```bash
ssh xipi
cd /workspace/xipilabs/professor
docker compose --env-file .deploy.env -f docker-compose.prod.yml ps
docker logs --tail=100 professor
```

## 4. 之后的发布流程

- push 到 `main` 会自动：
  1. 构建镜像并推送到 GHCR（tag: `latest` + commit sha）
  2. SSH 到服务器拉取最新 sha 镜像
  3. `docker compose up -d` 滚动更新 `professor` 容器

## 5. 回滚（手动）

```bash
ssh xipi
cd /workspace/xipilabs/professor
# 将 IMAGE 改为历史 sha tag 后重新 up
echo "IMAGE=ghcr.io/<owner>/<repo>:<old_sha>" > .deploy.env
echo "XIPI_EXTERNAL_NETWORK=xipi-network" >> .deploy.env
docker compose --env-file .deploy.env -f docker-compose.prod.yml up -d professor
```
