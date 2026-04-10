#!/usr/bin/env node
// validate.mjs — zero-dependency validator for the master-plugin-repository marketplace.
//
// Usage:
//   node validate.mjs --marketplace [<repo-root>]
//   node validate.mjs --plugin <plugin-dir>
//   node validate.mjs --all [<repo-root>]
//
// Flags:
//   --json     Emit one JSON object per finding to stdout (instead of human-readable text)
//   --quiet    Suppress success messages; only print errors
//
// Exit codes:
//   0  clean
//   1  one or more errors
//   2  usage error
//
// This file uses ONLY Node built-ins (node:fs, node:path). No npm install required.
// It implements just enough JSON-Schema-style validation for our 3 schemas, plus a
// minimal YAML frontmatter parser that handles the `key: value` and
// `key: [a, b, c]` subset SKILL.md files actually use.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, dirname, resolve, relative } from "node:path";

// ---------- argv parsing ----------

const args = process.argv.slice(2);
const flags = {
  marketplace: false,
  plugin: null,
  all: false,
  json: args.includes("--json"),
  quiet: args.includes("--quiet"),
  strict: args.includes("--strict"),
  repoRoot: null,
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--marketplace") {
    flags.marketplace = true;
    if (args[i + 1] && !args[i + 1].startsWith("--")) flags.repoRoot = args[++i];
  } else if (a === "--plugin") {
    flags.plugin = args[++i];
  } else if (a === "--all") {
    flags.all = true;
    if (args[i + 1] && !args[i + 1].startsWith("--")) flags.repoRoot = args[++i];
  } else if (a === "--json" || a === "--quiet" || a === "--strict") {
    // already captured
  } else if (a === "--help" || a === "-h") {
    printHelp();
    process.exit(0);
  } else if (a.startsWith("--")) {
    fail(`unknown flag: ${a}`);
  }
}

if (!flags.marketplace && !flags.plugin && !flags.all) {
  printHelp();
  process.exit(2);
}

function printHelp() {
  process.stdout.write(`Usage:
  node validate.mjs --marketplace [<repo-root>]
  node validate.mjs --plugin <plugin-dir>
  node validate.mjs --all [<repo-root>]

Flags:
  --json     Emit one JSON object per finding (machine-readable)
  --quiet    Suppress success messages
  --strict   Quality gate: also check no-components, descriptions, placeholders,
             secrets; promote SKILL description-style warnings to errors.
             Used by submit-plugin to block low-quality submissions.
  --help     Show this message

Exit codes: 0 clean, 1 errors, 2 usage error
`);
}

function fail(msg) {
  process.stderr.write(`validate.mjs: ${msg}\n`);
  process.exit(2);
}

// ---------- finding model ----------
//
// Every problem the validator detects is a "finding" with severity, file, line,
// code (machine identifier), message (one-line), why (rationale), fix (instructions).

const findings = [];

function err(file, line, code, message, why, fix) {
  findings.push({ severity: "error", file, line, code, message, why, fix });
}
function warn(file, line, code, message, why, fix) {
  findings.push({ severity: "warning", file, line, code, message, why, fix });
}
// qualityErr emits as error in --strict mode (used by submit-plugin),
// warning otherwise (used by package-plugin during iterative authoring)
function qualityErr(file, line, code, message, why, fix) {
  if (flags.strict) {
    findings.push({ severity: "error", file, line, code, message, why, fix });
  } else {
    findings.push({ severity: "warning", file, line, code, message, why, fix });
  }
}

// ---------- JSON loading with line tracking ----------

