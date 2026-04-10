# master-plugin-repository

**OKX 内部 Claude Code 插件市场** —— OKX 内部黑客松的官方插件提交入口。

> English version: [README.md](./README.md)

## 这是什么

一个 Claude Code 插件市场（marketplace）。添加该市场后，黑客松提交的每一个插件都会出现在 Claude Code 的 `/plugin` 界面中，参与者和评审可以一键安装。所有 PR 在合入前都会经过 GitHub Actions 自动校验。

## 面向谁

仅限获得授权的 OKX 员工和黑客松参赛者。使用受 [LICENSE](./LICENSE) 约束 —— 保密、仅限内部使用，未经 OKX 法务书面同意不得外传。比赛规则、参赛资格与评审标准详见 [HACKATHON.md](./HACKATHON.md)，完整提交流程详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 将该市场添加到 Claude Code

在任意 Claude Code 会话中执行：

```
/plugin marketplace add mastersamasama/master-plugin-repository
```

然后打开市场面板：

```
/plugin
```

在 **Discover（发现）** 标签页中可以看到已提交的插件。

## 安装插件

从列表中挑选一个插件并执行：

```
/plugin install <plugin-name>@master-plugin-repository
/reload-plugins
```

安装后，该插件附带的 skills / commands 即可在当前会话中使用。

## 提交插件（TL;DR）

请使用本市场内置的 **`official-plugins`** 插件，它包含两个 skill：

- **`/official-plugins:package-plugin`** —— 交互式工作流，把你已有的任意组合（已写好的 skills、slash commands、agents、hooks、脚本、MCP server 配置；甚至什么都没有也行）打包成一个格式正确的 Claude Code 插件目录，最后会自动跑校验器。
- **`/official-plugins:submit-plugin`** —— 对你的插件运行 **严格质量门禁**，通过后通过 `gh` 自动 fork 本仓库、给 `marketplace.json` 加条目、打开 PR。支持两种提交模式：**monorepo**（你的插件被复制到本仓库的 `plugins/<name>/` 下）与 **external**（你的插件保存在你自己的仓库里，PR 只往 `marketplace.json` 里加一条指向你仓库的条目）。

```
1. /plugin marketplace add mastersamasama/master-plugin-repository
2. /plugin install official-plugins@master-plugin-repository
3. /reload-plugins
4. /official-plugins:package-plugin     ← 回答 5–8 个问题
5. /official-plugins:submit-plugin      ← 回答 3–5 个问题，自动开 PR
```

60 秒入门请看 [`plugins/official-plugins/QUICKSTART.md`](./plugins/official-plugins/QUICKSTART.md)，完整 skill 说明请看 [`plugins/official-plugins/README.md`](./plugins/official-plugins/README.md)。

## `submit-plugin` 会拦截哪些问题

`submit-plugin` 在做任何对外可见的操作之前，会先以 `--strict` 模式调用 `validate.mjs`。下列任意一项触发都会**阻断**提交：

**格式门禁**（始终为错误）：
- `plugin.json` 缺失或格式错误
- `name` 不是 kebab-case，或与目录名不一致
- `SKILL.md` 缺失或 YAML frontmatter 不合法
- 任意字符串字段中出现路径穿越（`..`）

**质量门禁**（在 `--strict` 模式下为错误，`submit-plugin` 始终启用此模式）：
- skill description 缺失，或没有遵循第三人称 `"This skill should be used when the user asks to ..."` 的触发短语规范
- plugin description 缺失、长度不足 20 字符，或仍包含未填充的 `{{...}}` 模板占位符
- 插件没有任何组件（没有 skills / commands / agents / hooks / MCP server）
- **缺少根目录的 `README.md`**，**或** README 中没有出现插件的 kebab-case 名称
- 文件中含有已知格式的密钥（OpenAI / Anthropic API key、GitHub PAT、AWS key、Google key、Slack token、JWT 等）

完整的错误码、原因与修复方法见 [`plugins/official-plugins/skills/submit-plugin/references/quality-gates.md`](./plugins/official-plugins/skills/submit-plugin/references/quality-gates.md)。

你可以在提交之前自己跑一遍校验器：

```
node plugins/official-plugins/scripts/validate.mjs --plugin <你的插件目录> --strict
```

这是一个零依赖的 Node.js 单文件脚本，不需要 `npm install`。

## 持续集成

每个 PR 都会触发 `.github/workflows/validate-submissions.yml`，使用 Node 20 对整个市场跑一次校验器。CI 会在人工评审之前先拦截掉任何格式错误的插件或市场条目。

## 仓库结构

```
.claude-plugin/
└── marketplace.json                # 市场目录文件
.github/
├── workflows/validate-submissions.yml  # 每个 PR 自动跑校验
├── PULL_REQUEST_TEMPLATE.md
└── ISSUE_TEMPLATE/plugin-submission.md
plugins/
├── official-plugins/               # 黑客松官方工具（package + submit）
│   ├── scripts/validate.mjs        # 零依赖校验器（CI 共用）
│   ├── schemas/                    # JSON Schema 文档
│   ├── templates/                  # 新插件占位模板
│   ├── examples/                   # minimal-plugin + multi-component-plugin
│   └── skills/
│       ├── package-plugin/
│       └── submit-plugin/
└── test-plugin/                    # 引导用插件（保留作参考）
CONTRIBUTING.md                     # 完整提交流程
HACKATHON.md                        # 规则、时间表、评审标准
CODE_OF_CONDUCT.md                  # 引用 OKX 内部行为准则
LICENSE                             # OKX 专有授权声明
README.md                           # English
README.zh-Hans.md                   # 你正在阅读
```

## 关于 `test-plugin`

`test-plugin` 是 `official-plugins` 出现之前的**引导用产物**。它内置一个更简单的 `submit-plugin` skill，使用内联检查。我们把它保留在市场中，作为参赛者可以参考的"最小合法插件"样例。**真实提交请使用 `official-plugins` —— 它的 `submit-plugin` 会通过共享校验器运行严格的质量门禁。**

## 合规声明

本仓库及其中所有插件均为 OKX 机密资产。禁止对外发布、对外 fork 或在 OKX 授权渠道之外分享。提交的插件中不得包含任何密钥、机密 OKX 数据或你不拥有合法使用权的第三方知识产权。完整条款详见 [LICENSE](./LICENSE)，行为准则详见 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 问题反馈

使用 **Plugin submission help** issue 模板提交问题，或通过 OKX 内部渠道联系黑客松组织者。
