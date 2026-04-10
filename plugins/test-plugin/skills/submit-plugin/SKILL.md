---
name: submit-plugin
description: This skill should be used when the user asks to "submit my plugin", "publish my plugin", "open a PR for my plugin", "register my plugin", or wants to add a plugin to the OKX internal master-plugin-repository marketplace via a GitHub PR. This is the bootstrap submit skill that ships in test-plugin and is superseded by /official-plugins:submit-plugin once the official plugin is installed. Make sure to invoke this whenever the user mentions submitting or publishing a plugin and only test-plugin is installed.
when: When the user wants to submit, publish, upload, or add a plugin to master-plugin-repository or the OKX hackathon plugin marketplace.
---

# submit-plugin (bootstrap)

You are helping an OKX hackathon participant submit a Claude Code plugin to `mastersamasama/master-plugin-repository`. This is the **bootstrap** submit skill that ships inside `test-plugin`. It uses inline sanity checks (no external validator) and is intended to onboard the first real plugins into the marketplace, including its own eventual replacement, `plugin-store-tools`.

Follow this runbook exactly. Do not skip steps. Do not invent files. Ask the user before any destructive action.

## 0. Preflight — understand the target

Ask the user (use the AskUserQuestion tool if multiple options are involved, otherwise just ask in plain text) for the **absolute path** to the plugin they want to submit. Call this `PLUGIN_DIR`.

Confirm:

- The directory exists
- It contains `.claude-plugin/plugin.json`

If either check fails, stop and tell the user what's missing. Do not proceed.

## 1. Inline format + quality checks (THE GATE)

This is the **bootstrap** version of the gate — `test-plugin` ships before `official-plugins` does, so we don't have access to `${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs` here. Run these checks inline. Collect **every** problem, then report them all at once — don't bail on the first error. **Block submission on any error.**

### 1a. plugin.json structural checks (FORMAT)

- Read `PLUGIN_DIR/.claude-plugin/plugin.json`
- Parse it as JSON. On parse error, record the error message verbatim.
- Required field `name` must exist and match `^[a-z][a-z0-9-]*$` (kebab-case, starts with a letter)
- Required field `description` must exist and be a non-empty string
- Optional `version`, if present, should look like semver (`^\d+\.\d+\.\d+`)
- The value of `name` **must equal** the leaf directory name of `PLUGIN_DIR` (e.g., plugin name `foo-bar` in `plugins/foo-bar/`). If not, record it.

### 1b. Skills structural checks (FORMAT, if any)

- If `PLUGIN_DIR/skills/` exists:
  - For every subdirectory `skills/<skill-name>/`, require a `SKILL.md` file inside.
  - Read each `SKILL.md`. The file must start with a YAML frontmatter block delimited by `---`.
  - The frontmatter must parse as YAML and must contain a `name` field.
  - The `name` in the frontmatter should match `<skill-name>` (the directory name).

### 1c. Path traversal check (FORMAT)

- Scan `plugin.json` for any value that is a string containing `..`. If found (e.g., `"skills": "../../evil"`), record it as an error.

### 1d. Quality gate: at least one component

Walk `PLUGIN_DIR` and confirm at least one of these exists:
- `skills/<name>/SKILL.md` (any name)
- `commands/*.md`
- `agents/*.md`
- `hooks/hooks.json`
- `mcpServers` field set in plugin.json
- `mcp.json` file

If **none**: error `QUALITY_NO_COMPONENTS` — "plugin has zero components; a plugin without skills/commands/agents/hooks/MCP does nothing useful".

### 1e. Quality gate: description length

If `plugin.json.description` is a non-empty string but its length is **< 20 characters**, error: `QUALITY_DESCRIPTION_TOO_SHORT` — "description is too short to be useful in the marketplace UI; expand to a full sentence".

### 1f. Quality gate: no unfilled template placeholders in plugin.json

For every string value in plugin.json, check if it matches `\{\{[^}]+\}\}`. If yes, error: `QUALITY_TEMPLATE_PLACEHOLDER` — name the field and the placeholder, tell the user to fill it in.

### 1g. Quality gate: no unfilled placeholders in SKILL.md descriptions

For every `skills/<name>/SKILL.md` frontmatter, check if `description` contains `\{\{[^}]+\}\}`. If yes, error: `SKILL_DESCRIPTION_PLACEHOLDER`.

### 1h. Quality gate: skill description style

