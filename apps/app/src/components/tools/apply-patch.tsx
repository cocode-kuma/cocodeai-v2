"use client"

import { Tool } from "@/components/ui/tool"
import type { ApplyPatchToolPart } from "@/lib/build-in-tools"

interface ApplyPatchToolProps {
  part: ApplyPatchToolPart
}

function getApplyPatchToolTitle(part: ApplyPatchToolPart): string | null {
  if (part.state === "output-error") {
    return "尝试应用补丁"
  }

  if (part.state !== "output-available") {
    return null
  }

  return "应用补丁"
}

export function ApplyPatchTool({ part }: ApplyPatchToolProps) {
  return (
    <Tool toolPart={part} title={getApplyPatchToolTitle(part) ?? undefined} />
  )
}
