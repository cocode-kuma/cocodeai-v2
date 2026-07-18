import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai"
import {
  isApplyPatchToolPart,
  isBashToolPart,
  isEditToolPart,
  isEnvVarRequestToolPart,
  isGlobToolPart,
  isGrepToolPart,
  isLspToolPart,
  isQuestionToolPart,
  isReadToolPart,
  isSkillToolPart,
  isTaskToolPart,
  isTodoWriteToolPart,
  isWebFetchToolPart,
  isWebSearchToolPart,
  isWriteToolPart,
} from "@/lib/build-in-tools"
import { parseFilename, truncateText } from "@/components/tools/path"

type AnyToolPart = ToolUIPart | DynamicToolUIPart

export function isToolPartInFlight(part: AnyToolPart): boolean {
  return part.state === "input-streaming" || part.state === "input-available"
}

export function collectToolParts(messages: UIMessage[]): DynamicToolUIPart[] {
  return messages.flatMap((message) =>
    message.parts.filter(
      (part): part is DynamicToolUIPart => part.type === "dynamic-tool"
    )
  )
}

function hostnameOf(url: string | undefined): string | undefined {
  if (!url) {
    return undefined
  }
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

/**
 * Human-readable "what is this tool doing" label. Safe against partial
 * streamed input (fields may be missing despite the type contract).
 */
export function getToolActivityLabel(part: AnyToolPart): string {
  if (isBashToolPart(part)) {
    const description = part.input?.description?.trim()
    return description ? truncateText(description, 64) : "正在运行命令"
  }
  if (isReadToolPart(part)) {
    return `正在读取 ${parseFilename(part.input?.filePath)}`
  }
  if (isEditToolPart(part)) {
    return `正在编辑 ${parseFilename(part.input?.filePath)}`
  }
  if (isWriteToolPart(part)) {
    return `正在写入 ${parseFilename(part.input?.filePath)}`
  }
  if (isApplyPatchToolPart(part)) {
    return "正在应用更改"
  }
  if (isGrepToolPart(part) || isGlobToolPart(part)) {
    const pattern = part.input?.pattern?.trim()
    return pattern
      ? `正在搜索 ${truncateText(pattern, 44)}`
      : "正在搜索文件"
  }
  if (isLspToolPart(part)) {
    return `正在检查 ${parseFilename(part.input?.filePath)}`
  }
  if (isSkillToolPart(part)) {
    const name = part.input?.name?.trim()
    return name ? `正在加载 ${name} 技能` : "正在加载技能"
  }
  if (isTodoWriteToolPart(part)) {
    return "正在更新计划"
  }
  if (isWebFetchToolPart(part)) {
    const host = hostnameOf(part.input?.url)
    return host ? `正在读取 ${host}` : "正在抓取页面"
  }
  if (isWebSearchToolPart(part)) {
    const query = part.input?.query?.trim()
    return query
      ? `正在搜索网页 ${truncateText(query, 44)}`
      : "正在搜索网页"
  }
  if (isQuestionToolPart(part)) {
    return "正在提问"
  }
  if (isEnvVarRequestToolPart(part)) {
    const key = part.input?.key?.trim()
    return key ? `正在请求 ${key}` : "正在请求环境变量"
  }
  if (isTaskToolPart(part)) {
    const description = part.input?.description?.trim()
    return description
      ? `Agent: ${truncateText(description, 56)}`
      : "正在运行代理"
  }
  if (part.type === "dynamic-tool") {
    return `Running ${part.toolName.replace(/[_-]+/g, " ")}`
  }
  return "Working"
}

/** Label for the most recent tool still in flight, if any. */
export function getActiveToolLabel(parts: DynamicToolUIPart[]): string | null {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part && isToolPartInFlight(part)) {
      return getToolActivityLabel(part)
    }
  }
  return null
}

