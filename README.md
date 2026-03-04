# Professor

开源地址: [https://github.com/chenjiangbo/Professor](https://github.com/chenjiangbo/Professor)

Professor 是一个面向 AI 时代学习场景的开源项目。  
核心目标是把长视频/长文档提炼为高密度知识，并支持围绕当前资料进行持续问答。

## 主要能力

- B 站 / YouTube 视频导入与字幕获取（优先官方字幕，支持 AI 字幕）
- 两阶段解读流程（大纲提炼 -> 深度解读）
- Notebook 知识组织与多资源管理
- 基于当前资料上下文的 AI 问答
- Source 原文查看与检索

## 技术栈（当前）

- 前端: Next.js + React + Tailwind CSS
- 后端: Next.js API Routes
- 数据: PostgreSQL
- 队列/缓存: Redis
- LLM: Google Vertex AI（Gemini）
- 视频字幕:
  - B 站: BBDown
  - YouTube: yt-dlp
- 容器化: Docker / Docker Compose

## 本地开发

1. 配置环境变量（参考 `.example.env`）
2. 准备 Vertex 服务账号 JSON（并在容器内挂载）
3. 启动开发容器:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build bibigpt-dev
```

默认访问:

- App: `http://localhost:3302`
- Hero: `/`
- Notebooks: `/notebooks`

## 开源说明

本项目目前以 Professor 作为独立产品持续开发。  
欢迎提交 Issue / PR，一起完善学习效率工具链。
