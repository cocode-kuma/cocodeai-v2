"use client"

import { Tool } from "@/components/ui/tool"
import type { GrepToolPart } from "@/lib/build-in-tools"
import { parseFilename, toolDisplayTitle, truncateText } from "@/components/tools/path"

interface GrepToolProps {
  part: GrepToolPart
}

function getGrepToolTitle(part: GrepToolPart): string | null {
  const pattern = part.input?.pattern?.trim() ?? ""

  if (part.state === "output-error") {
    return pattern
      ? `尝试搜索 ${truncateText(pattern, 44)}`
      : "尝试搜索"
  }

  if (part.state !== "output-available") {
    return null
  }

  return pattern ? `已搜索 ${truncateText(pattern, 44)}` : "已搜索代码"
}

function getGrepToolDetail(part: GrepToolPart): string | undefined {
  const root = part.input?.path?.trim()
  if (!root) {
    return undefined
  }

  return `in ${parseFilename(root)}`
}

export function GrepTool({ part }: GrepToolProps) {
  return (
    <Tool
      toolPart={part}
      title={toolDisplayTitle(getGrepToolTitle(part), getGrepToolDetail(part))}
    />
  )
}
