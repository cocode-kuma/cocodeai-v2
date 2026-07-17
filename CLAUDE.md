# CLAUDE.md

CocodeAI 是酷码工作室（Cocode Studio）基于开源项目 OpenWork 改造的智能桌面助手。

## 项目定位

- 面向中文用户的 AI 桌面应用
- 本地优先、开箱即用
- 去除 MCP 等不需要的功能，专注核心体验

## 命名规范（CRITICAL）

**所有新增代码必须使用 `cocodeai` 前缀，严禁出现 `openwork` 或 `OpenWork`：**

| 类别 | 规范 | 示例 |
|------|------|------|
| 环境变量 | `COCODEAI_*` | `COCODEAI_DEV_MODE`, `COCODEAI_DOCS_DIR` |
| localStorage key | `cocodeai.*` | `cocodeai.language`, `cocodeai.themePref` |
| 包名 scope | `@cocodeai/*` | `@cocodeai/app`, `@cocodeai/types` |
| 二进制/命令名 | `cocodeai-*` | `cocodeai-server`, `cocodeai-bootstrap` |
| 协议 scheme | `cocodeai://` | `cocodeai://den-auth` |
| 文件/目录名 | `cocodeai-*` | `cocodeai-docs`, `cocodeai-ui-control.json` |
| 品牌显示名 | `CocodeAI` | 标题栏、关于页、提示信息 |
| 域名 | `cocodeai.com` | `app.cocodeai.com`, `api.cocodeai.com` |
| Bundle ID | `com.cocodeai.*` | `com.cocodeai.cocodeai` |
| 用户配置目录 | `~/.cocode/` | skills 目录、配置目录 |

**用户不可见但也不要用 `openwork` 命名的场景：**
- 函数/变量名中的 `openwork` → `cocodeai`
- 类型/接口名中的 `OpenWork` → `CocodeAI`
- 测试文件中的 `openwork` → `cocodeai`

**可以保留的例外（跨项目兼容性）：**
- `@opencode-ai/sdk` 等第三方 SDK 的包名
- `.opencode/` 目录（OpenCode 生态标准路径）

## 代码规范

### 架构原则

- **低耦合，高内聚**：模块间通过明确的接口通信，避免隐式依赖
- **单一职责**：每个文件/组件只做一件事
- **依赖注入**：优先通过 props/参数传递依赖，而非全局 import
- **避免循环依赖**：提取共享逻辑到独立模块

### 测试要求

- 所有新功能必须写测试
- 修改已有功能前先跑现有测试，确保不引入回归
- 测试覆盖：单元测试 + 集成测试 + E2E 验证
- 提 PR 前跑完整测试套件并贴结果

### TypeScript

- 禁止使用 `any`，除非万不得已并加注释说明
- 避免类型断言 `as`，优先用类型守卫
- 所有导出的函数/类型必须有 JSDoc 注释

### React 组件规范

- 优先使用 `@/components/ui` 中的 shadcn/ui（Base UI）组件
- 新组件放在合适的 `domains/<domain>/` 目录下
- 样式使用 Tailwind CSS，遵循 DLS 设计令牌（`--dls-*` CSS 变量）
- 组件 Props 用 TypeScript 显式声明，不依赖隐式 any

### 样式约定

- 使用 DLS 设计令牌系统（`apps/app/src/app/index.css`）
- 主色调：天空蓝 `--dls-accent: var(--sky-9)`
- 不在组件中硬编码颜色值，统一用 CSS 变量
- 默认面向非技术用户，UI 简洁直观

### 包管理

- 使用 **pnpm**，禁止 npm/yarn
- monorepo 构建用 Turborepo

### 技术栈

Tailwind CSS 4 + TypeScript + React 19 + Vite + shadcn/ui (Base UI) + TanStack Query + Zustand + Zod + Drizzle ORM + Better-Auth

### 代码风格

- 追求简洁，能用简单方案就不用复杂方案
- 使用最小 diff 完成修改，改完后再想能不能更小
- 类型系统能保证的不写 fallback 表达式

## 工作流

- 改动前先理解现有代码
- 改动后验证体验（不只是跑测试），用截图/录屏证明
- 如果工作量大，分步推进，每步验证
- 代码改动在独立的 worktree/branch 上进行

## 体验验证

每个改动都可能影响外部世界（文件系统、数据库、API、会话等），所以默认不是"写代码碰运气"，而是**提出流程，然后作为终端用户驱动它并对照现实验证**。

通过产生 **fraimz**（逐帧证明）来验证：`evals/results/<run-id>/fraimz.html`，每帧绑定声明、用户操作、可观察断言和验证截图。

## 禁止事项

- ❌ 不要新增 MCP 相关代码（这是 CocodeAI，不需要 MCP）
- ❌ 不要使用 `openwork` 命名任何东西
- ❌ 不要引入新的多语言支持（只保留中文）
- ❌ 不要在用户可见界面中出现 "OpenWork" 品牌文字
- ❌ 不要用 npm 或 yarn，只用 pnpm
- ❌ 不要使用 `any` 类型
