# 发布插件到市场

## 前置要求

- 插件仓库托管在 GitHub
- 仓库根目录有 `package.json`（含 `"plugin"` 字段）和 `index.js`
- 插件可正常安装运行

## 发布流程

### 1. 准备仓库

确保仓库根目录包含：

```
your-plugin/
├── package.json  ← 必须（含 "plugin" 字段，包含 name、title、description、version、author）
├── index.js      ← 编译后的单文件脚本
└── README.md     ← 建议提供
```

`package.json` 中 `"plugin"` 字段的 `name` 建议使用 `your-github-username/plugin-slug` 格式，安装后不可更改。

### 2. 发布 Release

打好 git tag 并在 GitHub Releases 上附上版本说明：

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 3. 提交 PR

Fork 本仓库，在 `plugins/` 目录下新建一个 JSON 文件：

- 文件命名：`{your-name}_{plugin-slug}.json`（例：`alice_my-plugin.json`）
- **不要修改 `registry.json`**，该文件由 CI 自动生成

文件内容示例：

```json
{
  "name": "your-name/your-plugin",
  "title": "插件显示名称",
  "description": "一句话描述插件功能",
  "version": "1.0.0",
  "author": "your-name",
  "icon": "i-tabler-plug",
  "repo": "your-github-username/your-repo",
  "homepage": "https://github.com/your-github-username/your-repo",
  "tags": ["tag1", "tag2"],
  "type": "hook",
  "is_official": false,
  "license": "MIT",
  "published_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z"
}
```

### 4. 等待审核

CI 会自动校验字段完整性。审核通过合并后，CI 自动重新生成 `registry.json`，插件随即出现在博客管理后台的插件市场中。

---

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | ✅ | 唯一标识符，推荐 `owner/slug` 格式 |
| `title` | string | ✅ | 市场展示名称 |
| `description` | string | ✅ | 一句话功能描述 |
| `version` | string | ✅ | 当前版本号，如 `1.2.0` |
| `author` | string | ✅ | 作者名或 GitHub 用户名 |
| `repo` | string | ✅ | GitHub 仓库路径，如 `user/repo`（博客通过此安装）|
| `icon` | string | | [Tabler Icons](https://tabler.io/icons) 图标名，如 `i-tabler-bell` |
| `homepage` | string | | 主页 URL，默认与 repo 相同 |
| `tags` | string[] | | 分类标签，小写英文字母、数字或 `-` |
| `type` | string | | `hook` / `integration` / `theme` |
| `is_official` | boolean | | 官方插件，由维护者标注，PR 中不可设为 true |
| `license` | string | | 开源协议，如 `MIT` |
| `published_at` | string | ✅ | 首次发布时间，ISO 8601 格式 |
| `updated_at` | string | ✅ | 最后更新时间，ISO 8601 格式 |

### type 值说明

| 值 | 适用场景 |
|---|---|
| `hook` | 监听/拦截博客事件（通知推送、数据处理等）|
| `integration` | 第三方服务集成（分析、评论、搜索等）|
| `theme` | 纯 CSS 主题/样式插件 |

---

## 更新插件

有新版本时，直接修改你的 `plugins/{name}.json` 文件，更新 `version` 和 `updated_at` 字段，再提一个 PR 即可。

## 下架插件

提 PR 删除对应的 `plugins/{name}.json` 文件，并在 PR 描述中说明原因。
