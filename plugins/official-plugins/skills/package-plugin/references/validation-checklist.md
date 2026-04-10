# Validator Error & Warning Reference

Every code emitted by `validate.mjs`, with explanation and fix. When the validator reports an issue, look it up here.

## Errors (block submission)

### `FILE_MISSING`
A required file was not found.
- **Why**: every plugin needs `.claude-plugin/plugin.json`; every marketplace needs `.claude-plugin/marketplace.json`
- **Fix**: create the missing file, or check that the path you passed to `--plugin` is correct

### `JSON_PARSE_ERROR`
A JSON file is malformed.
- **Why**: Claude Code cannot load malformed JSON; the marketplace will fail to add
- **Fix**: open the file in an editor, look at the line number reported, fix the syntax (most often a missing comma or unclosed brace)

### `MARKETPLACE_NAME`
Marketplace `name` is missing or not kebab-case.
- **Why**: Claude Code identifies marketplaces by their kebab-case name
- **Fix**: set `name` to lowercase letters/digits/hyphens, starting with a letter

### `MARKETPLACE_OWNER`
Marketplace `owner` field missing or not an object.
- **Why**: Claude Code's marketplace loader requires `owner.name` (this was the bug Phase A hit)
- **Fix**: add `"owner": { "name": "<your-name>", "email": "<optional>" }`

### `MARKETPLACE_OWNER_NAME`
`owner.name` is empty or missing.
- **Why**: the marketplace UI displays `owner.name` to users
- **Fix**: set it to your team or maintainer name

### `MARKETPLACE_PLUGINS`
`plugins` field is not an array.
- **Why**: the marketplace catalog is keyed by this array
- **Fix**: set `plugins` to `[]` (empty marketplace) or add plugin entries

### `PLUGIN_ENTRY`
A plugin entry is not an object.
- **Why**: every plugin entry must be a JSON object
- **Fix**: remove or replace the malformed entry

### `PLUGIN_ENTRY_NAME`
A plugin entry's `name` is missing or not kebab-case.
- **Why**: users invoke plugin skills as `/<plugin-name>:<skill-name>` — must be kebab-case
- **Fix**: rename to lowercase-with-hyphens

### `PLUGIN_NAME_DUPLICATE`
Two plugin entries have the same `name`.
- **Why**: marketplace plugin names must be unique — duplicates break installation
- **Fix**: rename one entry; suggested format `<original>-2` or pick a more specific name

### `PLUGIN_ENTRY_SOURCE`
A plugin entry has no `source`.
- **Why**: Claude Code needs to know where to fetch each plugin from
- **Fix**: add source as either a string `"./plugins/<dir>"` or an object `{source: "url"|"git-subdir", ...}`

### `SOURCE_PATH_TRAVERSAL`
A string source contains `..`.
- **Why**: path traversal in marketplace sources is a security risk
- **Fix**: use a path relative to the repo root that stays inside it

### `SOURCE_DIR_MISSING`
A string source points at a non-existent plugin directory.
- **Why**: marketplace entries with string sources must point at a real plugin dir
- **Fix**: create the missing plugin or fix the source path

### `SOURCE_URL_INVALID`
A `url` source has a missing or non-http URL.
- **Why**: url-source plugins are fetched via git clone over https
- **Fix**: set `url` to the full https git clone URL of your repo

### `SOURCE_URL_MISSING` / `SOURCE_PATH_MISSING`
A `git-subdir` source is missing required fields.
- **Why**: `git-subdir` sources need both `url` and `path` to know which repo and which subdirectory
- **Fix**: add the missing field; see `submit-plugin/references/source-shapes.md`

### `SOURCE_TYPE_UNKNOWN` / `SOURCE_TYPE_INVALID`
A source object has an unrecognized `source` value.
- **Why**: Claude Code only understands `url` and `git-subdir` source types (plus the simple string form)
- **Fix**: use one of: a string path, `{source:"url",url,sha?}`, or `{source:"git-subdir",url,path,ref?,sha?}`

### `PLUGIN_NAME_MISSING`
plugin.json has no `name` field.
- **Why**: every plugin needs a kebab-case identifier
- **Fix**: add `"name": "<plugin-name>"` matching the directory name

### `PLUGIN_NAME_FORMAT`
plugin.json `name` is not kebab-case.
- **Why**: plugin names appear in slash command syntax (`/plugin:skill`) and must be lowercase
- **Fix**: rename to lowercase-with-hyphens

### `PLUGIN_NAME_MISMATCH`
plugin.json `name` doesn't match the directory name.
- **Why**: Claude Code expects plugin name and directory name to match for unambiguous installation
- **Fix**: rename either the directory or the `name` field so they're equal

### `PLUGIN_PATH_TRAVERSAL`
A plugin.json string field contains `..`.
- **Why**: path traversal escapes the plugin sandbox and is a security risk
- **Fix**: change the value so it stays inside the plugin directory

