/**
 * dsh-auto-title — DSH 会话自动标题插件（DSH Cordis 插件）。
 *
 * 设计：
 *  1. 前端立刻截取首句做临时标题展示（乐观更新，lib/client.js 负责）
 *  2. 第一轮完整问答（用户提问 + 助手回复流式结束后）后台异步非阻塞调用 LLM 生成正式简短标题，覆盖临时标题
 *  3. 每会话只自动生成一次；用户手动改标题后（source=user）不再自动覆盖
 *  4. 支持独立辅助模型（config.provider/model/baseURL/apiKey），可完全独立于主对话模型；失败保留截取的临时标题
 *  5. 推理类模型自动过滤 <think> 标签内容
 *  6. 可开关，Web 设置页可配置模型、超时等
 *  7. 无依赖、无侵入，不影响 dsh 源码
 *
 * 后端实现要点：
 *  - 零侵入：通过 Cordis 插件 API（installSettingsSection、ctx.on('session/event')、ctx.llm.stream）实现
 *  - 不注册 sessionTitle provider（避免与内置 first-prompt-llm 冲突），直接监听 assistant/message 事件并 append session/title
 *  - 异步非阻塞：使用 Promise.resolve().then  detached，不阻塞主 agent 循环
 *  - 复用 DSH 的 normalize/fallback 逻辑，保证标题在 maxTitleBytes 预算内且为单行纯文本
 */

import z from "@deepseek-ai/schemastery"
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings"

export const name = "auto-title"
export const SETTINGS_NS = settingsNamespace("auto-title")

export const Config = z.object({
  enabled: z.boolean().default(true),
  provider: z.string().default(""),
  model: z.string().default(""),
  baseURL: z.string().default(""),
  apiKey: z.string().default(""),
  timeoutMs: z.number().min(1000).max(120000).default(15000),
  targetWords: z.number().min(1).default(5),
  targetCjkCharacters: z.number().min(1).default(10),
  maxInputBytes: z.number().min(100).default(4096),
  maxOutputTokens: z.number().min(1).default(64),
  fallbackMaxWords: z.number().min(1).default(8),
  fallbackMaxBytes: z.number().min(1).default(60),
  maxTitleBytes: z.number().min(1).default(80),
})

// ---------- 文本规范化（与 @deepseek-ai/dsh-session-title 保持一致） ----------

const OSC_SEQUENCE = /(?:\u001B\]|\u009D)(?:(?!\u0007|\u001B\\)[\s\S])*(?:\u0007|\u001B\\|$)/gu
const CSI_SEQUENCE = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu
const ESC_SEQUENCE = /\u001B[@-_]/gu
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu
const DIRECTIONAL_CONTROL = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/gu

function assertPositiveInteger(n, v) {
  if (!Number.isInteger(v) || v <= 0) throw new Error(n + ' must be a positive integer')
}

