// Owned here: reload vocabulary is part of the extension manifest contract.
// types.ts re-exports it for the rest of the app.
export type ReloadReason = "plugins" | "skills" | "mcp" | "config" | "agents" | "commands";

export type OpenWorkExtensionSourceFormat =
  | "openwork-builtin"
  | "openwork-extension-manifest"
  | "claude-plugin"
  | "opencode-plugin"
  | "mcp-directory"
  | "manual";

export type OpenWorkExtensionSource = {
  format: OpenWorkExtensionSourceFormat;
  trusted: boolean;
  origin?: "builtin" | "den" | "workspace" | "local";
  reference?: string;
};

export type OpenWorkExtensionResourceType =
  | "skill"
  | "agent"
  | "command"
  | "tool"
  | "mcp"
  | "opencode-plugin"
  | "provider"
  | "hook"
  | "context"
  | "secret"
  | "file"
  | "local-service"
  | "native-binary";

export type OpenWorkExtensionResource = {
  type: OpenWorkExtensionResourceType;
  id: string;
  label?: string;
  description?: string;
  path?: string;
  command?: string[];
  envKey?: string;
  packageName?: string;
  providerId?: string;
  mcpServerName?: string;
  localCommandRef?: "openwork.computerUseMcp" | "openwork.uiMcp";
  required?: boolean;
};

export type OpenWorkExtensionContributionType =
  | "settings-panel"
  | "setup-instructions"
  | "composer-prompt"
  | "session-side-panel"
  | "session-rail-item"
  | "control-actions"
  | "server-route"
  | "native-capability"
  | "test-action";

export type OpenWorkExtensionContribution = {
  type: OpenWorkExtensionContributionType;
  ref?: string;
  label?: string;
  description?: string;
  prompt?: string;
  location?: "settings-detail" | "composer" | "session-right-pane" | "session-rail" | "server" | "native";
};

export type OpenWorkExtensionSetup = {
  instructions?: string;
  primaryCta?: string;
  secondaryCta?: string;
  requiredEnv?: string[];
  testActionRef?: string;
};

export type OpenWorkExtensionLifecycle = {
  reload?: ReloadReason[];
  detection?: string[];
};

// ---------------------------------------------------------------------------
// Enablement — declarative conditions for extension "active" state
// ---------------------------------------------------------------------------

export type EnablementConditionType =
  | "mcp-connected"
  | "plugin-loaded"
  | "provider-connected"
  | "env-set"
  | "permission-granted"
  | "toggle-enabled";

export type EnablementCondition = {
  type: EnablementConditionType;
  /** What to check — MCP server name, plugin id, env key, etc. */
  ref: string;
  /** Human-readable label shown in the UI. */
  label: string;
};

/** Result of evaluating a single enablement condition at runtime. */
export type EnablementResult = {
  condition: EnablementCondition;
  met: boolean;
};

export type OpenWorkExtensionManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  preview?: boolean;
  source: OpenWorkExtensionSource;
  icon?: {
    src?: string;
    simpleIconSlug?: string;
  };
  composer?: {
    prompt: string;
  };
  setup?: OpenWorkExtensionSetup;
  resources: OpenWorkExtensionResource[];
  contributions?: OpenWorkExtensionContribution[];
  lifecycle?: OpenWorkExtensionLifecycle;
  /** Declarative conditions that must ALL be true for the extension to be "active". */
  enablement?: EnablementCondition[];
  defaultEnabled?: boolean;
  defaultHidden?: boolean;
  platform?: Array<"darwin" | "linux" | "windows" | "web">;
};

export function extensionContribution(
  manifest: OpenWorkExtensionManifest | undefined,
  type: OpenWorkExtensionContributionType,
): OpenWorkExtensionContribution | undefined {
  return manifest?.contributions?.find((contribution) => contribution.type === type);
}

export function extensionResource(
  manifest: OpenWorkExtensionManifest | undefined,
  type: OpenWorkExtensionResourceType,
): OpenWorkExtensionResource | undefined {
  return manifest?.resources.find((resource) => resource.type === type);
}

export function isTrustedBuiltInExtension(manifest: OpenWorkExtensionManifest | undefined): boolean {
  return manifest?.source.origin === "builtin" && manifest.source.trusted;
}