function loadJSON(filePath) {
  if (!existsSync(filePath)) {
    err(filePath, 0, "FILE_MISSING",
      `file not found: ${filePath}`,
      "every plugin must have a .claude-plugin/plugin.json; every marketplace must have a .claude-plugin/marketplace.json",
      "create the missing file or check the path is correct");
    return null;
  }
  const text = readFileSync(filePath, "utf8");
  try {
    return JSON.parse(text);
  } catch (e) {
    // Best-effort line extraction from JSON parse errors
    const m = e.message.match(/position (\d+)/);
    let line = 1;
    if (m) {
      const pos = parseInt(m[1], 10);
      line = text.slice(0, pos).split("\n").length;
    }
    err(filePath, line, "JSON_PARSE_ERROR",
      `invalid JSON: ${e.message}`,
      "Claude Code cannot load malformed JSON; the marketplace will fail to add",
      "fix the syntax error reported above (often a missing comma or unclosed brace)");
    return null;
  }
}

// ---------- minimal YAML frontmatter parser ----------
//
// Handles only what SKILL.md frontmatter actually uses:
//   key: value           (string scalar; quotes optional)
//   key: [a, b, c]       (inline list of strings)
//   key: |               (block scalar — captured as one joined string)
//     line 1
//     line 2
//
// Anything more complex is reported as an error rather than guessed at.

function parseFrontmatter(filePath, source) {
  // Frontmatter MUST be at the very start of the file, between two `---` lines.
  if (!source.startsWith("---")) {
    return { ok: false, reason: "no frontmatter (file must start with ---)" };
  }
  const lines = source.split("\n");
  if (lines[0].trim() !== "---") {
    return { ok: false, reason: "first line must be exactly ---" };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) {
    return { ok: false, reason: "frontmatter is not closed by a second --- line" };
  }
  const fmLines = lines.slice(1, end);
  const data = {};
  let i = 0;
  while (i < fmLines.length) {
    const raw = fmLines[i];
    const ln = i + 2; // 1-based, +1 for the opening ---
    if (raw.trim() === "" || raw.trim().startsWith("#")) { i++; continue; }
    const m = raw.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) {
      err(filePath, ln, "FRONTMATTER_PARSE",
        `cannot parse frontmatter line: "${raw}"`,
        "skill frontmatter must use simple key: value pairs",
        "rewrite this line as `key: value` or `key: [item, item]`");
      i++; continue;
    }
    const key = m[1];
    let val = m[2].trim();
    if (val === "|" || val === ">") {
      // Block scalar — collect indented lines
      const block = [];
      i++;
      while (i < fmLines.length && /^\s+/.test(fmLines[i])) {
        block.push(fmLines[i].replace(/^\s+/, ""));
        i++;
      }
      data[key] = block.join("\n");
      continue;
    }
    if (val.startsWith("[") && val.endsWith("]")) {
      data[key] = val.slice(1, -1).split(",").map(s => stripQuotes(s.trim())).filter(Boolean);
    } else {
      data[key] = stripQuotes(val);
    }
    i++;
  }
  return { ok: true, data, frontmatterEnd: end + 1 };
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------- minimal JSON-Schema-style validator ----------
//
// We don't load the schemas at runtime; the schemas in schemas/ exist as documentation
// and as a contract that this validator manually enforces. The two are kept in sync
// by hand. The schemas double as authoritative reference docs for participants.

const KEBAB = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+/;

