# Chat2API

<p align="center">
  <img src="build/icons.png" alt="Chat2API Logo" width="128" height="128">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-v1.2.0-blue?style=flat-square&logo=github" alt="Release">
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square" alt="License">
  <br>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-33+-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform">
</p>

<p align="center">
  <strong><a href="README.md">English</a> | <a href="https://chat2api-doc.vercel.app/">官网介绍</a> | <a href="https://chat2api-doc.vercel.app/docs">文档</a></strong>
</p>

<p align="center">
  <strong>多平台 AI 服务统一管理工具</strong>
</p>

<p align="center">
  Chat2API 通过驱动各大模型的官方 Web UI，实现 0 成本接入主流 AI 大模型。支持 DeepSeek、GLM、Kimi、MiniMax、Qwen、Z.ai 等渠道，可无缝连接 openlcaw、Cline、Roo-Code 等工具，让任何 OpenAI 兼容客户端即刻可用。
</p>

![Product Preview](docs/screenshots/preview.png)

## ✨ 功能特性

- OpenAI 兼容 API：提供标准 OpenAI 兼容接口，无缝对接现有工具
- 多服务商支持：支持 DeepSeek、GLM、Kimi、MiniMax、Perplexity 🆕、Qwen、Z.ai 等
- 🆕 上下文管理：智能对话上下文管理，支持滑动窗口、Token 限制和总结压缩策略
- 🆕 工具调用支持：通过提示词工程为所有模型提供通用工具调用能力，兼容 Cherry Studio、Kilo Code 等客户端
- 🆕 模型映射：灵活的模型名称映射，支持通配符和首选服务商/账户选择
- 🆕 自定义参数：支持自定义 HTTP Header 开启联网搜索、深度思考、深度研究等功能
- 仪表盘监控：实时请求流量、Token 使用量和成功率统计
- API Key 管理：为本地代理生成和管理密钥
- 模型管理：查看和管理所有服务商的可用模型
- 请求日志：详细的请求日志记录，便于调试和分析
- 代理配置：灵活的代理设置和路由策略
- 系统托盘集成：从菜单栏快速访问状态
- 多语言支持：支持英文和简体中文
- 现代界面：简洁响应式界面，支持深色/浅色主题

## 🤖 支持的服务商

| 服务商           | 认证类型          | OAuth | 模型                                                                              |
| ------------- | ------------- | ----- | ------------------------------------------------------------------------------- |
| DeepSeek      | User Token    | 是     | DeepSeek-V3.2                                                                   |
| GLM           | Refresh Token | 是     | GLM-5                                                                           |
| Kimi          | JWT Token     | 是     | kimi-k2.5                                                                       |
| MiniMax       | JWT Token     | 是     | MiniMax-M2.5                                                                    |
| 🆕 Perplexity | JWT Token     | 是     | Sonar, Sonar Pro, Sonar Deep Research                                           |
| Qwen (国内版)    | SSO Ticket    | 是     | Qwen3.5-Plus, Qwen3-Max, Qwen3-Flash, Qwen3-Coder, qwen-max-latest              |
| Qwen AI (国际版) | JWT Token     | 是     | Qwen3.5-Plus, Qwen3-Max, Qwen3-VL-Plus, Qwen3-Coder-Plus, Qwen-Plus, Qwen-Turbo |
| Z.ai          | JWT Token     | 是     | GLM-5, GLM-4.7, GLM-4.6V, GLM-4.6                                               |

## 📥 安装

### 下载安装