function cleanTitleText(input) {
  return input
    .replace(OSC_SEQUENCE, '')
    .replace(CSI_SEQUENCE, '')
    .replace(ESC_SEQUENCE, '')
    .replace(CONTROL_CHARACTER, '')
    .replace(DIRECTIONAL_CONTROL, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function truncateTitleUtf8(input, maxBytes) {
  assertPositiveInteger('maxBytes', maxBytes)
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) return input
  let used = 0
  let output = ''
  for (const ch of input) {
    const b = Buffer.byteLength(ch, 'utf8')
    if (used + b > maxBytes) break
    output += ch
    used += b
  }
  return output
}

function normalizeSessionTitle(input, maxBytes) {
  return truncateTitleUtf8(cleanTitleText(input), maxBytes).trimEnd()
}

function fallbackSessionTitle(input, maxWords, maxBytes) {
  assertPositiveInteger('maxWords', maxWords)
  const words = cleanTitleText(input).split(' ').filter(Boolean).slice(0, maxWords)
  return truncateTitleUtf8(words.join(' '), maxBytes).trimEnd()
}

// 推理标签过滤：去除 <think>...</think> 及未闭合的残留
// content 为 null 的思考型模型：只取 reasoning 结尾结论句，避免把思维链当标题
function extractReasoningTail(input, maxBytes) {
  const cleaned = normalizeSessionTitle(input, Number.MAX_SAFE_INTEGER)
  if (!cleaned) return ''
  // 1) 优先定位“答案 / answer / final answer / 最终回答”标记后的内容（真正结论）
  const markers = [/(?:答案|回答|最终回答|结论)(?:[:：\s-]*)($)/, /(?:final\s+answer|answer)(?:[:：\s-]*)(.+?)$/i]
  for (const m of markers) {
    const hit = cleaned.match(m)
    if (hit && hit[1] && hit[1].trim()) {
      return truncateTitleUtf8(hit[1].trim(), maxBytes).trim()
    }
  }
  // 2) 否则取最后一段（按空行/换行切分），段尾为结论
  const paragraphs = cleaned.split(/\n{1,}/).map((s) => s.trim()).filter(Boolean)
  if (paragraphs.length > 1) {
    return truncateTitleUtf8(paragraphs[paragraphs.length - 1], maxBytes).trim()
  }
  // 3) 兜底：按句末标点取最后一句
  const parts = cleaned.split(/(?<=[。！？!?])/).map((s) => s.trim()).filter(Boolean)
  const tail = parts.length > 1 ? parts[parts.length - 1] : cleaned
  return truncateTitleUtf8(tail, maxBytes).trim()
}

function stripThinkTags(input) {
  // 完整 think 块（含属性）不区分大小写
  let out = input.replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, ' ')
  // 残留的孤立开/闭标签
  out = out.replace(/<\/?think\b[^>]*>/gi, ' ')
  // 常见的 <thinking> 变体也过滤
  out = out.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking\s*>/gi, ' ')
  out = out.replace(/<\/?thinking\b[^>]*>/gi, ' ')
  return out
}

function stripThinkAndNormalize(input, maxBytes) {
  const stripped = stripThinkTags(input)
  return normalizeSessionTitle(stripped, maxBytes)
}

// 收集用户文本消息（与 SessionTitleService.collectSessionTitleMessages 对齐）
function collectUserTextMessages(events, throughSeq) {
  const msgs = []
  for (const ev of events) {
    if (throughSeq !== undefined && ev.seq > throughSeq) break
    if (ev.type !== 'user/message' || ev.data.source?.kind !== 'user') continue
    const content = ev.data.content || []
    const text = content.filter(b => b.type === 'text').map(b => b.text).join('\n')
    if (normalizeSessionTitle(text, Number.MAX_SAFE_INTEGER).length === 0) continue
    msgs.push({ seq: ev.seq, text })
  }
  return msgs
}

function foldSessionTitle(events) {
  const ev = events.findLast ? events.findLast(e => e.type === 'session/title') : [...events].reverse().find(e => e.type === 'session/title')
  if (!ev) return undefined
  return {
    title: ev.data.title,
    messageSeqs: [...ev.data.messageSeqs],
    source: ev.data.source,
    eventSeq: ev.seq,
    updatedAt: ev.time,
  }
}

// 供 prompt 使用的上下文裁剪（UTF-8 字节预算）
function truncateUtf8Bytes(input, maxBytes) {
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) return input
  let used = 0
  let out = ''
  for (const ch of input) {
    const b = Buffer.byteLength(ch, 'utf8')
    if (used + b > maxBytes) break
    out += ch
    used += b
  }
  return out
}

function systemPrompt(cfg) {
  return [
    'Create a concise title for an AI coding-assistant session from the supplied conversation.',
    'Return only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.',
    'Use the language of the messages.',
    `Aim for about ${cfg.targetWords} words in non-CJK languages or ${cfg.targetCjkCharacters} CJK characters and stay within ${cfg.maxTitleBytes} UTF-8 bytes.`,
    'Focus on the user intent and the assistant response; ignore any reasoning or think tags.',
  ].join('\n')
}