function checkMarketplace(filePath, data) {
  if (!data || typeof data !== "object") return;

  if (typeof data.name !== "string" || !KEBAB.test(data.name)) {
    err(filePath, 0, "MARKETPLACE_NAME",
      `marketplace 'name' must be a kebab-case string (got: ${JSON.stringify(data.name)})`,
      "Claude Code identifies marketplaces by their kebab-case name",
      "set name to lowercase letters/digits/hyphens, starting with a letter");
  }

  if (!data.owner || typeof data.owner !== "object") {
    err(filePath, 0, "MARKETPLACE_OWNER",
      "marketplace 'owner' must be an object with at least a 'name' field",
      "Claude Code's marketplace loader requires owner.name (this was the bug Phase A hit)",
      "add `\"owner\": { \"name\": \"<your-name>\", \"email\": \"<optional>\" }`");
  } else if (typeof data.owner.name !== "string" || data.owner.name.length === 0) {
    err(filePath, 0, "MARKETPLACE_OWNER_NAME",
      "marketplace 'owner.name' must be a non-empty string",
      "the marketplace UI displays owner.name to users",
      "set owner.name to your team or maintainer name");
  }

  if (!Array.isArray(data.plugins)) {
    err(filePath, 0, "MARKETPLACE_PLUGINS",
      "marketplace 'plugins' must be an array",
      "the marketplace catalog is keyed by this array",
      "set plugins to [] (empty marketplace) or add plugin entries");
    return;
  }

  // Plugin name uniqueness
  const seen = new Map();
  data.plugins.forEach((p, idx) => {
    if (!p || typeof p !== "object") {
      err(filePath, 0, "PLUGIN_ENTRY",
        `plugins[${idx}] must be an object`,
        "every plugin entry must be a JSON object",
        "remove or replace the malformed entry");
      return;
    }
    if (typeof p.name !== "string" || !KEBAB.test(p.name)) {
      err(filePath, 0, "PLUGIN_ENTRY_NAME",
        `plugins[${idx}].name must be a kebab-case string (got: ${JSON.stringify(p.name)})`,
        "users invoke plugin skills as /<plugin-name>:<skill-name> — must be kebab-case",
        "rename to lowercase-with-hyphens");
    } else if (seen.has(p.name)) {
      err(filePath, 0, "PLUGIN_NAME_DUPLICATE",
        `duplicate plugin name '${p.name}' (also at index ${seen.get(p.name)})`,
        "marketplace plugin names must be unique — duplicates break installation",
        `rename one of the entries; suggested: '${p.name}-2' or pick a more specific name`);
    } else {
      seen.set(p.name, idx);
    }
    if (!p.source) {
      err(filePath, 0, "PLUGIN_ENTRY_SOURCE",
        `plugins[${idx}] (${p.name || "unnamed"}) is missing 'source'`,
        "Claude Code needs to know where to fetch each plugin from",
        "add source as either a string \"./plugins/<dir>\" or an object {source: 'url'|'git-subdir', ...}");
    } else {
      checkPluginSource(filePath, idx, p);
    }
  });
}

function checkPluginSource(filePath, idx, p) {
  const src = p.source;
  if (typeof src === "string") {
    // Same-repo string source — must point at an existing plugin dir
    const repoRoot = dirname(dirname(filePath)); // .claude-plugin/marketplace.json → repo root
    const targetDir = resolve(repoRoot, src);
    const targetManifest = join(targetDir, ".claude-plugin", "plugin.json");
    if (src.includes("..")) {
      err(filePath, 0, "SOURCE_PATH_TRAVERSAL",
        `plugins[${idx}].source contains '..' which is not allowed (got: ${src})`,
        "path traversal in marketplace sources is a security risk",
        "use a path relative to the repo root that stays inside it");
    }
    if (!existsSync(targetManifest)) {
      err(filePath, 0, "SOURCE_DIR_MISSING",
        `plugins[${idx}] (${p.name}) source "${src}" → ${relative(repoRoot, targetManifest)} does not exist`,
        "marketplace entries with string sources must point at a real plugin dir",
        `create ${relative(repoRoot, targetManifest)} or fix the source path`);
    }
  } else if (typeof src === "object" && src !== null) {
    if (src.source === "url") {
      if (typeof src.url !== "string" || !/^https?:\/\//.test(src.url)) {
        err(filePath, 0, "SOURCE_URL_INVALID",
          `plugins[${idx}] source.url must be an http(s) URL (got: ${src.url})`,
          "url-source plugins are fetched via git clone over https",
          "set url to the full https git clone URL of your repo");
      }
    } else if (src.source === "git-subdir") {
      if (typeof src.url !== "string") {
        err(filePath, 0, "SOURCE_URL_MISSING",
          `plugins[${idx}] source.url is required for git-subdir`,
          "git-subdir sources need to know which repo to clone",
          "set url to either 'owner/repo' or the full https URL");
      }
      if (typeof src.path !== "string") {
        err(filePath, 0, "SOURCE_PATH_MISSING",
          `plugins[${idx}] source.path is required for git-subdir`,
          "git-subdir sources need to know which subdirectory contains the plugin",
          "set path to the relative subdirectory inside the repo (e.g., 'plugins/my-plugin')");
      }
    } else {
      err(filePath, 0, "SOURCE_TYPE_UNKNOWN",
        `plugins[${idx}] source.source must be 'url' or 'git-subdir' (got: ${src.source})`,
        "Claude Code only understands 'url' and 'git-subdir' source types",
        "use one of: a string path, {source:'url',url,sha?}, or {source:'git-subdir',url,path,ref?,sha?}");
    }
  } else {
    err(filePath, 0, "SOURCE_TYPE_INVALID",
      `plugins[${idx}].source must be a string or object`,
      "no other source types are supported",
      "see references/source-shapes.md inside official-plugins for valid source forms");
  }
}

