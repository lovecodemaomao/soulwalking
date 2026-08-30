# GitHub Pages 静态体验版

GitHub Pages 发布的是 `docs/` 目录中的静态体验版，入口为 `docs/index.html`。

## 保留的功能

- 三条预设老门东路线：城墙听风、旧城拾光、街巷寻味。
- 路线选择、路线步骤展示、复制路线文字和打印/保存 PDF。

## 不包含的功能

- Python/FastAPI API、AI 路线生成、MCP、高德实时路线/天气、用户记忆和反馈保存。
- 页面不包含任何 API Key 或安全密钥。

## 发布方式

推送到 `main` 后，`.github/workflows/pages.yml` 会把 `docs/` 部署到 GitHub Pages。首次发布时，请在仓库的 **Settings → Pages** 中将 Source 设为 **GitHub Actions**。
