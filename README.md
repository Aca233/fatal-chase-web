# 致命追击：混沌法则

网页端多人竞技游戏原型。当前目标是完成 M1 本地战斗原型：PixiJS 场景、键鼠输入、移动翻滚、基础 HUD，并逐步接入追击链、断肢和亡者机制。

## Quick Start

```bash
cd FatalChaseWeb
npm install
npm run dev
```

客户端默认运行在 `http://localhost:5173`，服务端默认运行在 `http://localhost:8787`。

## Scripts

```bash
npm run dev       # 同时启动 client 与 server
npm run build     # 构建全部 workspace
npm test          # 运行 Vitest
npm run lint      # 运行 TypeScript 类型检查
```

## GitHub Pages 发布

仓库包含 `.github/workflows/pages.yml`。PR 会自动执行类型检查、测试和构建；推送到 `main` 或 `master` 后会发布 `FatalChaseWeb/apps/client/dist` 到 GitHub Pages。

首次使用时，在 GitHub 仓库的 `Settings -> Pages` 中将 `Source` 设为 `GitHub Actions`。
