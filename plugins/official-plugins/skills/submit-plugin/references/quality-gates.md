# Quality Gates — what `submit-plugin` blocks on

`/official-plugins:submit-plugin` runs the validator in **strict mode** (`--strict`) before doing anything externally visible. Strict mode is the union of two gates: the **format gate** (always errors) and the **quality gate** (errors in strict mode, warnings during package-plugin authoring).

This file documents every gate. If `submit-plugin` blocks your submission, look up the error code here for the full explanation.

## Format gates (always errors)

These run regardless of `--strict`. They catch structural problems that would prevent Claude Code from loading the plugin at all.

| Code | What |
|---|---|
| `FILE_MISSING` | A required file (`plugin.json`, `marketplace.json`) doesn't exist |
| `JSON_PARSE_ERROR` | A JSON file has a syntax error |
| `MARKETPLACE_NAME` | Marketplace name missing or not kebab-case |
| `MARKETPLACE_OWNER` | Top-level `owner` field missing or not an object (this was the Phase A schema bug) |
| `MARKETPLACE_OWNER_NAME` | `owner.name` is empty |
| `MARKETPLACE_PLUGINS` | `plugins` field is not an array |
| `PLUGIN_NAME_MISSING` | plugin.json has no `name` |
| `PLUGIN_NAME_FORMAT` | plugin.json `name` is not kebab-case |
| `PLUGIN_NAME_MISMATCH` | plugin.json `name` doesn't match the directory name |
| `PLUGIN_NAME_DUPLICATE` | Two marketplace entries have the same name |
| `PLUGIN_PATH_TRAVERSAL` | A plugin.json string field contains `..` |
| `PLUGIN_ENTRY_SOURCE` | Marketplace entry is missing `source` |
| `SOURCE_PATH_TRAVERSAL` / `SOURCE_DIR_MISSING` / `SOURCE_URL_INVALID` / `SOURCE_URL_MISSING` / `SOURCE_PATH_MISSING` / `SOURCE_TYPE_UNKNOWN` / `SOURCE_TYPE_INVALID` | The marketplace entry's `source` field is malformed |
| `SKILL_FILE_MISSING` | A `skills/<name>/` directory has no SKILL.md |
| `SKILL_FRONTMATTER` | SKILL.md is missing or has malformed YAML frontmatter |
| `SKILL_NAME_MISSING` / `SKILL_NAME_FORMAT` / `SKILL_NAME_MISMATCH` | SKILL.md frontmatter `name` is missing, malformed, or doesn't match directory |
| `FRONTMATTER_PARSE` | A frontmatter line couldn't be parsed |

## Quality gates (errors in `--strict`, warnings otherwise)

These catch low-quality submissions that would technically validate but waste reviewer time and clutter the marketplace.

### `SKILL_DESCRIPTION_MISSING`
**What**: a `skills/<name>/SKILL.md` has no `description` field in its frontmatter.

**Why it blocks submission**: Claude Code matches user prompts against skill descriptions. Without one, the skill **never triggers**. The participant might as well not have written the skill.

**Fix**: add a `description` field that starts with `"This skill should be used when the user asks to ..."` and lists concrete trigger phrases.

### `SKILL_DESCRIPTION_PLACEHOLDER`
**What**: a SKILL.md description still contains `{{...}}` markers from the template.

**Why**: the participant generated the skill from `templates/SKILL.md.template` but forgot to fill in the description placeholders.

**Fix**: replace every `{{...}}` in the description with concrete trigger phrases for this specific skill. See `references/source-shapes.md` for examples of strong descriptions.

### `SKILL_DESCRIPTION_STYLE`
**What**: a SKILL.md description doesn't start with `"This skill should be used when"` (case-insensitive).

**Why**: the third-person pushy convention combats undertriggering. Vague descriptions like "Helps with X" don't activate the skill in real conversations. This is **the** most common reason hackathon skills get installed but never actually fire.