function checkPluginManifest(filePath, data, expectedName) {
  if (!data || typeof data !== "object") return;
  if (typeof data.name !== "string") {
    err(filePath, 0, "PLUGIN_NAME_MISSING",
      "plugin.json 'name' is required",
      "every plugin needs a kebab-case identifier",
      "add `\"name\": \"<plugin-name>\"` matching the directory name");
    return;
  }
  if (!KEBAB.test(data.name)) {
    err(filePath, 0, "PLUGIN_NAME_FORMAT",
      `plugin.json name must be kebab-case (got: ${data.name})`,
      "plugin names appear in slash command syntax (/plugin:skill) and must be lowercase",
      "rename to lowercase-with-hyphens");
  }
  if (expectedName && data.name !== expectedName) {
    err(filePath, 0, "PLUGIN_NAME_MISMATCH",
      `plugin.json name '${data.name}' does not match directory name '${expectedName}'`,
      "Claude Code expects plugin name and directory name to match for unambiguous installation",
      `rename either the directory or the name field so both equal '${expectedName}'`);
  }
  if (data.version !== undefined && !SEMVER.test(data.version)) {
    warn(filePath, 0, "PLUGIN_VERSION_FORMAT",
      `plugin.json version '${data.version}' is not semver`,
      "tools that diff plugin updates rely on semver ordering",
      "use the format 'X.Y.Z', e.g., '0.1.0'");
  }
  if (typeof data.description !== "string" || data.description.length === 0) {
    qualityErr(filePath, 0, "PLUGIN_DESCRIPTION_MISSING",
      "plugin.json should include a 'description' field",
      "the marketplace UI shows description to users browsing plugins",
      "add a one-line description of what your plugin does");
  }
  // Path traversal check on any string field
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string" && v.includes("..")) {
      err(filePath, 0, "PLUGIN_PATH_TRAVERSAL",
        `plugin.json field '${k}' contains '..' (value: ${v})`,
        "path traversal escapes the plugin sandbox and is a security risk",
        `change the value of '${k}' so it stays inside the plugin directory`);
    }
  }
}

