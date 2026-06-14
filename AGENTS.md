# Repository Guidelines

## Project Structure & Module Organization

This repository is currently in the planning stage for **Fatal Chase: Chaos Law**, a browser-based multiplayer arena game. Core documents live at the repository root:

- `致命追击_游戏设计大纲.md`: game design document.
- `致命追击_架构计划.md`: web architecture plan.
- `致命追击_UIUX方案.md`: UI/UX direction.
- `致命追击_开发任务拆分.md`: phased implementation backlog.
- `.impeccable.md`: persistent design context.

Implementation has started under the planned monorepo structure:

```text
FatalChaseWeb/apps/client
FatalChaseWeb/apps/server
FatalChaseWeb/packages/shared
FatalChaseWeb/configs
FatalChaseWeb/tests
```

## Build, Test, and Development Commands

Run commands from `FatalChaseWeb/`:

```bash
npm install        # install dependencies
npm run dev        # run local client/server dev mode
npm run build      # create production build
npm test           # run automated tests
npm run lint       # run lint checks
```

Document any new command in this file or the relevant README when it is added.

## Coding Style & Naming Conventions

Use TypeScript for client, server, and shared packages. Prefer 2-space indentation, strict typing, small modules, and explicit state models. Use `camelCase` for variables/functions, `PascalCase` for classes/components/types, and `kebab-case` for file names unless framework conventions require otherwise. Keep gameplay rules data-driven through `configs/*.json`.

## Testing Guidelines

Add tests with each gameplay rule or shared-state change. Prioritize deterministic tests for hunt-chain transitions, limb-loss effects, afterlife state changes, projectile hits, and config validation. Name tests by behavior, for example `hunt-chain-transfers-target.test.ts`.

## Commit & Pull Request Guidelines

No Git history is available yet. Use Conventional Commits:

```text
feat(combat): 实现蓄力射箭
fix(limbs): 修正断腿翻滚倍率
docs: 更新 UI 方案
```

Pull requests should include a short summary, changed modules, validation commands, screenshots or clips for UI/gameplay changes, and links to relevant task IDs or design docs.

## Security & Configuration Tips

Do not hardcode secrets. The client must never authoritatively declare kills, limb loss, rewards, or owned cosmetics. Keep server-authoritative rules in server/shared modules and treat client effects as presentation only.
