// Validates plugin files changed in a PR.
// Only checks files under plugins/*.json that were added or modified.
// Runs as part of the pull_request workflow.

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const REQUIRED_FIELDS = ['name', 'title', 'description', 'version', 'author', 'repo', 'published_at', 'updated_at']
const VALID_TYPES = ['hook', 'integration', 'theme']

let exitCode = 0

function fail(msg) {
  console.error('❌', msg)
  exitCode = 1
}

function check(condition, msg) {
  if (!condition) fail(msg)
}

// ── Find changed plugin files in this PR ──────────────────────────────────

let changedFiles
try {
  changedFiles = execSync('git diff --name-only origin/main...HEAD', { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(f => f.startsWith('plugins/') && f.endsWith('.json'))
} catch (e) {
  fail('无法获取 PR 变更文件列表: ' + e.message)
  process.exit(1)
}

if (changedFiles.length === 0) {
  console.log('ℹ️  本次 PR 未包含 plugins/*.json 变更，跳过校验')
  process.exit(0)
}

console.log(`🔍 检测到 ${changedFiles.length} 个变更文件: ${changedFiles.join(', ')}`)

// ── Load all existing plugins for uniqueness check ────────────────────────

const pluginsDir = 'plugins'
const allPluginFiles = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.json'))

const nameToFile = {}
for (const file of allPluginFiles) {
  const filePath = path.join(pluginsDir, file)
  let plugin
  try {
    plugin = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (e) {
    // Only fail if this is one of the files we're validating
    if (changedFiles.includes(filePath)) {
      fail(`${filePath}: JSON 解析失败 — ${e.message}`)
    }
    continue
  }
  if (plugin.name) {
    if (nameToFile[plugin.name] && nameToFile[plugin.name] !== file) {
      fail(`name "${plugin.name}" 在多个文件中重复: ${nameToFile[plugin.name]} 和 ${file}`)
    }
    nameToFile[plugin.name] = file
  }
}

// ── Validate each changed file ────────────────────────────────────────────

for (const filePath of changedFiles) {
  if (!fs.existsSync(filePath)) {
    // File deleted — skip (deletion is always allowed)
    console.log(`ℹ️  ${filePath} 已删除，跳过`)
    continue
  }

  let plugin
  try {
    plugin = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (e) {
    fail(`${filePath}: JSON 解析失败 — ${e.message}`)
    continue
  }

  const prefix = `[${filePath}]`

  // Must be a plain object
  check(plugin !== null && typeof plugin === 'object' && !Array.isArray(plugin),
    `${prefix}: 文件根节点必须是一个 JSON 对象（不是数组）`)

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    check(plugin[field] !== undefined && plugin[field] !== '',
      `${prefix}: 缺少必填字段 "${field}"`)
  }

  // name format
  if (plugin.name) {
    check(/^[\w.-]+(\/[\w.-]+)?$/.test(plugin.name),
      `${prefix}: name 格式应为 "slug" 或 "owner/slug"，仅允许字母、数字、-、_、.`)
  }

  // type
  if (plugin.type !== undefined) {
    check(VALID_TYPES.includes(plugin.type),
      `${prefix}: type 无效，可选值: ${VALID_TYPES.join(', ')}`)
  }

  // is_official
  if ('is_official' in plugin) {
    check(typeof plugin.is_official === 'boolean',
      `${prefix}: is_official 必须是 boolean`)
    check(plugin.is_official === false,
      `${prefix}: is_official 不允许在 PR 中自行设为 true，由维护者审核后标注`)
  }

  // tags
  if (plugin.tags !== undefined) {
    check(Array.isArray(plugin.tags), `${prefix}: tags 必须是数组`)
    for (const tag of plugin.tags || []) {
      check(typeof tag === 'string' && tag === tag.toLowerCase() && /^[a-z0-9-]+$/.test(tag),
        `${prefix}: tag "${tag}" 必须是小写英文字母、数字或连字符`)
    }
  }

  // dates
  for (const dateField of ['published_at', 'updated_at']) {
    if (plugin[dateField]) {
      check(!isNaN(Date.parse(plugin[dateField])),
        `${prefix}: ${dateField} 不是有效的 ISO 8601 日期格式`)
    }
  }

  // repo
  if (plugin.repo) {
    check(/^[\w.-]+\/[\w.-]+$/.test(plugin.repo),
      `${prefix}: repo 格式应为 "owner/repo"`)
  }

  // version
  if (plugin.version) {
    check(/^\d+\.\d+\.\d+/.test(plugin.version),
      `${prefix}: version 应遵循 semver 格式，如 1.0.0`)
  }

  if (exitCode === 0) {
    console.log(`✅ ${filePath} 校验通过`)
  }
}

if (exitCode !== 0) {
  console.error('\n请修复以上错误后重新提交')
}

process.exit(exitCode)