function checkSkillFrontmatter(filePath, fmResult, expectedName) {
  if (!fmResult.ok) {
    err(filePath, 1, "SKILL_FRONTMATTER",
      `SKILL.md frontmatter problem: ${fmResult.reason}`,
      "Claude Code requires every SKILL.md to begin with a --- ... --- YAML block containing at least a 'name' field",
      "add a frontmatter block like:\n  ---\n  name: " + expectedName + "\n  description: This skill should be used when ...\n  ---");
    return;
  }
  const data = fmResult.data;
  if (typeof data.name !== "string") {
    err(filePath, 0, "SKILL_NAME_MISSING",
      "SKILL.md frontmatter is missing 'name'",
      "Claude Code identifies skills by their frontmatter name",
      `add 'name: ${expectedName}' to the frontmatter`);
  } else if (!KEBAB.test(data.name)) {
    err(filePath, 0, "SKILL_NAME_FORMAT",
      `SKILL.md name '${data.name}' must be kebab-case`,
      "skill names appear in /<plugin>:<skill> invocations and must be lowercase",
      "rename to lowercase-with-hyphens");
  } else if (data.name !== expectedName) {
    err(filePath, 0, "SKILL_NAME_MISMATCH",
      `SKILL.md name '${data.name}' does not match directory name '${expectedName}'`,
      "Claude Code expects skill name and directory name to match",
      `change frontmatter to 'name: ${expectedName}' or rename the directory`);
  }
  if (typeof data.description !== "string" || data.description.length === 0) {
    qualityErr(filePath, 0, "SKILL_DESCRIPTION_MISSING",
      "SKILL.md should have a 'description' field in its frontmatter",
      "skills without trigger descriptions undertrigger — Claude won't invoke them when needed",
      "add description starting with 'This skill should be used when the user asks to ...' and list concrete trigger phrases");
  } else if (PLACEHOLDER_RE.test(data.description)) {
    qualityErr(filePath, 0, "SKILL_DESCRIPTION_PLACEHOLDER",
      `SKILL.md description still contains an unfilled {{placeholder}}`,
      "the participant generated this skill from the SKILL.md template but forgot to fill in the description fields",
      "replace every {{...}} marker in the description with concrete trigger phrases for this skill");
  } else if (!/this skill should be used when/i.test(data.description)) {
    qualityErr(filePath, 0, "SKILL_DESCRIPTION_STYLE",
      "SKILL.md description should start with 'This skill should be used when the user asks to ...'",
      "skill-creator's pushy third-person convention combats undertriggering — vague descriptions won't fire",
      "rewrite description as 'This skill should be used when the user asks to <phrase>, <phrase>, ...'");
  }
}

// ---------- quality gates (run when --strict, demoted to warnings otherwise) ----------
//
// Quality gates catch low-quality submissions that would technically validate
// but waste reviewer time and clutter the marketplace. Run by submit-plugin
// in --strict mode; surfaced as warnings (non-blocking) by package-plugin so
// participants can iteratively fix during authoring.

const PLACEHOLDER_RE = /\{\{[^}]+\}\}/;
const SECRET_PATTERNS = [
  { name: "OpenAI API key",   re: /sk-[a-zA-Z0-9]{20,}/ },
  { name: "Anthropic API key", re: /sk-ant-[a-zA-Z0-9_-]{20,}/ },
  { name: "GitHub PAT",       re: /ghp_[a-zA-Z0-9]{30,}/ },
  { name: "GitHub fine-grained PAT", re: /github_pat_[a-zA-Z0-9_]{30,}/ },
  { name: "AWS access key",   re: /AKIA[0-9A-Z]{16}/ },
  { name: "Google API key",   re: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: "Slack token",      re: /xox[baprs]-[a-zA-Z0-9-]{20,}/ },
  { name: "JWT-looking",      re: /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/ },
];
const SCAN_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml", ".sh", ".py", ".js", ".ts", ".mjs", ".txt", ".env"]);
const SKIP_DIRS = new Set([".git", "node_modules", "examples", "templates"]);

function countComponents(absDir, manifest) {
  let count = 0;
  const skillsDir = join(absDir, "skills");
  if (existsSync(skillsDir) && statSync(skillsDir).isDirectory()) {
    for (const entry of readdirSync(skillsDir)) {
      if (existsSync(join(skillsDir, entry, "SKILL.md"))) { count++; break; }
    }
  }
  const commandsDir = join(absDir, "commands");
  if (existsSync(commandsDir) && statSync(commandsDir).isDirectory()) {
    if (readdirSync(commandsDir).some(f => f.endsWith(".md"))) count++;
  }
  const agentsDir = join(absDir, "agents");
  if (existsSync(agentsDir) && statSync(agentsDir).isDirectory()) {
    if (readdirSync(agentsDir).some(f => f.endsWith(".md"))) count++;
  }
  if (existsSync(join(absDir, "hooks", "hooks.json"))) count++;
  if (manifest && manifest.hooks) count++;
  if (existsSync(join(absDir, "mcp.json"))) count++;
  if (existsSync(join(absDir, ".mcp.json"))) count++;
  if (manifest && manifest.mcpServers) count++;
  return count;
}

