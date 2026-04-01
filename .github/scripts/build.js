// Aggregates all plugins/*.json into registry.json.
// Runs automatically after every merge to main that touches plugins/.

const fs = require('fs')
const path = require('path')

const pluginsDir = 'plugins'
const outputFile = 'registry.json'

const files = fs.readdirSync(pluginsDir)
  .filter(f => f.endsWith('.json'))
  .sort()

const registry = []
const errors = []

for (const file of files) {
  const filePath = path.join(pluginsDir, file)
  try {
    const plugin = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    registry.push(plugin)
  } catch (e) {
    errors.push(`${filePath}: ${e.message}`)
  }
}

if (errors.length > 0) {
  console.error('❌ 以下文件解析失败：')
  errors.forEach(e => console.error(' ', e))
  process.exit(1)
}

// Sort by published_at descending (newest first)
registry.sort((a, b) => {
  const ta = a.published_at ? new Date(a.published_at).getTime() : 0
  const tb = b.published_at ? new Date(b.published_at).getTime() : 0
  return tb - ta
})

fs.writeFileSync(outputFile, JSON.stringify(registry, null, 2) + '\n')
console.log(`✅ 已生成 ${outputFile}，共 ${registry.length} 个插件`)