export const BUILT_IN_OPENWORK_EXTENSION_MANIFESTS: OpenWorkExtensionManifest[] = [
  {
    schemaVersion: 1,
    id: "openwork-browser",
    name: "CocodeAI 浏览器",
    description: "自动化内置浏览器面板，在 CocodeAI 内保持可见。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    icon: { src: "/openwork-mark.svg" },
    composer: { prompt: "使用 CocodeAI 浏览器扩展来 " },
    setup: {
      instructions: "CocodeAI 浏览器在桌面工作区中默认就绪。",
    },
    resources: [
      {
        type: "opencode-plugin",
        id: "opencode-chrome-devtools",
        packageName: "opencode-chrome-devtools",
        required: true,
      },
    ],
    contributions: [
      { type: "settings-panel", ref: "openwork.browser.settings", location: "settings-detail" },
      { type: "session-side-panel", ref: "openwork.browser.panel", location: "session-right-pane" },
      { type: "composer-prompt", prompt: "Use the CocodeAI Browser extension to ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "openwork-browser", label: "已启用" },
    ],
    lifecycle: { reload: ["plugins", "agents"], detection: ["plugin:opencode-chrome-devtools"] },
    defaultEnabled: true,
  },
  {
    schemaVersion: 1,
    id: "computer-use",
    name: "计算机使用",
    description: "仅限 Mac：通过语义无障碍引用、截图、后台安全点击、键盘输入和严格模式控制 Mac 应用。",
    preview: true,
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    icon: { src: "/openwork-mark.svg" },
    composer: { prompt: "Use Computer Use to " },
    setup: {
      instructions: "计算机使用仅限 Mac。它作为本地 MCP 服务器运行，由 macOS 辅助功能运行时支持。当 macOS 询问时，授予辅助功能和屏幕录制权限，然后在此工作区中连接 MCP 服务器。",
      primaryCta: "连接计算机使用 MCP",
      secondaryCta: "检查 macOS 权限",
      testActionRef: "openwork.computerUse.healthCheck",
    },
    resources: [
      {
        type: "mcp",
        id: "computer-use-mcp",
        label: "Computer Use MCP",
        mcpServerName: "computer-use",
        command: ["npx", "-y", "@cocodeai/handsfree", "mcp"],
        localCommandRef: "openwork.computerUseMcp",
        required: true,
      },
      {
        type: "native-binary",
        id: "computer-use-native",
        label: "macOS accessibility runtime",
        packageName: "@cocodeai/handsfree",
        required: true,
      },
    ],
    contributions: [
      { type: "setup-instructions", ref: "openwork.computerUse.setup", location: "settings-detail" },
      { type: "native-capability", ref: "openwork.computerUse.axPermissions", label: "Accessibility and Screen Recording" },
      { type: "test-action", ref: "openwork.computerUse.healthCheck", label: "Verify Computer Use MCP" },
      { type: "composer-prompt", prompt: "Use Computer Use to ", location: "composer" },
    ],
    enablement: [
      { type: "mcp-connected", ref: "computer-use", label: "MCP server connected" },
      { type: "permission-granted", ref: "accessibility", label: "Accessibility permission" },
      { type: "permission-granted", ref: "screenRecording", label: "Screen Recording permission" },
    ],
    lifecycle: { reload: ["mcp"], detection: ["mcp:computer-use"] },
    platform: ["darwin"],
  },
  {
    schemaVersion: 1,
    id: "openai-image-gen",
    name: "OpenAI 图像生成",
    description: "使用 gpt-image-2 生成图像产出物。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    icon: { src: "/ext-openai.svg" },
    composer: { prompt: "Use the OpenAI Image Gen extension to " },
    setup: {
      instructions: "添加 OpenAI API 密钥，然后代理可以通过 CocodeAI 扩展操作生成图像产出物。",
      primaryCta: "启用图像生成",
      secondaryCta: "生成测试图像",
      requiredEnv: ["OPENAI_API_KEY"],
      testActionRef: "openwork.imageGen.testGenerate",
    },
    resources: [
      { type: "secret", id: "openai-api-key", envKey: "OPENAI_API_KEY", required: true },
      { type: "local-service", id: "openai-image-generation-service", label: "OpenAI image generation", required: true },
      { type: "tool", id: "openai-image-generate", label: "Image generation", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "openwork.imageGen.settings", location: "settings-detail" },
      { type: "test-action", ref: "openwork.imageGen.testGenerate", label: "Generate test image" },
      { type: "composer-prompt", prompt: "Use the OpenAI Image Gen extension to ", location: "composer" },
    ],
    enablement: [
      { type: "env-set", ref: "OPENAI_API_KEY", label: "OpenAI API key" },
    ],
    lifecycle: { reload: ["config"], detection: ["env:OPENAI_API_KEY"] },
  },
  {
    schemaVersion: 1,
    id: "openwork-voice",
    name: "语音模式",
    description: "通过实时语音面板与 CocodeAI 交流，该面板驱动与 CocodeAI UI MCP 相同的语义界面控件。",
    preview: true,
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    icon: { src: "/openwork-mark.svg" },
    composer: { prompt: "使用语音模式来 " },
    setup: {
      instructions: "语音模式使用 OpenAI Realtime。在 CocodeAI 环境变量中保存 OpenAI API 密钥，然后打开会话侧边面板，说话或发送输入的语音命令。",
      primaryCta: "保存 OpenAI 密钥",
      secondaryCta: "Test Realtime",
      requiredEnv: ["OPENAI_REALTIME_API_KEY", "OPENAI_API_KEY"],
      testActionRef: "openwork.voice.testRealtime",
    },
    resources: [
      { type: "secret", id: "openai-realtime-api-key", envKey: "OPENAI_REALTIME_API_KEY", required: false },
      { type: "secret", id: "openai-api-key", envKey: "OPENAI_API_KEY", required: true },
      { type: "local-service", id: "openwork-voice-realtime-session", label: "Realtime client-secret minting", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "openwork.voice.settings", location: "settings-detail" },
      { type: "session-side-panel", ref: "openwork.voice.panel", location: "session-right-pane" },
      { type: "session-rail-item", ref: "openwork.voice.rail", label: "Voice Mode", location: "session-rail" },
      { type: "server-route", ref: "POST /voice/realtime/session", location: "server" },
      { type: "control-actions", ref: "openwork.voice.controlActions" },
      { type: "test-action", ref: "openwork.voice.testRealtime", label: "Test Realtime" },
      { type: "composer-prompt", prompt: "Use Voice Mode to ", location: "composer" },
    ],
    enablement: [
      { type: "toggle-enabled", ref: "openwork-voice", label: "Enabled" },
      { type: "env-set", ref: "OPENAI_API_KEY", label: "OpenAI API key" },
    ],
    lifecycle: { reload: ["config"], detection: ["env:OPENAI_REALTIME_API_KEY", "env:OPENAI_API_KEY"] },
  },
  {
    schemaVersion: 1,
    id: "google-workspace",
    name: "Google 工作区",
    description: "让 CocodeAI 帮助处理会议、选定的 Drive 文件和 Gmail 草稿。",
    preview: true,
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    icon: { simpleIconSlug: "google" },
    composer: { prompt: "使用 Google 工作区来 " },
    setup: {
      instructions: "连接你的 Google 账号以在 CocodeAI 中使用日历、Drive 和 Gmail 草稿。",
      primaryCta: "连接 Google Workspace",
      secondaryCta: "测试连接",
      testActionRef: "openwork.googleWorkspace.testConnection",
    },
    resources: [
      { type: "provider", id: "google-oauth", label: "Google 账号", providerId: "google-workspace", required: true },
      { type: "local-service", id: "google-workspace-connector", label: "安全本地连接", required: true },
      { type: "tool", id: "google-calendar-read", label: "日历", required: true },
      { type: "tool", id: "google-gmail-drafts", label: "Gmail 草稿", required: true },
      { type: "tool", id: "google-drive-selected-files", label: "选定的 Drive 文件", required: true },
      { type: "tool", id: "google-gmail-read", label: "Gmail 读取（可选）", required: false },
      { type: "tool", id: "google-drive-full", label: "完整 Drive 访问（可选）", required: false },
      { type: "tool", id: "google-calendar-events", label: "日历事件（可选）", required: false },
      { type: "tool", id: "google-chat", label: "Google Chat（可选）", required: false },
    ],
    contributions: [
      { type: "settings-panel", ref: "openwork.googleWorkspace.settings", location: "settings-detail" },
      { type: "test-action", ref: "openwork.googleWorkspace.testConnection", label: "Test Google Workspace" },
      { type: "composer-prompt", prompt: "Use Google Workspace to ", location: "composer" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:google-workspace"] },
  },
  {
    schemaVersion: 1,
    id: "ollama",
    name: "Ollama",
    description: "本地模型提供商，地址 http://localhost:11434。",
    source: { format: "openwork-builtin", origin: "builtin", trusted: true },
    icon: { src: "/ext-ollama.svg" },
    composer: { prompt: "Use the Ollama extension to " },
    setup: {
      instructions: "Run Ollama locally, choose or pull a model, then add it as an OpenCode provider.",
      primaryCta: "Add Ollama model",
      secondaryCta: "Pull model",
    },
    resources: [
      { type: "local-service", id: "ollama-api", label: "Ollama API", description: "http://localhost:11434", required: true },
      { type: "provider", id: "ollama", providerId: "ollama", packageName: "@ai-sdk/openai-compatible", required: true },
    ],
    contributions: [
      { type: "settings-panel", ref: "openwork.ollama.settings", location: "settings-detail" },
      { type: "test-action", ref: "openwork.ollama.listModels", label: "Check local models" },
      { type: "composer-prompt", prompt: "Use the Ollama extension to ", location: "composer" },
    ],
    enablement: [
      { type: "provider-connected", ref: "ollama", label: "Ollama provider" },
    ],
    lifecycle: { reload: ["config"], detection: ["provider:ollama"] },
  },
];
