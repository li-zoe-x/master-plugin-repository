# master-plugin-repository

**OKX Internal Claude Code Plugin Marketplace** — the official submission target for the OKX internal hackathon.

> 简体中文版本： [README.zh-Hans.md](./README.zh-Hans.md)

## What this is

A Claude Code plugin marketplace. Once you add it, every plugin submitted to the hackathon becomes discoverable inside Claude Code's `/plugin` interface and installable with one command. PRs are validated by GitHub Actions before merge.

## Who it's for

Authorized OKX personnel and hackathon participants only. Use is governed by the [LICENSE](./LICENSE) — confidential, internal-use-only, no redistribution without OKX Legal approval. See [HACKATHON.md](./HACKATHON.md) for rules, eligibility, and judging, and [CONTRIBUTING.md](./CONTRIBUTING.md) for the full submission workflow.

## Add this marketplace to Claude Code

In any Claude Code session:

```
/plugin marketplace add mastersamasama/master-plugin-repository
```

Then open the marketplace UI:

```
/plugin
```

You'll see submitted plugins under the **Discover** tab.

## Install a plugin

Pick a plugin from the list and run:

```
/plugin install <plugin-name>@master-plugin-repository
/reload-plugins
```

The plugin's skills/commands are then invokable in your current session.

## Submit a plugin (TL;DR)

Use the **`official-plugins`** plugin (shipped inside this marketplace). It contains two skills:

- **`/official-plugins:package-plugin`** — interactive workflow that takes whatever you have (existing skills, slash commands, agents, hooks, scripts, MCP server configs, or any combination — even nothing at all) and turns it into a properly-formed Claude Code plugin directory. Runs the validator at the end.
- **`/official-plugins:submit-plugin`** — runs the **strict quality gate** against your plugin and, if it passes, opens a GitHub PR via `gh` to register your plugin in `marketplace.json`. Supports both **monorepo** mode (your plugin gets copied into `plugins/<name>/` here) and **external** mode (your plugin lives in your own repo and the PR only adds a marketplace entry).

```
1. /plugin marketplace add mastersamasama/master-plugin-repository
2. /plugin install official-plugins@master-plugin-repository
3. /reload-plugins
4. /official-plugins:package-plugin     ← answer 5–8 questions
5. /official-plugins:submit-plugin      ← answer 3–5 questions, opens PR
```

See [`plugins/official-plugins/QUICKSTART.md`](./plugins/official-plugins/QUICKSTART.md) for the 60-second card and [`plugins/official-plugins/README.md`](./plugins/official-plugins/README.md) for the full skill reference.

## What `submit-plugin` blocks on

`submit-plugin` runs `validate.mjs --strict` before doing anything externally visible. Submission is **blocked** on any of these:

**Format gates** (always errors):
- `plugin.json` malformed or missing
- `name` not kebab-case or doesn't match the directory name
- `SKILL.md` missing or has malformed YAML frontmatter
- Path traversal (`..`) in any string field

**Quality gates** (errors in `--strict`, the mode `submit-plugin` always uses):
- Skill description missing or doesn't follow the third-person `"This skill should be used when the user asks to ..."` trigger-phrase convention
- Plugin description missing, shorter than 20 characters, or contains unfilled `{{...}}` template placeholders
- Plugin has zero components (no skills, commands, agents, hooks, or MCP servers)
- **`README.md` missing** at the plugin root, **or** the README does not mention the plugin's kebab-case name
- Files contain a string matching known secret formats (OpenAI / Anthropic API keys, GitHub PATs, AWS keys, Google keys, Slack tokens, JWTs)

Full reference with explanations and fixes: [`plugins/official-plugins/skills/submit-plugin/references/quality-gates.md`](./plugins/official-plugins/skills/submit-plugin/references/quality-gates.md).

You can run the validator yourself before submitting:

```
node plugins/official-plugins/scripts/validate.mjs --plugin <your-plugin-dir> --strict
```

It's a single zero-dependency Node.js file — no `npm install` needed.

## Continuous integration

Every PR triggers `.github/workflows/validate-submissions.yml` which runs the validator over the entire marketplace using Node 20. CI catches any malformed plugin or marketplace entry before a human reviewer ever sees it.

## Repository layout

```
.claude-plugin/
└── marketplace.json                # the catalog
.github/
├── workflows/validate-submissions.yml  # CI validator on every PR
├── PULL_REQUEST_TEMPLATE.md
└── ISSUE_TEMPLATE/plugin-submission.md
plugins/
├── official-plugins/               # canonical hackathon tools (package + submit)
│   ├── scripts/validate.mjs        # zero-dep validator (shared with CI)
│   ├── schemas/                    # JSON Schema docs
│   ├── templates/                  # placeholder stubs for new plugins
│   ├── examples/                   # minimal-plugin + multi-component-plugin
│   └── skills/
│       ├── package-plugin/
│       └── submit-plugin/
└── test-plugin/                    # bootstrap artifact (kept for reference)
CONTRIBUTING.md                     # detailed submission workflow
HACKATHON.md                        # rules, timeline, judging criteria
CODE_OF_CONDUCT.md                  # references OKX internal policy
LICENSE                             # OKX proprietary notice
README.md                           # you are here
README.zh-Hans.md                   # 简体中文
```

## About `test-plugin`

`test-plugin` is the **bootstrap artifact** that shipped before `official-plugins` existed. It contains a simpler `submit-plugin` skill with inline sanity checks. It is kept in the marketplace as a minimal reference submission for participants who want to study the smallest possible plugin layout. **For real submissions, use `official-plugins` — its `submit-plugin` runs the strict quality gate via the shared validator.**

## Compliance notice

This repository and every plugin inside it are confidential OKX property. Do not publish, fork externally, or share outside authorized OKX channels. Submissions must contain no secrets, no confidential OKX data, and no third-party IP you do not have rights to. See [LICENSE](./LICENSE) for the full terms and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for the conduct policy reference.

## Questions

Open an issue using the **Plugin submission help** template, or contact the hackathon organizers through internal OKX channels.