### `SKILL_FRONTMATTER`
A SKILL.md is missing or malformed YAML frontmatter.
- **Why**: Claude Code requires every SKILL.md to begin with a `--- ... ---` YAML block containing at least a `name` field
- **Fix**: add the frontmatter; see `package-plugin/references/component-types.md`

### `SKILL_FILE_MISSING`
A `skills/<name>/` directory has no `SKILL.md`.
- **Why**: every skill subdirectory must contain a SKILL.md file
- **Fix**: create `skills/<name>/SKILL.md` or remove the empty directory

### `SKILL_NAME_MISSING` / `SKILL_NAME_FORMAT` / `SKILL_NAME_MISMATCH`
SKILL.md frontmatter `name` is missing, malformed, or doesn't match the directory name.
- **Why**: Claude Code identifies skills by their frontmatter name and expects directory + frontmatter to agree
- **Fix**: set `name: <directory-name>` in the frontmatter, in kebab-case

### `FRONTMATTER_PARSE`
A line in the frontmatter doesn't parse as `key: value` or `key: [list]`.
- **Why**: skill frontmatter must use simple `key: value` pairs (the validator only handles this subset)
- **Fix**: rewrite the line as `key: value` or `key: [item, item]`

## Quality gates (warnings during package-plugin authoring, errors when submit-plugin runs --strict)

These catch low-quality submissions. `package-plugin` reports them as warnings so you can iterate. `submit-plugin` runs the validator with `--strict` and treats them as errors that block submission. **Fix them before invoking submit-plugin.**

For the full reference of every quality gate with the rationale and fix, see `../../submit-plugin/references/quality-gates.md`.

### `SKILL_DESCRIPTION_MISSING`
A SKILL.md has no `description` field in its frontmatter.
- **Why**: skills without descriptions never trigger
- **Fix**: add a `description` starting with `"This skill should be used when the user asks to ..."`

### `SKILL_DESCRIPTION_STYLE`
A SKILL.md description doesn't follow the third-person trigger-phrase convention.
- **Why**: vague descriptions undertrigger — Claude won't invoke the skill in real conversations
- **Fix**: rewrite as `"This skill should be used when the user asks to '<phrase>', '<phrase>', ..."`

### `SKILL_DESCRIPTION_PLACEHOLDER`
A SKILL.md description still contains `{{...}}` from the template.
- **Why**: you generated from `templates/SKILL.md.template` but forgot to fill in description fields
- **Fix**: replace every `{{...}}` with concrete trigger phrases for this skill

### `PLUGIN_DESCRIPTION_MISSING`
plugin.json has no `description`.
- **Why**: the marketplace UI shows description to participants browsing plugins
- **Fix**: add a one-line description (~20-100 chars) of what your plugin does

### `QUALITY_DESCRIPTION_TOO_SHORT`
plugin.json description is non-empty but shorter than 20 characters.
- **Why**: catches descriptions like "test", "demo", "todo" — too vague to be useful
- **Fix**: expand to a full sentence describing what the plugin does

### `QUALITY_NO_COMPONENTS`
The plugin has no skills, no commands, no agents, no hooks, and no MCP servers.
- **Why**: a plugin with only `plugin.json` + `README` does nothing — it's not a plugin
- **Fix**: add at least one component: `skills/<name>/SKILL.md`, `commands/<name>.md`, `agents/<name>.md`, `hooks/hooks.json`, or an `mcpServers` field in plugin.json

### `QUALITY_TEMPLATE_PLACEHOLDER`
A plugin.json string field still contains `{{...}}` from the template.
- **Why**: you generated plugin.json from `templates/plugin.json.template` but forgot to fill in some fields. Unfilled placeholders appear literally in the marketplace UI.
- **Fix**: open plugin.json and replace every `{{...}}` with the real value

### `QUALITY_SECRET_PATTERN`
A file in the plugin contains a string matching a known secret format (OpenAI/Anthropic API key, GitHub PAT, AWS key, Google key, Slack token, JWT).
- **Why**: secrets in committed plugin files leak credentials and violate OKX compliance — **the single biggest reason a submission is rejected**
- **Fix**: (1) remove the secret from the file, (2) **rotate the credential at the source**, (3) refactor to read from environment variables at runtime, never hardcode

## Pure warnings (always non-blocking)

### `PLUGIN_VERSION_FORMAT`
plugin.json `version` is present but not semver.
- **Why**: tools that diff plugin updates rely on semver ordering
- **Fix**: use `X.Y.Z` format, e.g. `0.1.0`

### `COMMAND_FRONTMATTER`
A command file has frontmatter but it doesn't parse.
- **Why**: command frontmatter is optional but should be parseable if present
- **Fix**: fix the frontmatter or remove it entirely