function walkFilesShallow(absDir, callback) {
  // Walk plugin files for content scanning. Skip examples/, templates/,
  // .git/, node_modules/, and binary-ish files.
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        walk(full);
      } else {
        const dot = entry.lastIndexOf(".");
        const ext = dot === -1 ? "" : entry.slice(dot).toLowerCase();
        if (SCAN_EXTENSIONS.has(ext)) callback(full);
      }
    }
  }
  walk(absDir);
}

function checkPluginQuality(pluginDir, manifest) {
  const absDir = resolve(pluginDir);
  const manifestPath = join(absDir, ".claude-plugin", "plugin.json");

  // Quality gate: at least one component
  const componentCount = countComponents(absDir, manifest);
  if (componentCount === 0) {
    qualityErr(manifestPath, 0, "QUALITY_NO_COMPONENTS",
      "plugin has zero components — no skills, commands, agents, hooks, or MCP servers detected",
      "a plugin without any components does nothing useful and clutters the marketplace",
      "add at least one of: skills/<name>/SKILL.md, commands/<name>.md, agents/<name>.md, hooks/hooks.json, or an mcpServers field in plugin.json");
  }

  // Quality gate: description length
  if (manifest && typeof manifest.description === "string" && manifest.description.length > 0 && manifest.description.length < 20) {
    qualityErr(manifestPath, 0, "QUALITY_DESCRIPTION_TOO_SHORT",
      `plugin.json description is only ${manifest.description.length} characters — too short to be useful`,
      "the marketplace UI shows description to participants browsing plugins; one-word descriptions don't help anyone decide whether to install",
      "expand to a full sentence (~20-100 chars) describing what the plugin does and who should install it");
  }

  // Quality gate: no template placeholders left in plugin.json
  if (manifest) {
    for (const [k, v] of Object.entries(manifest)) {
      if (typeof v === "string" && PLACEHOLDER_RE.test(v)) {
        qualityErr(manifestPath, 0, "QUALITY_TEMPLATE_PLACEHOLDER",
          `plugin.json field '${k}' still contains a {{placeholder}} (value: ${v})`,
          "the participant generated this from a template but forgot to fill in the field",
          `replace the {{placeholder}} in '${k}' with a real value before submitting`);
      }
    }
  }

  // Quality gate: scan files for known secret patterns.
  // We deliberately do NOT scan for {{placeholder}} patterns in arbitrary files
  // because legitimate documentation often mentions the literal placeholder syntax;
  // the high-value placeholder check happens on plugin.json fields above (and on
  // SKILL.md description fields inside checkSkillFrontmatter).
  walkFilesShallow(absDir, (file) => {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { return; }
    // Skip very large files (>1MB) — likely binary or generated
    if (text.length > 1024 * 1024) return;
    for (const { name, re } of SECRET_PATTERNS) {
      const m = text.match(re);
      if (m) {
        const idx = text.indexOf(m[0]);
        const line = text.slice(0, idx).split("\n").length;
        qualityErr(file, line, "QUALITY_SECRET_PATTERN",
          `looks like an embedded secret: ${name} pattern detected`,
          "secrets in committed plugin files leak credentials and violate OKX compliance — this is the single biggest reason a submission gets rejected",
          `remove the secret from this file. If you need to reference a secret at runtime, read it from an environment variable instead of hardcoding`);
      }
    }
  });
}

// ---------- plugin directory walker ----------

