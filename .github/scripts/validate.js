// Validates plugin files changed in a PR.
// Only checks files under plugins/*.json that were added or modified.
// Runs as part of the pull_request workflow.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REQUIRED_FIELDS = [
  "name",
  "title",
  "description",
  "version",
  "author",
  "repo",
  "type",
  "runtime",
  "published_at",
  "updated_at",
];
const VALID_TYPES = ["builtin", "js", "yaml", "ui", "full"];
const VALID_RUNTIMES = ["compiled", "interpreted"];
const VALID_TRUST_LEVELS = ["official", "community", "local"];
const VALID_CAPABILITIES = ["http", "store", "db", "ai", "events"];
const VALID_FEATURES = [
  "admin_js",
  "public_js",
  "routes",
  "contributes",
  "migrations",
  "pages",
  "filters",
  "events",
];

let exitCode = 0;

function fail(msg) {
  console.error("\u274c", msg);
  exitCode = 1;
}

function check(condition, msg) {
  if (!condition) fail(msg);
}

// ✅ 限制只能改 plugins/*.json，且不能删除
try {
  const changes = execSync("git diff --name-status origin/main...HEAD", {
    encoding: "utf-8",
  })
    .trim()
    .split("\n");

  for (const line of changes) {
    if (!line) continue;
    const [status, file] = line.split("\t");

    // 只关注 plugins/*.json
    if (file.startsWith("plugins/") && file.endsWith(".json")) {
      if (status === "D") {
        fail(`${file}: 不允许删除插件`);
      }
    } else {
      // ❗禁止改其他文件（防止搞 CI / workflow）
      fail(`${file}: 只允许修改 plugins/*.json`);
    }
  }
} catch (e) {
  fail("无法检查文件变更类型: " + e.message);
}

// ── Find changed plugin files in this PR ──────────────────────────────────

let changedFiles;
try {
  changedFiles = execSync("git diff --name-only origin/main...HEAD", {
    encoding: "utf-8",
  })
    .trim()
    .split("\n")
    .filter((f) => f.startsWith("plugins/") && f.endsWith(".json"));
} catch (e) {
  fail("无法获取 PR 变更文件列表: " + e.message);
  process.exit(1);
}

if (changedFiles.length === 0) {
  console.log("ℹ️  本次 PR 未包含 plugins/*.json 变更，跳过校验");
  process.exit(0);
}

console.log(
  `🔍 检测到 ${changedFiles.length} 个变更文件: ${changedFiles.join(", ")}`,
);

// ── Load all existing plugins for uniqueness check ────────────────────────

const pluginsDir = "plugins";
const allPluginFiles = fs
  .readdirSync(pluginsDir)
  .filter((f) => f.endsWith(".json"));

const nameToFile = {};
for (const file of allPluginFiles) {
  const filePath = path.join(pluginsDir, file);
  let plugin;
  try {
    plugin = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    if (changedFiles.includes(filePath)) {
      fail(`${filePath}: JSON 解析失败 — ${e.message}`);
    }
    continue;
  }
  if (plugin.name) {
    if (nameToFile[plugin.name] && nameToFile[plugin.name] !== file) {
      fail(
        `name "${plugin.name}" 在多个文件中重复: ${nameToFile[plugin.name]} 和 ${file}`,
      );
    }
    nameToFile[plugin.name] = file;
  }
}

// ── Validate each changed file ────────────────────────────────────────────