// 解析路由：优先独立辅助模型，否则回落到会话当前的 requestHeader
function resolveRoute(cfg, session) {
  if (cfg.provider && cfg.model) {
    return { provider: cfg.provider, model: cfg.model }
  }
  // 尝试从会话的 request header 获取主对话模型
  try {
    const header = session.requestHeader?.()
    if (header?.config?.provider && header?.config?.model) {
      return { provider: header.config.provider, model: header.config.model }
    }
  } catch {}
  // 再尝试从会话事件里的 request/header 回溯
  const lastHeader = [...session.events].reverse().find(e => e.type === 'request/header')
  if (lastHeader?.data?.header?.config?.provider && lastHeader?.data?.header?.config?.model) {
    return { provider: lastHeader.data.header.config.provider, model: lastHeader.data.header.config.model }
  }
  return undefined
}

export function apply(ctx, config = {}) {

  let current = () => config
  installSettingsSection(ctx, SETTINGS_NS, Config, config, {
    setSource: (src) => { current = src },
    onChange: () => {}
  })

  const generating = new Set() // session.id -> in-flight guard
  const generatedOnce = new Set() // session.id that already did provider generation (内存去重，持久化靠 log 的 provider title)

  // 辅助：判断是否可自动生成
  function shouldGenerate(session) {
    const cfg = current()
    if (!cfg.enabled) return false
    // 用户已手动改名则 pin，不再覆盖
    const folded = foldSessionTitle(session.events)
    if (folded?.source?.kind === 'user') return false
    // 已有 provider 标题则说明已生成过（每会话只一次）
    if (folded?.source?.kind === 'provider') return false
    // 正在生成中则去重
    if (generating.has(session.id)) return false
    // 内存标记已生成过则不再生成（防止重复 assistant/message 触发）
    if (generatedOnce.has(session.id)) return false
    return true
  }

  // 监听助手消息完成 + turn 结束：首轮完整问答结束后触发（兼容工具调用轮次）
  ctx.on('session/event', (session, event) => {

    const cfg = current()
    if (!cfg.enabled) return
    const isRootSession = session.header?.parentSession === undefined
    if (!isRootSession) return

    if (event.type === 'assistant/message' || event.type === 'turn/end') {
      const userMsgs = collectUserTextMessages(session.events)
      if (userMsgs.length !== 1) return // 仅首轮（第一条用户消息）

      // 首轮正文消息：含非空 text 且无 tool-call（工具循环中第一条正文到来即可触发）
      let hasContent = false
      if (event.type === 'assistant/message') {
        const content = event.data?.message?.content || []
        const hasToolCall = content.some((b) => b.type === 'tool-call')
        const hasText = content.some((b) => b.type === 'text' && b.text && b.text.trim())
        hasContent = !hasToolCall && hasText
      } else {
        // turn/end 兜底：最后一条 assistant/message 有正文即可
        const last = [...session.events].reverse().find((e) => e.type === 'assistant/message')
        const content = last?.data?.message?.content || []
        hasContent = content.some((b) => b.type === 'text' && b.text && b.text.trim())
      }
      if (!hasContent) return
      if (!shouldGenerate(session)) return

      const route = resolveRoute(cfg, session)
      if (!route) {
        ctx.logger?.warn?.('[auto-title] session "' + session.id + '" no route available, skip generation')
        return
      }

      generating.add(session.id)
      generatedOnce.add(session.id)
      ctx.logger?.info?.('[auto-title] schedule generation for session "' + session.id + '" via ' + route.provider + '/' + route.model)

      // 异步非阻塞，不阻塞主 agent 循环
      Promise.resolve().then(async () => {
        try {
          await generateAndCommit(session, cfg, route)
        } catch (err) {
          ctx.logger?.warn?.('[auto-title] session "' + session.id + '" generation failed, keep fallback: ' + String((err && err.message) || err))
        } finally {
          generating.delete(session.id)
        }
      })
    }
  })

  // 会话销毁时清理
  ctx.on('session/disposed', (session) => {
    generating.delete(session.id)
    // generatedOnce 保留内存即可，无需清理（会话已销毁）
  })

  async function generateAndCommit(session, cfg, route) {
    // 再次校验会话仍存活且标题未被 pin
    if (ctx.sessions?.get?.(session.id) !== session) throw new Error('session not live')
    const folded = foldSessionTitle(session.events)
    if (folded?.source?.kind === 'user' || folded?.source?.kind === 'provider') {
      return // 已被外部改动，直接退出
    }

    const userMsgs = collectUserTextMessages(session.events)
    const firstUser = userMsgs[0]
    if (!firstUser) return

    const assistantMsg = session.events.filter(e => e.type === 'assistant/message').at(-1)
    const assistantText = assistantMsg?.data?.message?.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n') || ''

    // 输入裁剪：用户问题 + 助手回答，整体不超过 maxInputBytes
    const half = Math.floor(cfg.maxInputBytes / 2)
    const userPart = truncateUtf8Bytes(firstUser.text, half)
    const assistantPart = truncateUtf8Bytes(assistantText, cfg.maxInputBytes - Buffer.byteLength(userPart, 'utf8'))
    const combined = [
      'User: ' + userPart,
      assistantPart ? 'Assistant: ' + assistantPart : null,
    ].filter(Boolean).join('\n\n')

    const inputMessages = [
      // 用 dsh-llm 的消息形态：role + content
      { role: 'user', content: [{ type: 'text', text: combined }] }
    ]
    const system = systemPrompt(cfg)

    // 超时控制
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(new Error('auto-title timeout')), cfg.timeoutMs)
    const signal = controller.signal

    // 如果 ctx.llm 不可用则直接用 fallback 标题已存在即可
    const useIndependent = cfg.baseURL && cfg.model
    if (!useIndependent && !ctx.llm?.stream) {
      clearTimeout(timeoutId)
      ctx.logger?.warn?.('[auto-title] llm service unavailable')
      return
    }

    const titleProvider = 'dsh-auto-title'

    // 记录请求供调试（可选，与内置 session/title-llm-request 对齐）
    try {
      session.append('session/title-llm-request', {
        titleProvider,
        messageSeqs: [firstUser.seq, ...(assistantMsg ? [assistantMsg.seq] : [])],
        route,
        system,
        messages: inputMessages,
        maxTokens: cfg.maxOutputTokens,
      })
    } catch {}

    let rawTitle = ''
    const attempts = []
    try {
      if (useIndependent) {
        attempts.push('independent')
        try {
          const url = cfg.baseURL.replace(/\/$/, '') + '/chat/completions'
          const body = {
            model: cfg.model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: inputMessages[0]?.content?.[0]?.text || '' }
            ],
            max_tokens: cfg.maxOutputTokens,
            temperature: 0.7,
            // 尝试让推理模型直接返回最终输出（content），而非把输出全放进 reasoning
            thinking: { type: 'disabled' },
            include_reasoning: false,
            reasoning_effort: 'none'
          }
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(cfg.apiKey ? { 'Authorization': 'Bearer ' + cfg.apiKey } : {})
            },
            body: JSON.stringify(body),
            signal
          })
          if (!res.ok) {
            const txt = await res.text().catch(()=> '')
              throw new Error('independent LLM ' + res.status + ' ' + txt)
          }
          const data = await res.json()
          if (!data.choices && (data.error || data.type === 'error')) {
            throw new Error('independent LLM error body: ' + String(JSON.stringify(data)).slice(0, 300))
          }
          const choice = data.choices?.[0] || {}
          const msg = choice.message || {}
          let content = ''
          if (typeof msg.content === 'string') content = msg.content
          else if (Array.isArray(msg.content)) content = msg.content.map((p) => (p && p.text) || '').join('')
          // 思考型模型 content 为 null：不把整段思维链当标题，只取 reasoning 的结尾结论句
          if (!content) {
            let reasoning = ''
            if (typeof msg.reasoning === 'string') reasoning = msg.reasoning
            else if (Array.isArray(msg.reasoning_details)) reasoning = msg.reasoning_details.map((d) => (d && d.text) || '').join(' ')
            else if (typeof msg.reasoning_content === 'string') reasoning = msg.reasoning_content
            if (reasoning) content = extractReasoningTail(reasoning, cfg.maxTitleBytes)
          }
          if (!content && typeof choice.text === 'string') content = choice.text
          rawTitle = (content || '').trim()
        } catch (e) {
        }
      }

      // 独立失败或未配置时，跟随主对话模型（ctx.llm.stream）
      if (!rawTitle && ctx.llm && typeof ctx.llm.stream === 'function') {
        attempts.push('main')
        try {
          const stream = ctx.llm.stream({
            provider: route.provider,
            model: route.model,
            messages: inputMessages,
            system,
            maxTokens: cfg.maxOutputTokens,
            sessionId: session.id,
            purpose: 'session-title',
            signal,
          })
          let assembler
          try {
            const llmMod = await import('@deepseek-ai/dsh-llm')
            if (llmMod && llmMod.BlockAssembler) {
              assembler = new llmMod.BlockAssembler()
            }
          } catch (e2) {}
          if (assembler) {
            for await (const chunk of stream) {
              signal.throwIfAborted()
              assembler.push(chunk)
            }
            signal.throwIfAborted()
            const blocks = assembler.blocks()
            if (!blocks.some((b) => b.type === 'tool-call')) {
              rawTitle = blocks.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim()
            }
          } else {
            for await (const chunk of stream) {
              signal.throwIfAborted()
              if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') rawTitle += chunk.text
              else if (chunk && chunk.delta && chunk.delta.content) rawTitle += chunk.delta.content
              else if (chunk && typeof chunk.text === 'string') rawTitle += chunk.text
            }
          }
        } catch (e) {
        }
      }

      if (!rawTitle) {
        throw new Error('no title source produced text (attempts: ' + attempts.join(',') + ')')
      }
    } catch (e) {
      clearTimeout(timeoutId)
      throw e
    }
    clearTimeout(timeoutId)
    signal.throwIfAborted()

    // 过滤 think 标签并规范化
    const normalized = stripThinkAndNormalize(rawTitle, cfg.maxTitleBytes)
    if (normalized.length === 0) {
      ctx.logger?.warn?.('[auto-title] session "' + session.id + '" empty after think-filter, raw=' + String(rawTitle).slice(0, 160))
      throw new Error('title model produced empty after filtering')
    }

    // 最终校验：会话仍存活且未被 user pin / provider 覆盖
    if (ctx.sessions?.get?.(session.id) !== session) throw new Error('session not live after generation')
    const latest = foldSessionTitle(session.events)
    if (latest?.source?.kind === 'user' || latest?.source?.kind === 'provider') {
      return // 已被外部覆盖，不再追加
    }

    // 追加正式标题（provider 来源，标记模型，供前端刷新）
    const messageSeqs = [firstUser.seq]
    if (assistantMsg) messageSeqs.push(assistantMsg.seq)

    session.append('session/title', {
      title: normalized,
      messageSeqs,
      source: {
        kind: 'provider',
        provider: titleProvider,
        model: { provider: route.provider, model: route.model },
      },
    })

    ctx.logger?.info?.(`[auto-title] session "${session.id}" title generated: "${normalized}"`)
  }
}

export const inject = ["sessions", "llm", "settings"]