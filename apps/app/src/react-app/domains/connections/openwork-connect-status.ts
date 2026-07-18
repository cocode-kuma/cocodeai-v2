import type { SessionCloudMcpMaintenanceState } from "./use-session-mcp-maintenance";

export type OpenWorkConnectStatus = {
  state: "checking" | "ready" | "needs_attention";
  label: string;
  description: string;
};

export function openWorkConnectAttentionTitle(description: string): string {
  return `One possible issue: ${description}`;
}

export function resolveOpenWorkConnectStatus(
  signedIn: boolean,
  maintenance: SessionCloudMcpMaintenanceState | undefined,
): OpenWorkConnectStatus | null {
  if (!signedIn) return null;

  if (maintenance?.status === "ready") {
    return {
      state: "ready",
      label: "Ready",
      description: "Connected service tools are available.",
    };
  }

  if (maintenance?.status === "failed" || maintenance?.status === "skipped") {
    return {
      state: "needs_attention",
      label: "需要注意",
      description: maintenance.issue?.message
        ?? "CocodeAI Connect 无法验证已连接的服务工具。请运行诊断以获取详细信息。",
    };
  }

  return {
    state: "checking",
    label: "正在检查",
    description: maintenance?.status === "retrying"
      ? `Restoring connected service tools (${maintenance.attempt}/${maintenance.maxAttempts}).`
      : "Checking connected service tools in the background.",
  };
}
