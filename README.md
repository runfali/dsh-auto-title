# dsh-auto-title

DSH 会话自动标题插件 — 前端立刻截取 + 后端异步 LLM 标题，think 标签过滤，每会话仅一次，手动改名后不再覆盖。零侵入 bundle 插件。

## 特性

- **即时反馈**：新会话首问立刻截取首句做临时标题（乐观更新），无需等待模型
- **异步精炼**：首轮完整问答结束后后台异步调用 LLM 生成正式标题并覆盖临时标题
- **一次性**：每会话仅自动生成一次，已有 provider 标题后不再触发
- **尊重用户**：手动改名（`source=user`）后永久 pin，不再自动覆盖
- **鲁棒**：推理模型自动过滤 `<think>` 标签；超时/空输出/路由缺失时保留临时标题
- **零侵入**：标准 Cordis bundle 插件，不改 DSH 源码；除 `@deepseek-ai/dsh-settings`/`schemastery` 外无第三方依赖

## 环境要求

- DeepSeek Harness（dsh），以 `web` profile 运行（`>=0.1.0-rc.8`）
- Node.js >= 22

## 安装

```bash
dsh plugin --profile web add dsh-auto-title
```

重启 dsh Web 生效。

开发环境可直接引用本地路径：

```bash
dsh plugin --profile web add /path/to/dsh-auto-title
```

## 卸载

```bash
dsh plugin --profile web remove dsh-auto-title
```

重启后恢复系统默认标题逻辑。

## 配置

### 设置页（推荐）

打开 Web UI 的 **设置 → 插件配置 → 会话自动标题（auto-title）**，可直接修改：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `provider` / `model` | 空 | 辅助模型。留空则跟随会话主对话模型；填入则使用独立模型 |
| `baseURL` / `apiKey` | 空 | 独立模型需填 OpenAI 兼容接口地址与密钥 |
| `timeoutMs` | `15000` | 单次生成超时 |
| `targetWords` / `targetCjkCharacters` | `5` / `10` | 期望标题长度 |
| `maxInputBytes` | `4096` | 用户 + 助手上下文裁剪上限 |
| `maxOutputTokens` | `64` | 标题生成最大 token |
| `fallbackMaxWords` / `fallbackMaxBytes` | `8` / `60` | 临时标题截取上限 |
| `maxTitleBytes` | `80` | 正式标题上限 |

保存后热生效。

### profile 覆盖（`~/.dsh/profiles/web/cordis.patch.yml`）

```yaml
- id: auto-title
  config:
    enabled: true
    provider: ''
    model: ''
    baseURL: ''
    apiKey: ''
    timeoutMs: 15000
    targetWords: 5
    targetCjkCharacters: 10
    maxInputBytes: 4096
    maxOutputTokens: 64
    fallbackMaxWords: 8
    fallbackMaxBytes: 60
    maxTitleBytes: 80
```

> 注意：补丁是整段替换 `config`，覆盖时需写全所有项。

## 工作流程

1. **首问**：前端通过输入框监听与 `MutationObserver` 立刻截取首句 → `fallbackSessionTitle` → 原地替换侧边栏“新会话”占位
2. **首轮完成**：后端监听 `session/event: assistant/message` 与 `turn/end`，判定根会话且仅 1 条用户消息 + 1 条有效助手正文
3. **异步生成**：通过 `ctx.llm.stream`（或独立 `baseURL`）以 `systemPrompt` 调用模型，`stripThinkTags` + `normalizeSessionTitle` 后 `session.append('session/title', {source:{kind:'provider'}})`
4. **覆盖**：前端 projection 刷新，正式标题覆盖临时标题；失败仅 `warn` 并保留临时标题

## 实现要点

- 不注册 `sessionTitle` provider，避免与内置 `first-prompt-llm` 冲突
- `Promise.resolve().then` 异步非阻塞，不阻塞主 agent 循环
- `generating` / `generatedOnce` 内存去重，持久化去重依赖 `session/title` 的 `provider` 标记
- 复用 DSH 的 `normalize`/`truncateUtf8` 逻辑，保证单行纯文本且在 `maxTitleBytes` 内

## 许可证

[MIT](LICENSE)