function checkPluginDirectory(pluginDir) {
  const absDir = resolve(pluginDir);
  const dirName = basename(absDir);
  const manifestPath = join(absDir, ".claude-plugin", "plugin.json");

  const data = loadJSON(manifestPath);
  if (data) checkPluginManifest(manifestPath, data, dirName);
  if (data) checkPluginQuality(absDir, data);

  // Walk skills
  const skillsDir = join(absDir, "skills");
  if (existsSync(skillsDir) && statSync(skillsDir).isDirectory()) {
    for (const entry of readdirSync(skillsDir)) {
      const skillDir = join(skillsDir, entry);
      if (!statSync(skillDir).isDirectory()) continue;
      const skillFile = join(skillDir, "SKILL.md");
      if (!existsSync(skillFile)) {
        err(skillFile, 0, "SKILL_FILE_MISSING",
          `skills/${entry}/SKILL.md does not exist`,
          "every skill subdirectory must contain a SKILL.md file",
          `create ${skillFile} with frontmatter and a body`);
        continue;
      }
      const text = readFileSync(skillFile, "utf8");
      const fmResult = parseFrontmatter(skillFile, text);
      checkSkillFrontmatter(skillFile, fmResult, entry);
    }
  }

  // Walk commands (.md files at top level of commands/)
  const commandsDir = join(absDir, "commands");
  if (existsSync(commandsDir) && statSync(commandsDir).isDirectory()) {
    for (const entry of readdirSync(commandsDir)) {
      if (!entry.endsWith(".md")) continue;
      const cmdFile = join(commandsDir, entry);
      const text = readFileSync(cmdFile, "utf8");
      // Commands optionally have frontmatter; if present, validate it parses
      if (text.startsWith("---")) {
        const fm = parseFrontmatter(cmdFile, text);
        if (!fm.ok) {
          warn(cmdFile, 1, "COMMAND_FRONTMATTER",
            `command frontmatter problem: ${fm.reason}`,
            "command frontmatter is optional but should be parseable if present",
            "fix the frontmatter or remove it entirely");
        }
      }
    }
  }
}

// ---------- top-level operations ----------

function findRepoRoot(start) {
  let cur = resolve(start || process.cwd());
  while (true) {
    if (existsSync(join(cur, ".claude-plugin", "marketplace.json"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function doMarketplace(repoRoot) {
  const root = repoRoot || findRepoRoot();
  if (!root) {
    fail("could not locate marketplace root (no .claude-plugin/marketplace.json found by walking up)");
  }
  const path = join(root, ".claude-plugin", "marketplace.json");
  const data = loadJSON(path);
  if (data) checkMarketplace(path, data);
}

function doPlugin(pluginDir) {
  if (!pluginDir) fail("--plugin requires a path argument");
  if (!existsSync(pluginDir)) fail(`plugin directory not found: ${pluginDir}`);
  checkPluginDirectory(pluginDir);
}

function doAll(repoRoot) {
  const root = repoRoot || findRepoRoot();
  if (!root) fail("could not locate marketplace root");
  doMarketplace(root);
  const pluginsDir = join(root, "plugins");
  if (existsSync(pluginsDir) && statSync(pluginsDir).isDirectory()) {
    for (const entry of readdirSync(pluginsDir)) {
      const subdir = join(pluginsDir, entry);
      if (statSync(subdir).isDirectory() && existsSync(join(subdir, ".claude-plugin", "plugin.json"))) {
        checkPluginDirectory(subdir);
      }
    }
  }
}

if (flags.marketplace) doMarketplace(flags.repoRoot);
if (flags.plugin) doPlugin(flags.plugin);
if (flags.all) doAll(flags.repoRoot);

// ---------- output ----------

const errors = findings.filter(f => f.severity === "error");
const warnings = findings.filter(f => f.severity === "warning");

if (flags.json) {
  for (const f of findings) process.stdout.write(JSON.stringify(f) + "\n");
} else {
  for (const f of findings) {
    const tag = f.severity === "error" ? "ERROR" : "WARN ";
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    process.stdout.write(`${tag} [${f.code}] ${loc}\n`);
    process.stdout.write(`        ${f.message}\n`);
    process.stdout.write(`        Why: ${f.why}\n`);
    process.stdout.write(`        Fix: ${f.fix}\n`);
    process.stdout.write(`\n`);
  }
  if (!flags.quiet && errors.length === 0) {
    process.stdout.write(`OK — ${warnings.length} warning(s), 0 error(s)\n`);
  } else if (!flags.quiet) {
    process.stdout.write(`FAIL — ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  }
}

process.exit(errors.length > 0 ? 1 : 0);
