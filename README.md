# Node Docker AI Ops

Nest 后端示例，包含：

- 使用 dockerode 管理 Docker 容器（列表、启动、停止、重启、查看日志）
- 读取并检索日志文件（tail / search）
- 调用 OpenAI（或其他 AI）进行文本分析

运行：

1. 安装依赖：
   npm install
2. 启动开发服务器：
   npm run start:dev

API 端点示例：

- GET /docker/containers
- POST /docker/start/:id
- POST /docker/stop/:id
- GET /docker/logs/:id?tail=200
- GET /logs/tail?path=/var/log/syslog&lines=200
- GET /logs/search?path=/var/log/syslog&q=error
- POST /ai/analyze { prompt }
- POST /ai/command { prompt, confirm? }

## AI command examples

Use `/ai/command` for natural-language Docker operations:

```json
{
  "prompt": "列出当前所有容器"
}
```

```json
{
  "prompt": "关闭 my-hello 容器"
}
```

Dangerous actions return a preview first. Send the same prompt with `confirm: true`
to execute it:

```json
{
  "prompt": "关闭 my-hello 容器",
  "confirm": true
}
```
