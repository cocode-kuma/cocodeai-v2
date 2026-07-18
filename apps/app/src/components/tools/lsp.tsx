"use client"

import { Tool } from "@/components/ui/tool"
import type { LspInput, LspToolPart } from "@/lib/build-in-tools"
import { parseFilename, toolDisplayTitle } from "@/components/tools/path"

interface LspToolProps {
  part: LspToolPart
}

const LSP_OPERATION_LABELS: Record<LspInput["operation"], string> = {
  goToDefinition: "转到定义",
  findReferences: "查找引用",
  hover: "悬停",
  documentSymbol: "文档符号",
  workspaceSymbol: "工作区符号",
  goToImplementation: "转到实现",
  prepareCallHierarchy: "准备调用层次",
  incomingCalls: "传入调用",
  outgoingCalls: "传出调用",
}

function getLspToolTitle(part: LspToolPart): string | null {
  const filename = parseFilename(part.input.filePath)
  const operation = LSP_OPERATION_LABELS[part.input.operation]

  if (part.state === "output-error") {
    return `${operation} attempted in ${filename}`
  }

  if (part.state !== "output-available") {
    return null
  }

  return `${operation} in ${filename}`
}

function getLspToolDetail(part: LspToolPart): string | undefined {
  const line = part.input.line
  const character = part.input.character
  const query = part.input.query?.trim()

  const location = `L${line}:${character}`
  if (query) {
    return `${location} · ${query}`
  }

  return location
}

export function LspTool({ part }: LspToolProps) {
  return (
    <Tool
      toolPart={part}
      title={toolDisplayTitle(getLspToolTitle(part), getLspToolDetail(part))}
    />
  )
}
