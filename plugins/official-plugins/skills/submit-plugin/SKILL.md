---
name: submit-plugin
description: This skill should be used when the user asks to "submit my plugin", "publish my plugin", "open a PR for my plugin", "register my plugin", "add to marketplace", "submit to master-plugin-repository", "ship my plugin", "send my plugin to the hackathon", or is ready to send their packaged Claude Code plugin to the OKX hackathon marketplace. Always run package-plugin first to prepare and validate the plugin. Make sure to invoke this skill whenever the user mentions submitting, publishing, PR-ing, or shipping a plugin, even if they don't explicitly say "submit-plugin".
---

# submit-plugin (production)

You are the final step in the OKX hackathon submission flow. The participant should already have a packaged plugin directory (typically built by `/official-plugins:package-plugin`). Your job is to validate it one more time, collect the metadata for the marketplace entry, and open a GitHub PR against `mastersamasama/master-plugin-repository` that registers the plugin.

This skill is the **only** path that pushes externally-visible changes. Be conservative. Always confirm before fork, before commit, before push, before PR. Offer dry-run.

Follow this runbook strictly.

## 0. Locate the plugin

Ask the participant for the **absolute path** to their packaged plugin directory. Call this `PLUGIN_DIR`.

If `PLUGIN_DIR/.package-plugin.state.json` exists, read it. It contains the metadata `package-plugin` already collected — you can pre-fill from it and skip re-asking. Tell the user "I found your package-plugin state file and will pre-fill from it; let me know if anything is wrong."

Verify:
- `PLUGIN_DIR` exists and is a directory
- `PLUGIN_DIR/.claude-plugin/plugin.json` exists

If either check fails, stop and tell the user: "Run `/official-plugins:package-plugin` first to prepare your plugin." Do not proceed.

## 1. Validate (always, strict mode) — THE GATE

This is the **only gate** between low-quality submissions and the marketplace. Do not skip it. Do not weaken it. Do not let the participant talk you into bypassing it.

