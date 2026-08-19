# dsh-auto-title

Hermes 对标的 DSH 会话自动标题插件 — 前端立刻截取 + 后端异步 LLM 标题，think 标签过滤，每会话仅一次，手动改名后不再覆盖。零侵入 bundle 插件。

## 流程（对标 Hermes）

1. **新会话首问**：前端立刻截取首句做临时标题展示（乐观更新，无需等待后端）。
2. **首轮完整问答**：用户首问 + 助手回复流式结束后，后端异步非阻塞调用 LLM 生成正式简短标题，覆盖临时标题，前端侧边栏原地刷新。
3. **约束**：
   - 每会话只自动生成一次（provider 标题存在后不再触发）。
   - 用户手动改标题（source=user）后不再自动覆盖（与 DSH SessionTitleService pin 逻辑一致）。
   - 失败降级保留截取的临时标题。
   - 推理类模型自动过滤 `<think>` 标签内容。
   - 可开关，Web 设置页可配置辅助模型、超时等。
   - 无依赖、无侵入，不影响 dsh 源码。

## 安装

```bash
dsh plugin --profile web add /data/dsh-workspace/dsh-auto-title
# 重启后生效（按约束本次只安装不重启）
```

卸载：

```bash
dsh plugin --profile web remove dsh-auto-title
```

## 配置（设置页）

设置 → 插件配置 → 会话自动标题（auto-title）

- **启用自动标题**：总开关
- **辅助 Provider / Model**：留空则跟随会话主对话模型；填入则使用独立辅助模型，不占用主模型。
- **生成超时**：默认 15000ms，超时保留临时标题
- **目标词数 / CJK 字数**：默认 5 / 10
- **输入截断字节**：用户+助手上下文上限，默认 4096
- **最大输出 Token**：默认 64
- **截取最大词数/字节**：临时标题截取上限，默认 8 / 60
- **标题最大字节**：正式标题上限，默认 80

保存后热重载，无需重启。

### profile 覆盖（cordis.patch.yml）

```yaml
- id: auto-title
  config:
    enabled: true
    provider: ''
    model: ''
    timeoutMs: 15000
    targetWords: 5
    targetCjkCharacters: 10
    maxInputBytes: 4096
    maxOutputTokens: 64
    fallbackMaxWords: 8
    fallbackMaxBytes: 60
    maxTitleBytes: 80
```

## 实现细节

- 后端：监听 `session/event: assistant/message`，判定首轮（1 user + 1 assistant 且为根会话），异步非阻塞调用 `ctx.llm.stream`，系统提示对标 DSH title-llm，过滤 think 标签后 `normalizeSessionTitle` 并 `session.append('session/title', {source:{kind:'provider',provider:'dsh-auto-title'}})`
- 前端：`lib/client.js` 在设置卡片外另注入乐观钩子，拦截输入框回车/点击发送及 MutationObserver 监听用户消息，`firstSentence → fallbackSessionTitle → truncateUtf8` 计算后原地替换侧边栏“新会话”占位，待后端正式标题通过 projection 刷新后自然覆盖
- 失败路径：LLM 空输出、超时、路由缺失等均仅 warn 并保留临时标题

## 零依赖

仅依赖 DSH 自带 `@deepseek-ai/dsh-settings` + `schemastery`，前端复用 `dsh-client-ui-primitives`，未引入额外第三方。

## 许可证

MIT
