## Node Docker AI Ops

Nest 后端示例，包含：

- 使用 dockerode 管理 Docker 容器（列表、启动、停止、重启、查看日志）
- 读取并检索日志文件（tail / search）
- Ollama调用本地 AI（或其他 AI）进行文本分析

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

### Ollama 提供本地 AI

```
http://127.0.0.1:11434/api/generate
```

### AI 指令示例

Use `/ai/command` for natural-language Docker operations:

```json
{
  "prompt": "列出当前所有容器"
}
```

```json
{
  "prompt": "关闭 my-hello 容器",
  "confirm": true
}
```

### 效果图预览

- docker ps -a
  ![docker](https://raw.githubusercontent.com/Tang-CN/Docker-AI-Ops/main/img/list-docker.png)

- docker stop my-hello
  ![docker](https://raw.githubusercontent.com/Tang-CN/Docker-AI-Ops/main/img/stop-docker.png)

- docker restart my-hello
  ![docker](https://raw.githubusercontent.com/Tang-CN/Docker-AI-Ops/main/img/restart-docker.png)

- docker logs my-hello
  ![docker](https://raw.githubusercontent.com/Tang-CN/Docker-AI-Ops/main/img/logs-docker.png)