for (const filePath of changedFiles) {
  if (!fs.existsSync(filePath)) {
    console.log(`ℹ️  ${filePath} 已删除，跳过`);
    continue;
  }

  let plugin;
  try {
    plugin = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    fail(`${filePath}: JSON 解析失败 — ${e.message}`);
    continue;
  }

  const prefix = `[${filePath}]`;

  // Must be a plain object
  check(
    plugin !== null && typeof plugin === "object" && !Array.isArray(plugin),
    `${prefix}: 文件根节点必须是一个 JSON 对象（不是数组）`,
  );

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    check(
      plugin[field] !== undefined && plugin[field] !== "",
      `${prefix}: 缺少必填字段 "${field}"`,
    );
  }

  // name format
  if (plugin.name) {
    check(
      /^[\w.-]+(\/[\w.-]+)?$/.test(plugin.name),
      `${prefix}: name 格式应为 "slug" 或 "owner/slug"，仅允许字母、数字、-、_、.`,
    );
  }

  // type
  if (plugin.type !== undefined) {
    check(
      VALID_TYPES.includes(plugin.type),
      `${prefix}: type 无效，可选值: ${VALID_TYPES.join(", ")}`,
    );
  }

  // runtime
  if (plugin.runtime !== undefined) {
    check(
      VALID_RUNTIMES.includes(plugin.runtime),
      `${prefix}: runtime 无效，可选值: ${VALID_RUNTIMES.join(", ")}`,
    );
  }

  // type + runtime consistency
  if (plugin.type && plugin.runtime) {
    if (["builtin", "full"].includes(plugin.type)) {
      check(
        plugin.runtime === "compiled",
        `${prefix}: type "${plugin.type}" 的 runtime 应为 "compiled"`,
      );
    }
    if (plugin.type === "js" || plugin.type === "yaml") {
      check(
        plugin.runtime === "interpreted",
        `${prefix}: type "${plugin.type}" 的 runtime 应为 "interpreted"`,
      );
    }
  }

  // is_official
  if ("is_official" in plugin) {
    check(
      typeof plugin.is_official === "boolean",
      `${prefix}: is_official 必须是 boolean`,
    );
    check(
      plugin.is_official === false,
      `${prefix}: is_official 不允许在 PR 中自行设为 true，由维护者审核后标注`,
    );
  }

  // tags
  if (plugin.tags !== undefined) {
    check(Array.isArray(plugin.tags), `${prefix}: tags 必须是数组`);
    for (const tag of plugin.tags || []) {
      check(
        typeof tag === "string" &&
          tag === tag.toLowerCase() &&
          /^[a-z0-9-]+$/.test(tag),
        `${prefix}: tag "${tag}" 必须是小写英文字母、数字或连字符`,
      );
    }
  }

  // dates
  for (const dateField of ["published_at", "updated_at"]) {
    if (plugin[dateField]) {
      check(
        !isNaN(Date.parse(plugin[dateField])),
        `${prefix}: ${dateField} 不是有效的 ISO 8601 日期格式`,
      );
    }
  }

  // repo
  if (plugin.repo) {
    check(
      /^[\w.-]+\/[\w.-]+$/.test(plugin.repo),
      `${prefix}: repo 格式应为 "owner/repo"`,
    );
  }

  // version
  if (plugin.version) {
    check(
      /^\d+\.\d+\.\d+/.test(plugin.version),
      `${prefix}: version 应遵循 semver 格式，如 1.0.0`,
    );
  }

  // sdk_version
  if (plugin.sdk_version !== undefined && plugin.sdk_version !== "") {
    check(
      /^\d+\.\d+\.\d+/.test(plugin.sdk_version),
      `${prefix}: sdk_version 应遵循 semver 格式，如 1.0.0`,
    );
  }

  // trust_level
  if (plugin.trust_level !== undefined && plugin.trust_level !== "") {
    check(
      VALID_TRUST_LEVELS.includes(plugin.trust_level),
      `${prefix}: trust_level 无效，可选值: ${VALID_TRUST_LEVELS.join(", ")}`,
    );
    check(
      plugin.trust_level !== "official",
      `${prefix}: trust_level 不允许在 PR 中自行设为 "official"，由维护者审核后标注`,
    );
  }

  // capabilities
  if (plugin.capabilities !== undefined) {
    check(
      Array.isArray(plugin.capabilities),
      `${prefix}: capabilities 必须是数组`,
    );
    for (const cap of plugin.capabilities || []) {
      check(
        typeof cap === "string" && VALID_CAPABILITIES.includes(cap),
        `${prefix}: capability "${cap}" 无效，可选值: ${VALID_CAPABILITIES.join(", ")}`,
      );
    }
  }

  // features
  if (plugin.features !== undefined) {
    check(Array.isArray(plugin.features), `${prefix}: features 必须是数组`);
    for (const feat of plugin.features || []) {
      check(
        typeof feat === "string" && VALID_FEATURES.includes(feat),
        `${prefix}: feature "${feat}" 无效，可选值: ${VALID_FEATURES.join(", ")}`,
      );
    }
  }

  if (exitCode === 0) {
    console.log(`✅ ${filePath} 校验通过`);
  }
}

if (exitCode !== 0) {
  console.error("\n请修复以上错误后重新提交");
}

process.exit(exitCode);
