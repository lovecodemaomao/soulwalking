# Hugging Face Spaces 云端部署

面向比赛提交：免费、无需绑定信用卡、电脑关机后依然在线、自带 HTTPS。

## 为什么要改 HF Spaces

- **Render 免费档需要绑定信用卡**，不适合比赛提交。
- HF Spaces 免费 CPU 档完全免费，直接给一个公网 HTTPS 地址，评委点开即用。
- 本项目是 FastAPI 单容器应用，HF 的 **Docker SDK** 能直接构建并运行它。

HF 对 Docker 应用的唯一硬性要求：**应用必须监听 7860 端口**。项目 `Dockerfile`
已经改为 `--port ${PORT:-7860}`（Render 若再用，注入 `PORT=10000` 仍兼容）。

## 已准备好的文件

| 文件 | 作用 |
| --- | --- |
| `Dockerfile` | 监听 7860，`pip install .`，`uvicorn app.main:app` |
| `README.md` | 顶部 YAML 元数据 `sdk: docker` + `app_port: 7860`，同时是 Space 首页 |
| `.dockerignore` | 排除 `.env`、密钥、构建产物，**密钥绝不进镜像** |

## 部署步骤

### 1. 注册 / 登录

<https://huggingface.co> → 免费注册。

### 2. 创建 Space

打开 <https://huggingface.co/new-space>，按下面填：

- **Space name**：`soulwalking`（或任意英文名）
- **Select the Space SDK**：选 **Docker** → **Blank** 模板
- **Hardware**：**CPU basic · FREE**（默认就是，免费档）
- **Visibility**：**Public**（比赛方要能访问，必须公开）

点 **Create Space**。

### 3. 推送代码到 Space

在本项目根目录执行（把 `<你的用户名>` 换成你的 HF 用户名）：

```bash
git init
git branch -M main
git add .
git commit -m "deploy to Hugging Face Spaces"
git remote add space https://huggingface.co/spaces/<你的用户名>/soulwalking
git push space main --force
```

> 首次 push 会要求登录：**用户名**填 HF 用户名，**密码**填 Access Token
> （不是账号密码）。Token 在 <https://huggingface.co/settings/tokens> 生成，
> 权限勾选 **Write** 即可。
>
> `--force` 是为了覆盖 HF 创建 Space 时自动生成的空 README，让项目自己的
> `README.md`（含 `sdk: docker` 元数据）成为首页。

推送后 HF 会自动检测到 `Dockerfile` 开始构建（约 5～8 分钟，依赖 `chromadb`）。
构建进度在 Space 页面的 **Build** 标签查看。

### 4. 配置密钥（不写入仓库）

Space 页面 → **Settings** → **Variables and secrets**：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Variable | `EMBEDDING_BACKEND` | `hash` |
| Secret | `AMAP_API_KEY` | 高德「Web 服务」Key |
| Secret | `AMAP_JS_KEY` | 高德「Web 端(JS API)」Key |
| Secret | `AMAP_SECURITY_JS_CODE` | 该 JS Key 的安全密钥 |
| Secret | `DEEPSEEK_API_KEY` | DeepSeek Key |

值从本地 `.env` 复制，**只填在 Space 后台，绝不提交到仓库**。
保存后 Space 会自动重启并生效。

- `EMBEDDING_BACKEND=hash` 让检索用确定性降级，避免在云端下载 BGE 模型、
  缩短冷启动、也省内存；如需完整中文语义检索，改回 `sentence-transformers`
  （镜像更大、启动更慢，免费档内存可能吃紧，比赛演示建议用 `hash`）。
- 缺 DeepSeek Key 时路线照常生成（确定性降级），只是没有 AI 文字说明；
  缺高德 Key 时天气/道路折线降级为直线估算。至少要配好高德三个 Key，地图才完整。

### 5. 拿到访问地址

- **提交给比赛方的正式链接**：`https://huggingface.co/spaces/<用户名>/soulwalking`
- 直连域名：`https://<用户名>-soulwalking.hf.space`

### 6. 高德 Key 域名白名单

到高德开放平台，把该 **Web 端(JS API) Key** 的域名白名单加上：

```
<用户名>-soulwalking.hf.space
```

否则浏览器端地图加载会被拒。

## 注意事项（比赛前必看）

1. **免费 Space 会休眠**：约 48 小时无访问后进入睡眠，首次访问会有 1～2 分钟冷启动。
   提交前先自己点开一次唤醒，评委访问就顺畅了。
2. **临时磁盘**：免费档磁盘在重启后重置，SQLite/Chroma 运行时数据会清空；
   但 37 个节点种子数据、现场照片都在 Docker 镜像里，**不受影响**。
3. **链接优先给主域名** `huggingface.co/spaces/...`，比 `*.hf.space` 更正式、稳定。
4. 构建失败时看 **Build** 日志；常见原因是推送时漏了某个文件，确认 `Dockerfile`、
   `app/`、`web/`、`pyproject.toml`、`README.md` 都在根目录。