从 [GitHub Releases](https://github.com/xiaoY233/Chat2API/releases) 下载最新版本：

| 平台                    | 下载文件                                   |
| --------------------- | -------------------------------------- |
| macOS (Apple Silicon) | `Chat2API-x.x.x-arm64.dmg`             |
| macOS (Intel)         | `Chat2API-x.x.x-x64.dmg`               |
| Windows               | `Chat2API-x.x.x-x64-setup.exe`         |
| Linux                 | `Chat2API-x.x.x-x64.AppImage` 或 `.deb` |

### 从源码构建

**环境要求：**

- Node.js 18+
- npm
- Git

```bash
# 克隆仓库
git clone https://github.com/xiaoY233/Chat2API.git
cd Chat2API

# 安装依赖
npm install

# 启动开发服务器
npx electron-vite dev 2>&1
```

### 构建生产版本

```bash
npm run build              # 构建应用
npm run build:mac          # 构建 macOS 版本 (dmg, zip)
npm run build:win          # 构建 Windows 版本 (nsis)
npm run build:linux        # 构建 Linux 版本 (AppImage, deb)
npm run build:all          # 构建所有平台
```

## 🌐 WebUI（无 Electron）模式

适用于服务器和 Docker 场景：后端代理 + 管理 API + WebUI 在同一进程内运行，不依赖桌面窗口。

### 本地运行

```bash
# 构建 main + renderer
npm run build:web

# 启动纯 Node Web 服务
npm run start:web
```

默认访问地址：

- WebUI：`http://127.0.0.1:18181/`
- 管理 API：`http://127.0.0.1:18181/v0/management`
- OpenAI 兼容 API：`http://127.0.0.1:18181/v1`

常用环境变量：

- `WEB_PROXY_HOST`（默认 `0.0.0.0`）
- `WEB_PROXY_PORT`（默认 `18181`）
- `WEB_MANAGEMENT_ENABLED`（默认启用）
- `WEB_MANAGEMENT_SECRET`（建议在生产环境设置）
- `WEB_UI_DIR`（默认 `out/renderer`）
- `CHAT2API_STORAGE_DIR`（全局存储目录覆盖，优先级最高）
- `CHAT2API_WEB_STORAGE_DIR`（仅 Web 模式存储目录覆盖）

存储目录隔离说明：

- Web 模式默认使用：`~/.chat2api-web`
- Electron 桌面模式默认使用：`~/.chat2api`

这样可以避免两种运行模式共享同一个 `data.json` 导致的配置/加密格式冲突。

### Docker 运行

```bash
# 构建并启动
docker compose -f docker-compose.web.yml up -d --build

# 查看日志
docker compose -f docker-compose.web.yml logs -f
```

首次使用前请修改 `docker-compose.web.yml` 中的 `WEB_MANAGEMENT_SECRET`。

## 📖 使用方法

### 步骤 1：启动应用

安装完成后，启动 Chat2API。您将看到主仪表盘。

### 步骤 2：添加供应商

1. 从侧边栏导航到**供应商**页面
2. 点击**添加供应商**按钮
3. 选择一个内置供应商（例如 DeepSeek）
4. 输入您的认证凭证

例如，获取 DeepSeek Token：

1. 访问 [DeepSeek Chat](https://chat.deepseek.com/)
2. 开始任意对话
3. 按 `F12` 打开开发者工具
4. 转到 **Application** > **Local Storage**
5. 找到 `userToken` 并复制其值

### 步骤 3：配置代理

1. 从侧边栏导航到**代理设置**页面
2. 设置端口（默认：8080）
3. 选择负载均衡策略：
   - **轮询**：在账户间均匀分配请求
   - **填充优先**：使用一个账户直到达到限制
   - **故障转移**：失败时自动切换
4. 点击**启动代理**

### 步骤 4：测试 API

使用 Python (OpenAI SDK)：

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-api-key",
    base_url="http://localhost:8080/v1"
)

response = client.chat.completions.create(
    model="DeepSeek-V3.2",
    messages=[
        {"role": "user", "content": "你好，你是谁？"}
    ]
)

print(response.choices[0].message.content)
```

### 步骤 5：管理 API Key（可选）

为了安全，您可以启用 API Key 认证：

1. 转到 **API Keys** 页面
2. 点击**新建 API Key**
3. 输入名称和描述
4. 复制生成的密钥

## 📸 截图

| 仪表盘 | 服务商 |
|--------|--------|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Providers](docs/screenshots/providers.png) |

| 代理设置 | API Key |
|----------|---------|
| ![Proxy](docs/screenshots/proxy.png) | ![API Keys](docs/screenshots/api-keys.png) |

| 模型管理 | 会话管理 |
|----------|----------|
| ![Models](docs/screenshots/models.png) | ![Session](docs/screenshots/Session.png) |

## ⚙️ 设置选项

- **端口**：更改代理监听端口（默认：8080）
- **路由策略**：轮询（Round Robin）或填充优先（Fill First）
- **自动启动**：应用启动时自动启动代理
- **主题**：浅色、深色或跟随系统
- **语言**：英文或简体中文

## 🏗️ 项目结构

```
Chat2API/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts            # 应用入口
│   │   ├── tray.ts             # 系统托盘集成
│   │   ├── proxy/              # 代理服务器管理
│   │   ├── ipc/                # IPC 处理器
│   │   └── utils/              # 工具函数
│   ├── preload/                # 上下文桥接
│   └── renderer/               # React 前端
│       ├── components/         # UI 组件
│       ├── pages/              # 页面组件
│       ├── stores/             # Zustand 状态
│       └── hooks/              # 自定义 Hooks
├── build/                      # 构建资源
└── scripts/                    # 构建脚本
```

## 🔧 技术栈

| 组件   | 技术                    |
| ---- | --------------------- |
| 框架   | Electron 33+          |
| 前端   | React 18 + TypeScript |
| 样式   | Tailwind CSS          |
| 状态管理 | Zustand               |
| 构建工具 | Vite + electron-vite  |
| 打包工具 | electron-builder      |
| 服务器  | Koa                   |

## 📁 数据存储

应用数据存储在 `~/.chat2api/` 目录下：

- `config.json` - 应用配置
- `providers.json` - 服务商设置
- `accounts.json` - 账户凭证（加密）
- `logs/` - 请求日志

## ❓ 常见问题

### macOS 提示"应用已损坏，无法打开"？

由于 macOS 的安全机制，非 App Store 下载的应用可能会触发此提示。运行以下命令即可修复：

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Chat2API.app"
```

### 如何更新？

在 **关于** 页面检查更新，或从 [GitHub Releases](https://github.com/xiaoY233/Chat2API/releases) 下载最新版本。

## 🔄 Fork 同步与 Web 持续可用（Docker）

如果你希望在自己的 GitHub Fork 中持续跟进上游新特性，同时保持 Web 改动稳定可用，推荐使用以下流程。

### 1. 首次配置远程仓库并推送到你的 GitHub

```bash
# 在本地仓库中执行
git remote rename origin upstream
git remote add origin https://github.com/<your-name>/Chat2API.git

# 首次推送当前分支到你的 Fork
git push -u origin main
git push -u origin web
```

### 2. 启用自动上游同步

仓库内置了 `.github/workflows/sync-upstream.yml`：

- 每天自动触发一次（UTC 02:23）
- 也支持手动触发（Actions 页面）
- 自动从 `xiaoY233/Chat2API@main` 合并到你的 `web` 分支同步 PR

建议：将 `web` 设为你的长期运行分支，在 PR 合并前要求 CI 通过。

### 3. 自动 Web 兼容性回归

`.github/workflows/web-compat.yml` 会在推送和 PR 时自动检查：

- `build:web` 是否成功
- `out/main/web.js` 是否可启动
- `/health` 与 `/v1/models` 是否可访问
- Docker 运行时是否正常

### 4. 自动 Docker 构建并发布镜像

`.github/workflows/docker-web.yml` 会自动构建 `Dockerfile.web`，并推送到 GHCR：

- 镜像地址：`ghcr.io/<your-name>/chat2api-web`
- 架构：`linux/amd64`、`linux/arm64`
- 触发：push、PR、tag、手动触发

拉取示例：

```bash
docker pull ghcr.io/<your-name>/chat2api-web:latest
docker run -d --name chat2api-web -p 18181:18181 ghcr.io/<your-name>/chat2api-web:latest
```

### 5. 推荐保护策略

- 为 `web` 分支开启 Branch Protection
- 将 `Web Compatibility` 设为必需检查
- 同步 PR 仅在检查通过后合并

这样上游更新会自动进入你的 Fork，并由 CI 自动验证 Web 与 Docker 可用性，避免“同步了新特性但 Web 端不可用”的回归问题。

## 🤝 贡献

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

## 📄 许可证

GNU 通用公共许可证 v3.0。详见 [LICENSE](LICENSE)。

这意味着：

- ✅ 可以自由使用、修改和分发
- ✅ 衍生作品必须以相同许可证开源
- ✅ 必须保留原始版权声明

## 🙏 致谢

- [Electron](https://www.electronjs.org/) - 跨平台框架
- [React](https://react.dev/) - UI 框架
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的 JavaScript
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [Zustand](https://zustand-demo.pmnd.rs/) - 状态管理
- [Koa](https://koajs.com/) - HTTP 服务器