Run via Bash:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs --plugin <PLUGIN_DIR> --strict --json
```

The `--strict` flag turns on the **quality gate** in addition to the format gate. The combined check covers:

**Format gates** (always errors):
- `plugin.json` exists, parses, has kebab-case `name` matching directory
- Every `skills/<name>/SKILL.md` has YAML frontmatter with matching `name`
- No path traversal (`..`) in any string field
- Marketplace `source` shapes are well-formed (only relevant for `--marketplace`/`--all`)
- Plugin name unique within marketplace

**Quality gates** (errors in `--strict`, warnings otherwise):
- **`SKILL_DESCRIPTION_MISSING`** — every skill must have a description
- **`SKILL_DESCRIPTION_STYLE`** — descriptions must follow `"This skill should be used when the user asks to ..."` (third-person trigger-phrase convention). Vague descriptions undertrigger.
- **`SKILL_DESCRIPTION_PLACEHOLDER`** — `{{...}}` left unfilled in a SKILL.md description
- **`PLUGIN_DESCRIPTION_MISSING`** — plugin.json must have a description
- **`QUALITY_DESCRIPTION_TOO_SHORT`** — plugin.json description must be ≥ 20 characters (catches "test", "demo", "todo")
- **`QUALITY_NO_COMPONENTS`** — plugin must ship at least one component (skill, command, agent, hook, or MCP server). A plugin with only `plugin.json` + `README` is not a plugin.
- **`QUALITY_TEMPLATE_PLACEHOLDER`** — `{{...}}` left unfilled in any plugin.json field
- **`QUALITY_SECRET_PATTERN`** — files contain a string matching known secret formats (OpenAI/Anthropic API keys, GitHub PATs, AWS keys, Google keys, Slack tokens, JWTs). This is the single most common cause of compliance rejection.

Read full reference at `references/quality-gates.md` for detailed explanation of each.

### Parse and decide

Parse the JSON output line by line. Each line is one finding with `severity`, `file`, `line`, `code`, `message`, `why`, `fix`.

**If any `error` severity findings exist** (note: in `--strict` mode, quality issues come back as errors, not warnings):

1. Print every error in this format:
   ```
   BLOCKED  <file>:<line>  [<code>]
            <message>
            Why: <why>
            Fix: <fix>
   ```
2. Print a summary line: `SUBMISSION BLOCKED — N errors. Fix every error and re-invoke me.`
3. **STOP**. Do not proceed to any other phase.
4. Tell the participant: "Run `/official-plugins:package-plugin` against `<PLUGIN_DIR>` to fix these issues with guided edits, then invoke `/official-plugins:submit-plugin` again."
5. Do **NOT** offer to bypass the gate. Do **NOT** offer to fix inline. Do **NOT** ask "want to proceed anyway?". The gate exists to protect the marketplace from low-quality submissions and the OKX brand from compliance incidents — bypassing it defeats its purpose.

**If all findings are `warning` severity** (this should be rare in strict mode — most relevant warnings are promoted to errors):
- Print them
- Ask: "These are warnings, not blockers. Proceed? [yes/no]"
- If yes, continue. If no, stop.

**If clean**: print `Validation passed: 0 errors, 0 warnings under --strict.` and continue to phase 2.

## 2. Detect git remote (for external mode hint)

If `<PLUGIN_DIR>` is a git repository (i.e., `<PLUGIN_DIR>/.git` exists OR it's nested under one), check for a remote:

```
cd <PLUGIN_DIR> && git remote get-url origin 2>/dev/null
cd <PLUGIN_DIR> && git rev-parse HEAD 2>/dev/null
```

Note both for use in phase 3. Don't make assumptions yet — the participant might still want monorepo mode even if they have a remote.

## 3. Ask submission mode

Use AskUserQuestion (single select) with three options:

- **Monorepo** — "Copy my plugin into master-plugin-repository under `plugins/<name>/`. The PR adds both the plugin files and the marketplace entry. Recommended for plugins that don't need their own repo."
- **External whole-repo** — "My plugin IS its own GitHub repo (`.claude-plugin/plugin.json` is at the repo root). The PR only adds a marketplace entry pointing at my repo."
- **External subdir** — "My plugin lives in a subdirectory of a larger repo. The PR adds a marketplace entry pointing at that subdirectory."

If you detected a git remote in phase 2, mention it in the description of the external options ("Detected git remote: <url>").

## 4. Collect/confirm marketplace-entry metadata

Read `<PLUGIN_DIR>/.claude-plugin/plugin.json` and pre-fill:

- `name` ← plugin.json `name` (do NOT ask — must match)
- `description` ← plugin.json `description`
- `version` ← plugin.json `version` or `0.1.0`
- `author.name` ← plugin.json `author.name`
- `category` ← plugin.json `category` or ask
- `keywords` ← plugin.json `keywords` or ask

Show the participant the pre-filled values and ask: "Anything to change?"

For external modes, additionally collect:
- **Whole-repo**: `url` (the https git URL) and `sha` (run `git rev-parse HEAD` if you detected a remote, or ask)
- **Subdir**: `url`, `path` (subdirectory), `ref` (branch/tag, default `main`), `sha`

## 5. Preflight: gh CLI

Run via Bash:

```
gh --version
gh auth status
```

If `gh` is not installed:
- Stop. Print: "Install GitHub CLI from https://cli.github.com/, then run `gh auth login` and re-invoke this skill."

If not authenticated:
- Stop. Print: "Run `gh auth login` to authenticate, then re-invoke this skill."

## 6. Dry-run check

Ask the participant: "Do you want a **dry run** first? I'll build the marketplace.json diff and show the planned PR title/body without forking or pushing anything."

If yes:
- Construct the marketplace entry as JSON
- Read the current `marketplace.json` (from a fresh clone or `gh api`) — actually for dry-run, just SHOW what the new entry would look like and where it would be inserted
- Show the planned commit message and PR title/body
- Stop. Tell the user: "Dry run complete. Re-invoke me with 'real submit' when ready."

If no, continue.

## 7. Pick working directory

Default: `${TEMP}/master-plugin-repository-submit-<plugin-name>` on Windows or `/tmp/master-plugin-repository-submit-<plugin-name>` on unix.

Confirm with the user. Refuse to use a directory that already has a `master-plugin-repository` clone in it (might be in unknown state) — pick a fresh path.

## 8. Fork + clone

Run via Bash from the parent of the working directory:

```
gh repo fork mastersamasama/master-plugin-repository --clone --remote
```

`gh` creates the fork under the authenticated user's account and clones it. The clone directory is `master-plugin-repository`.

`cd` into the clone.

## 9. Create branch

```
git checkout -b submit/<plugin-name>
```

## 10. Apply changes (mode-dependent)

### 10a. Monorepo mode

- Refuse to proceed if `plugins/<plugin-name>/` already exists in the fork — that's a name collision. Tell the user to pick a different plugin name and re-run from package-plugin.
- Copy the entire `<PLUGIN_DIR>` contents to `plugins/<plugin-name>/`. Use `cp -r` (Unix) or `xcopy /E /I /Y` (Windows). Show the user the destination tree afterward.
- Build the marketplace entry:
  ```json
  {
    "name": "<name>",
    "description": "<description>",
    "version": "<version>",
    "author": { "name": "<author.name>" },
    "category": "<category>",
    "keywords": [...],
    "source": "./plugins/<name>"
  }
  ```
- Read `.claude-plugin/marketplace.json`, parse it, append to `plugins[]`, write back with 2-space indent + trailing newline.

### 10b. External whole-repo mode

- Build the marketplace entry:
  ```json
  {
    "name": "<name>",
    "description": "<description>",
    "version": "<version>",
    "author": { "name": "<author.name>" },
    "category": "<category>",
    "keywords": [...],
    "source": {
      "source": "url",
      "url": "<url>",
      "sha": "<sha>"
    }
  }
  ```
- Append to marketplace.json.

### 10c. External subdir mode

- Build the marketplace entry:
  ```json
  {
    "name": "<name>",
    "description": "<description>",
    "version": "<version>",
    "author": { "name": "<author.name>" },
    "category": "<category>",
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
- Append to marketplace.json.

## 11. Validate the fork (strict)

Run the validator inside the clone before committing — once over the whole marketplace, plus once again over the specific plugin in strict mode:

```
node plugins/official-plugins/scripts/validate.mjs --all
node plugins/official-plugins/scripts/validate.mjs --plugin plugins/<plugin-name> --strict
```

If errors from either run: stop, report them, do NOT commit. The PR would fail CI anyway. This second validation pass catches issues that may have been introduced by the copy/edit (e.g., a path-traversal that only manifests once the plugin lives at `plugins/<name>/` instead of its source location).

## 12. Show diff and confirm

Run via Bash:

```
git diff --stat
git diff
```

Show the participant the full diff. Get explicit confirmation: "Commit and push these changes? [yes/no]"

## 13. Commit

```
git add -A
git commit -m "Add <plugin-name> to marketplace"
```

## 14. Push

```
git push -u origin submit/<plugin-name>
```

## 15. Open PR

```
gh pr create \
  --repo mastersamasama/master-plugin-repository \
  --base main \
  --head <github-username>:submit/<plugin-name> \
  --title "Add <plugin-name> to marketplace" \
  --body "<body>"
```

PR body should include:
- Plugin name + description
- Submission mode (monorepo / external whole-repo / external subdir)
- For external modes: source URL/path/ref/sha
- Author / team name
- Mention of "validated locally with `node plugins/official-plugins/scripts/validate.mjs`"
- Confirmation that no secrets, OKX-confidential data, or third-party IP without rights are included
- Compliance acknowledgment ("complies with LICENSE")

## 16. Report

Print the PR URL and:

> Submission opened. CI will run on your PR within seconds. If CI passes, a reviewer will manually verify and merge. If CI fails, fix the issue locally, push to your `submit/<plugin-name>` branch, and the PR will update automatically.
>
> If the reviewer requests changes, repeat the package-plugin → submit-plugin loop on a new branch.

## Behavior rules

- **Always validate before committing.** No exceptions.
- **Always show the diff and get confirmation before push.** Pushing is externally visible — never auto-push.
- **Never use --force or --no-verify on git or gh commands.**
- **Never push to upstream main directly.** Always go through fork + branch + PR.
- **Never include secrets, OKX-confidential data, or third-party IP** in any commit. If you spot any while reading the plugin contents, stop and warn.
- **Never assume `gh` is installed.** Check first.
- **Refuse to overwrite an existing `plugins/<name>/`** in monorepo mode.
- If a Bash command fails, stop and report the error verbatim. Do not retry silently.

## Additional resources

- **`references/source-shapes.md`** — every valid `source` shape with examples and when to use each
- **`references/pr-template-explained.md`** — what each PR template field means and why it matters