**Fix**: rewrite to `"This skill should be used when the user asks to '<phrase>', '<phrase>', or wants to <topic>. Make sure to invoke this whenever the user mentions <topic>, even if they don't explicitly ask for it."`

### `PLUGIN_DESCRIPTION_MISSING`
**What**: plugin.json has no `description` field.

**Why**: the marketplace UI shows description to participants browsing plugins. Without one, your plugin appears as a blank line and won't get installed.

**Fix**: add a one-line description (~20-100 chars) of what your plugin does and why someone should install it.

### `QUALITY_DESCRIPTION_TOO_SHORT`
**What**: plugin.json description is non-empty but shorter than 20 characters.

**Why**: catches descriptions like `"test"`, `"demo"`, `"todo"`, `"my plugin"` that don't help anyone decide whether to install.

**Fix**: expand to at least one full sentence describing what the plugin does.

### `QUALITY_NO_COMPONENTS`
**What**: plugin has no skills, no commands, no agents, no hooks, and no MCP servers.

**Why**: a plugin with only `plugin.json` + `README.md` is not a plugin — it does nothing. Submitting it clutters the marketplace and wastes reviewer time.

**Fix**: add at least one of:
- `skills/<name>/SKILL.md`
- `commands/<name>.md`
- `agents/<name>.md`
- `hooks/hooks.json`
- An `mcpServers` field in plugin.json

### `QUALITY_TEMPLATE_PLACEHOLDER`
**What**: a string field in plugin.json still contains `{{...}}` from the template.

**Why**: the participant generated plugin.json from `templates/plugin.json.template` but forgot to fill in some fields. The unfilled `{{name}}` would appear literally in the marketplace UI — not a good look.

**Fix**: open plugin.json and replace every `{{...}}` with the real value.

### `QUALITY_SECRET_PATTERN`
**What**: a file in the plugin directory contains a string matching a known secret pattern. Detected formats:
- OpenAI API key (`sk-...`)
- Anthropic API key (`sk-ant-...`)
- GitHub Personal Access Token (`ghp_...`, `github_pat_...`)
- AWS Access Key (`AKIA...`)
- Google API Key (`AIza...`)
- Slack token (`xoxb-`, `xoxp-`, etc.)
- JWT-looking three-segment dotted token (`eyJ...eyJ...`)

**Why**: secrets in committed plugin files leak credentials and **violate OKX compliance**. This is the single biggest reason a submission gets rejected at review time. Once a secret is committed to a public-or-shared repo, it must be considered compromised — even if you delete the file later.

**Fix**:
1. Remove the secret from the file immediately
2. **Rotate the credential** at the source (OpenAI dashboard, GitHub settings, AWS IAM, etc.) — assume it's leaked
3. Refactor your plugin to read the secret from an environment variable at runtime instead of hardcoding it
4. If the secret is in a test fixture or example, replace it with an obvious placeholder like `EXAMPLE_KEY_NOT_REAL`

The validator's regex is conservative — it only flags well-known formats. It will not catch every possible secret. This is a **safety net**, not a guarantee. Manually verify your plugin contains no sensitive material before submitting.

## How to run the gate yourself before submitting

```
node plugins/official-plugins/scripts/validate.mjs --plugin <your-plugin-dir> --strict
```

Or, if you've already installed `official-plugins`:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/validate.mjs --plugin <your-plugin-dir> --strict
```

(Run from inside a Claude Code session where `official-plugins` is installed; `${CLAUDE_PLUGIN_ROOT}` is the env var Claude Code sets to the plugin's installed location.)

If the validator returns clean under `--strict`, `submit-plugin` will not block you.

## Why `package-plugin` doesn't run strict mode

`package-plugin` runs the validator in **non-strict mode** because it's an iterative authoring workflow — you might be midway through fixing things and want to see what's still broken without the validator screaming about every quality issue all at once. Format errors still block (you can't ship malformed JSON), but quality issues come back as warnings so you can prioritize.

`submit-plugin` runs **strict mode** because it's the gate. Once you cross it, your work goes external. No second chances on quality at that point.