For every `skills/<name>/SKILL.md` frontmatter, check if `description` starts with (case-insensitive) `"This skill should be used when"`. If not, error: `SKILL_DESCRIPTION_STYLE` — "skill descriptions must follow the third-person trigger-phrase convention or they will undertrigger".

### 1i. Quality gate: secret pattern scan

Walk every file in `PLUGIN_DIR` with extension `.md`, `.json`, `.yaml`, `.yml`, `.sh`, `.py`, `.js`, `.ts`, `.mjs`, `.txt`, `.env`. Skip directories `.git/`, `node_modules/`, `examples/`, `templates/`. For each file, scan its contents for any of these patterns:

- `sk-[a-zA-Z0-9]{20,}` — OpenAI API key
- `sk-ant-[a-zA-Z0-9_-]{20,}` — Anthropic API key
- `ghp_[a-zA-Z0-9]{30,}` — GitHub PAT
- `github_pat_[a-zA-Z0-9_]{30,}` — GitHub fine-grained PAT
- `AKIA[0-9A-Z]{16}` — AWS access key
- `AIza[0-9A-Za-z_-]{30,}` — Google API key
- `xox[baprs]-[a-zA-Z0-9-]{20,}` — Slack token
- `eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}` — JWT-looking

If any match: error `QUALITY_SECRET_PATTERN` — name the file, line number, and the pattern matched. **Stop.** This is the single biggest reason a submission gets rejected for compliance.

### 1j. Report and decide

If **any errors** were found (format OR quality):

1. Print every error in this format:
   ```
   BLOCKED  <file>:<line>  [<code>]
            <message>
            Why: <why>
            Fix: <fix>
   ```
2. Print summary: `SUBMISSION BLOCKED — N errors. Fix every error and re-invoke me.`
3. **STOP**. Do not proceed.
4. Do **NOT** offer to bypass. Do **NOT** ask "proceed anyway?". The gate exists to protect the marketplace and OKX compliance.

If everything is clean, say so briefly and continue to step 2.

## 2. Collect marketplace-entry metadata

You need a JSON object to append to `marketplace.json`'s `plugins` array. Collect these fields from the user (default where noted):

- `name` — default: the plugin's `name` from plugin.json
- `description` — default: the plugin's `description` from plugin.json
- `version` — default: the plugin's `version` from plugin.json, or `"0.1.0"`
- `author.name` — ask the user (team name or individual)
- `keywords` — optional array; ask for comma-separated list, default `["hackathon", "okx"]`

## 3. Ask: which submission mode?

Use AskUserQuestion with two options:

- **external** — "My plugin lives in its own GitHub repo. The PR will only add an entry to marketplace.json pointing at that repo."
- **monorepo** — "Copy my plugin directory into master-plugin-repository under plugins/<name>/ as part of the PR."

Recommend **external** for most hackathon teams because the PR is smaller and each team owns their code.

## 4. Preflight — gh CLI

Run these checks via Bash:

```bash
gh --version
gh auth status
```

- If `gh` is not installed, stop and print:
  > Install GitHub CLI first: https://cli.github.com/ — then run `gh auth login` and invoke this skill again.
- If not authenticated, stop and print:
  > Run `gh auth login` to authenticate, then invoke this skill again.

## 5. Mode branch

### 5a. Mode: **external**

You need the participant's plugin repo to already be pushed to GitHub.

First, ask the participant **which layout** their repo uses. Use AskUserQuestion with two options:

- **whole-repo** — "The entire repo IS my plugin (`.claude-plugin/plugin.json` is at the repo root)."
- **subdir** — "My plugin lives in a subdirectory of a larger repo (e.g., `plugins/my-plugin/.claude-plugin/plugin.json`)."

Based on the answer, collect the fields you'll need:

**Whole-repo fields:**
- `url` — full HTTPS git URL, e.g., `https://github.com/team-alpha/my-plugin.git`
- `sha` — **required** for reproducibility. Ask the participant to run `git rev-parse HEAD` inside their plugin repo and paste the result.

**Subdir fields:**
- `url` — owner/repo shorthand (e.g., `team-alpha/monorepo`) **or** full HTTPS git URL
- `path` — directory path inside that repo (e.g., `plugins/my-plugin`)
- `ref` — branch or tag. Default: `main`.
- `sha` — **required**. Ask participant to run `git rev-parse HEAD` on the branch/tag they want pinned.

After collecting:

1. Verify the repo is accessible by trying a plain `git ls-remote <url>` (no auth needed for public repos). If it fails, stop and tell the user to make the repo accessible first.
2. Pick a working directory for the marketplace fork. Default: `%TEMP%/master-plugin-repository-submit-<plugin-name>` (Windows) or `/tmp/master-plugin-repository-submit-<plugin-name>` (unix). Confirm with user.
3. Fork + clone:
   ```bash
   gh repo fork mastersamasama/master-plugin-repository --clone --remote
   ```
   (Run this **inside** the chosen working directory's parent; gh creates the fork under the authenticated user and clones it.)
4. `cd` into the cloned fork.
5. Create a branch: `git checkout -b submit/<plugin-name>`
6. Read `.claude-plugin/marketplace.json`. Parse it as JSON. Append a new entry to the `plugins` array.

   **If whole-repo**, the entry is:
   ```json
   {
     "name": "<plugin-name>",
     "description": "<description>",
     "version": "<version>",
     "author": { "name": "<author.name>" },
     "category": "<category-or-omit>",
     "keywords": [...],
     "source": {
       "source": "url",
       "url": "<url>",
       "sha": "<sha>"
     }
   }
   ```

   **If subdir**, the entry is:
   ```json
   {
     "name": "<plugin-name>",
     "description": "<description>",
     "version": "<version>",
     "author": { "name": "<author.name>" },
     "category": "<category-or-omit>",
     "keywords": [...],
     "source": {
       "source": "git-subdir",
       "url": "<url>",
       "path": "<path>",
       "ref": "<ref>",
       "sha": "<sha>"
     }
   }
   ```

   Write the file back with 2-space indentation and a trailing newline. Preserve the existing formatting style. **Before writing**, show the user the diff and get explicit confirmation.

7. Stage + commit:
   ```bash
   git add .claude-plugin/marketplace.json
   git commit -m "Add <plugin-name> to marketplace"
   ```
8. Push: `git push -u origin submit/<plugin-name>`
9. Open PR:
   ```bash
   gh pr create \
     --repo mastersamasama/master-plugin-repository \
     --base main \
     --head <your-github-username>:submit/<plugin-name> \
     --title "Add <plugin-name> to marketplace" \
     --body "<body>"
   ```
   Body should include: plugin name, description, submission mode (external, whole-repo or subdir), source url / path / ref / sha, author, and a note that CI does not yet exist (Phase A) so the reviewer will check manually.

### 5b. Mode: **monorepo**

In monorepo mode, the plugin is copied into this marketplace repo itself, and the marketplace entry's `source` is a **simple relative-path string** (not an object).

1. Pick working directory, fork + clone, and create branch `submit/<plugin-name>` — same as steps 2–5 above.
2. Copy the participant's plugin directory into the clone:
   - Destination: `<clone>/plugins/<plugin-name>/`
   - Use `cp -r` (Unix) or `xcopy /E /I /Y` (Windows). Confirm with user before copying.
   - Refuse to proceed if `plugins/<plugin-name>/` already exists in the fork — that's a name collision; tell the user to rename their plugin.
3. Read `.claude-plugin/marketplace.json`, append a new entry. **Note the `source` is a string, not an object:**
   ```json
   {
     "name": "<plugin-name>",
     "description": "<description>",
     "version": "<version>",
     "author": { "name": "<author.name>" },
     "category": "<category-or-omit>",
     "keywords": [...],
     "source": "./plugins/<plugin-name>"
   }
   ```
   Before writing, show the user the diff and get explicit confirmation.
4. Stage all new files under `plugins/<plugin-name>/` **and** the marketplace.json edit:
   ```bash
   git add plugins/<plugin-name> .claude-plugin/marketplace.json
   git commit -m "Add <plugin-name> plugin and marketplace entry"
   ```
5. Push and open PR — same as step 8–9 above, with submission mode **monorepo** in the body.

## 6. Report

Print the PR URL to the user. Then print:

> **Next steps:** a reviewer will manually verify your submission (no automated CI exists yet — that arrives in Phase B with `plugin-store-tools`). If the reviewer requests changes, update your branch and push; the PR will pick up the changes automatically.

## 7. Behavior rules

- **Never** commit or push without first showing the user the exact diff and getting confirmation.
- **Never** skip sanity checks.
- **Never** overwrite an existing `plugins/<name>/` directory in monorepo mode.
- **Never** include secrets, credentials, OKX-confidential data, or third-party IP in the PR. If you notice any in the plugin content, stop and warn the user.
- If any Bash command fails unexpectedly, stop and report the error verbatim. Do not retry silently.
- If the user's plugin targets sensitive OKX systems, remind them the repo is under OKX internal license and submissions must comply with the LICENSE file at the repo root.
