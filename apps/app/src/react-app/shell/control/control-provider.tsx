/** @jsxImportSource react */
import {
  createContext,
  useCallback,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type OpenworkControlSideEffect = "none" | "navigation" | "mutation" | "external";

export type OpenworkControlActionArg = {
  name: string;
  type?: "string" | "number" | "boolean" | "object" | "array" | "unknown";
  required?: boolean;
  description?: string;
};

export type OpenworkControlActionMetadata = {
  id: string;
  label: string;
  description?: string;
  sideEffect: OpenworkControlSideEffect;
  requiresConfirmation: boolean;
  requiresArgs: boolean;
  hasPreviewArgs: boolean;
  previewArgs?: unknown;
  args?: OpenworkControlActionArg[];
  disabled: boolean;
  busy: boolean;
};

export type OpenworkControlSnapshot = {
  version: number;
  enabled: boolean;
  route: string;
  status: "off" | "ready" | "acting";
  busyActionId: string | null;
  narration: string;
  actions: OpenworkControlActionMetadata[];
};

export type OpenworkControlResult =
  | { ok: true; actionId: string; result?: unknown }
  | { ok: false; actionId: string; error: string };

export type OpenworkControlHelpers = {
  setNarration: (text: string) => void;
};

export type OpenworkControlTargetRef = {
  readonly current: HTMLElement | null;
};

export type OpenworkControlAction = {
  id: string;
  label: string;
  description?: string;
  sideEffect?: OpenworkControlSideEffect;
  requiresConfirmation?: boolean;
  requiresArgs?: boolean;
  args?: OpenworkControlActionArg[];
  previewArgs?: unknown;
  disabled?: boolean;
  targetRef?: OpenworkControlTargetRef;
  execute: (args: unknown, helpers: OpenworkControlHelpers) => unknown | Promise<unknown>;
};

type ControlActionRef = {
  readonly current: OpenworkControlAction | null;
};

type RegisteredAction = {
  id: string;
  order: number;
  token: symbol;
  ref: ControlActionRef;
};

type SpotlightState = {
  visible: boolean;
  phase: "target" | "press";
  rect: { x: number; y: number; width: number; height: number } | null;
};

type OpenworkControlContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  route: string;
  narration: string;
  busyActionId: string | null;
  actions: OpenworkControlActionMetadata[];
  registerAction: (actionId: string, actionRef: ControlActionRef) => () => void;
  executeAction: (actionId: string, args?: unknown) => Promise<OpenworkControlResult>;
  snapshot: () => OpenworkControlSnapshot;
};

type OpenworkControlAPI = {
  version: number;
  snapshot: () => OpenworkControlSnapshot;
  listActions: () => OpenworkControlActionMetadata[];
  execute: (actionId: string, args?: unknown) => Promise<OpenworkControlResult>;
  setEnabled: (enabled: boolean) => void;
  subscribe: (listener: (snapshot: OpenworkControlSnapshot) => void) => () => void;
};

declare global {
  interface Window {
    __openworkControl?: OpenworkControlAPI;
  }
}

const CONTROL_API_VERSION = 1;
const OpenworkControlContext = createContext<OpenworkControlContextValue | null>(null);
const SPOTLIGHT_TIMING_MS = Object.freeze({
  missingTarget: 80,
  scrollIntoView: 180,
  target: 260,
  press: 130,
  release: 80,
  done: 280,
});

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

function returnedActionError(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const payload = result as { ok?: unknown; error?: unknown };
  if (payload.ok !== false) return null;
  return typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : "Action returned an error.";
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function metadataForAction(registered: RegisteredAction, busyActionId: string | null): OpenworkControlActionMetadata {
  const action = registered.ref.current;
  return {
    id: registered.id,
    label: action?.label ?? registered.id,
    description: action?.description,
    sideEffect: action?.sideEffect ?? "none",
    requiresConfirmation: action?.requiresConfirmation === true,
    requiresArgs: action?.requiresArgs === true,
    hasPreviewArgs: action?.previewArgs !== undefined,
    previewArgs: action?.previewArgs,
    args: action?.args,
    disabled: action?.disabled === true,
    busy: busyActionId === registered.id,
  };
}

function ControlModeSpotlight({ spotlight }: { spotlight: SpotlightState }) {
  const rect = spotlight.rect;
  if (!spotlight.visible || !rect) return null;

  const pad = spotlight.phase === "press" ? 8 : 12;
  return (
    <div
      className="pointer-events-none fixed z-[9998] rounded-[18px] bg-[rgba(var(--dls-accent-rgb),0.1)] shadow-[0_0_0_9999px_rgba(7,10,18,0.08),0_0_36px_rgba(var(--dls-accent-rgb),0.32),inset_0_0_0_1px_rgba(var(--dls-accent-rgb),0.24)] transition-all duration-200 ease-out"
      style={{
        left: `${rect.x - pad}px`,
        top: `${rect.y - pad}px`,
        width: `${rect.width + pad * 2}px`,
        height: `${rect.height + pad * 2}px`,
        transform: spotlight.phase === "press" ? "scale(0.985)" : "scale(1)",
      }}
    />
  );
}

export function OpenworkControlProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const actionsRef = useRef(new Map<string, RegisteredAction>());
  const listenersRef = useRef(new Set<(snapshot: OpenworkControlSnapshot) => void>());
  const nextOrderRef = useRef(1);
  const [version, setVersion] = useState(0);
  const [enabledState, setEnabledState] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [narration, setNarration] = useState("Control mode is off.");
  const [spotlight, setSpotlight] = useState<SpotlightState>({ visible: false, phase: "target", rect: null });
  const busyActionIdRef = useRef<string | null>(null);
  const spotlightRunRef = useRef(0);

  const route = `${location.pathname}${location.search}${location.hash}`;
  const enabled = enabledState;
  const status: OpenworkControlSnapshot["status"] = !enabled ? "off" : busyActionId ? "acting" : "ready";

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
  }, []);

  const listActionMetadata = useCallback((nextBusyActionId = busyActionId) => {
    return Array.from(actionsRef.current.values())
      .sort((left, right) => left.order - right.order)
      .map((action) => metadataForAction(action, nextBusyActionId));
  }, [busyActionId, version]);

  const actions = useMemo(() => {
    return listActionMetadata();
  }, [listActionMetadata]);

  const snapshot = useCallback((): OpenworkControlSnapshot => ({
    version: CONTROL_API_VERSION,
    enabled,
    route,
    status,
    busyActionId,
    narration,
    actions: listActionMetadata(),
  }), [busyActionId, enabled, listActionMetadata, narration, route, status]);

  const registerAction = useCallback((actionId: string, actionRef: ControlActionRef) => {
    const token = Symbol(actionId);
    const previous = actionsRef.current.get(actionId);
    actionsRef.current.set(actionId, {
      id: actionId,
      order: previous?.order ?? nextOrderRef.current++,
      token,
      ref: actionRef,
    });
    setVersion((current) => current + 1);

    return () => {
      const current = actionsRef.current.get(actionId);
      if (current?.token === token) {
        actionsRef.current.delete(actionId);
        setVersion((value) => value + 1);
      }
    };
  }, []);

  const playTargetChoreography = useCallback(async (action: OpenworkControlAction, runId: number) => {
    if (!isBrowser()) return;
    const stillCurrent = () => spotlightRunRef.current === runId;
    const target = action.targetRef?.current;
    if (!target) {
      await wait(SPOTLIGHT_TIMING_MS.missingTarget);
      return;
    }

    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    await wait(SPOTLIGHT_TIMING_MS.scrollIntoView);
    if (!stillCurrent() || !target.isConnected) return;
    const rect = target.getBoundingClientRect();
    setSpotlight({
      visible: true,
      phase: "target",
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
    });
    await wait(SPOTLIGHT_TIMING_MS.target);
    if (!stillCurrent()) return;
    setSpotlight((current) => ({ ...current, phase: "press" }));
    await wait(SPOTLIGHT_TIMING_MS.press);
    if (!stillCurrent()) return;
    setSpotlight((current) => ({ ...current, phase: "target" }));
    await wait(SPOTLIGHT_TIMING_MS.release);
  }, []);

  const executeAction = useCallback(async (actionId: string, args?: unknown): Promise<OpenworkControlResult> => {
    const registered = actionsRef.current.get(actionId);
    const action = registered?.ref.current;
    if (!registered || !action) return { ok: false, actionId, error: `Unknown action: ${actionId}` };
    if (action.disabled) return { ok: false, actionId, error: `Action is disabled: ${action.label}` };
    if (busyActionIdRef.current) return { ok: false, actionId, error: `Already acting: ${busyActionIdRef.current}` };

    if (action.requiresConfirmation && isBrowser()) {
      const confirmed = window.confirm(`Allow Control Mode to ${action.label}?`);
      if (!confirmed) return { ok: false, actionId, error: "User cancelled action." };
    }

    const runId = spotlightRunRef.current + 1;
    spotlightRunRef.current = runId;
    busyActionIdRef.current = action.id;
    setEnabled(true);
    setBusyActionId(action.id);
    setNarration(`Moving to ${action.label}…`);

    try {
      await playTargetChoreography(action, runId);
      setNarration(`Running ${action.label}…`);
      const effectiveArgs = args === undefined ? action.previewArgs : args;
      const result = await action.execute(effectiveArgs, { setNarration });
      const resultError = returnedActionError(result);
      if (resultError) {
        setNarration(`Could not ${action.label}: ${resultError}`);
        if (spotlightRunRef.current === runId) {
          setSpotlight({ visible: false, phase: "target", rect: null });
        }
        return { ok: false, actionId, error: resultError };
      }
      setNarration(`Done: ${action.label}`);
      await wait(SPOTLIGHT_TIMING_MS.done);
      if (spotlightRunRef.current === runId) {
        setSpotlight({ visible: false, phase: "target", rect: null });
      }
      return { ok: true, actionId, result };
    } catch (error) {
      const message = describeError(error);
      setNarration(`Could not ${action.label}: ${message}`);
      if (spotlightRunRef.current === runId) {
        setSpotlight({ visible: false, phase: "target", rect: null });
      }
      return { ok: false, actionId, error: message };
    } finally {
      if (busyActionIdRef.current === action.id) busyActionIdRef.current = null;
      setBusyActionId(null);
    }
  }, [playTargetChoreography, setEnabled]);

  const value = useMemo<OpenworkControlContextValue>(() => ({
    enabled,
    setEnabled,
    route,
    narration,
    busyActionId,
    actions,
    registerAction,
    executeAction,
    snapshot,
  }), [actions, busyActionId, enabled, executeAction, narration, registerAction, route, setEnabled, snapshot]);

  useEffect(() => {
    if (!enabled) {
      setNarration("Control mode is off.");
    } else if (narration === "Control mode is off.") {
      setNarration("Ready. A controller can inspect and run visible actions.");
    }
  }, [enabled, narration]);

  useEffect(() => {
    if (!isBrowser()) return;

    const api: OpenworkControlAPI = {
      version: CONTROL_API_VERSION,
      snapshot,
      listActions: () => snapshot().actions,
      execute: executeAction,
      setEnabled,
      subscribe(listener) {
        listenersRef.current.add(listener);
        listener(snapshot());
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    };

    window.__openworkControl = api;
    return () => {
      if (window.__openworkControl === api) {
        delete window.__openworkControl;
      }
    };
  }, [executeAction, setEnabled, snapshot]);

  useEffect(() => {
    busyActionIdRef.current = busyActionId;
  }, [busyActionId]);

  useEffect(() => {
    const next = snapshot();
    listenersRef.current.forEach((listener) => listener(next));
  }, [snapshot, version]);

  return (
    <OpenworkControlContext.Provider value={value}>
      {children}
      <ControlModeSpotlight spotlight={spotlight} />
    </OpenworkControlContext.Provider>
  );
}

export function useOpenworkControl() {
  return use(OpenworkControlContext);
}

export function useControlAction(action: OpenworkControlAction | null | false | undefined) {
  const control = useOpenworkControl();
  const registerAction = control?.registerAction;
  const latestActionRef = useRef<OpenworkControlAction | null>(action || null);
  latestActionRef.current = action || null;
  const actionId = action ? action.id : null;

  useEffect(() => {
    if (!registerAction || !actionId) return undefined;
    return registerAction(actionId, latestActionRef);
  }, [actionId, registerAction]);
}

/**
 * Register a dynamic list of control actions. Unlike calling useControlAction
 * per item, this scales to an arbitrary, changing number of actions without
 * violating the rules of hooks. Each action is tracked by its stable id; the
 * latest closure for that id is always used, and removed ids are unregistered.
 */
export function useControlActions(actions: readonly OpenworkControlAction[]) {
  const control = useOpenworkControl();
  const registerAction = control?.registerAction;

  // One ref per action id, so executeAction always sees the freshest closure.
  const refsById = useRef<Map<string, { current: OpenworkControlAction | null }>>(new Map());
  for (const action of actions) {
    const existing = refsById.current.get(action.id);
    if (existing) {
      existing.current = action;
    } else {
      refsById.current.set(action.id, { current: action });
    }
  }

  const ids = actions.map((action) => action.id).join("\u0000");

  useEffect(() => {
    if (!registerAction) return undefined;
    const liveIds = new Set(actions.map((action) => action.id));
    // Drop refs for ids that no longer exist.
    for (const id of Array.from(refsById.current.keys())) {
      if (!liveIds.has(id)) refsById.current.delete(id);
    }
    const cleanups = actions.map((action) => {
      const ref = refsById.current.get(action.id);
      return ref ? registerAction(action.id, ref) : undefined;
    });
    return () => {
      for (const cleanup of cleanups) cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerAction, ids]);
}

import { SETTINGS_TAB_VALUES } from "../../../app/types";

const SETTINGS_TABS: ReadonlySet<string> = new Set<string>(SETTINGS_TAB_VALUES);

export function OpenworkRouteControlActions() {
  const navigate = useNavigate();

  const actions = useMemo<OpenworkControlAction[]>(() => [
    {
      id: "route.session",
      label: "打开会话",
      description: "导航到主会话视图。",
      sideEffect: "navigation",
      execute: () => navigate("/session"),
    },
    {
      id: "route.settings.general",
      label: "打开通用设置",
      description: "导航到通用设置。",
      sideEffect: "navigation",
      execute: () => navigate("/settings/general"),
    },
    {
      id: "route.settings.skills",
      label: "打开技能设置",
      description: "导航到技能设置。",
      sideEffect: "navigation",
      execute: () => navigate("/settings/skills"),
    },
    {
      id: "route.settings.providers",
      label: "打开提供商设置",
      description: "导航到 AI 提供商设置。",
      sideEffect: "navigation",
      execute: () => navigate("/settings/ai"),
    },
    {
      id: "route.settings.authorized_folders",
      label: "打开授权文件夹设置",
      description: "导航到授权文件夹和文件访问设置。",
      sideEffect: "navigation",
      execute: () => navigate("/settings/permissions"),
    },
    {
      id: "route.settings.appearance",
      label: "打开外观设置",
      description: "导航到外观设置。",
      sideEffect: "navigation",
      execute: () => navigate("/settings/appearance"),
    },
    {
      id: "settings.panel.open",
      label: "打开设置面板",
      description: "通过标签页 ID 导航到特定设置面板。",
      sideEffect: "navigation",
      requiresArgs: true,
      args: [
        {
          name: "panel",
          type: "string",
          required: true,
          description:
            "Settings tab: general | ai | preferences | permissions | shell | extensions | skills | environment | advanced | appearance | updates | recovery | debug | cloud-account | cloud-providers | cloud-marketplaces",
        },
      ],
      previewArgs: { panel: "ai" },
      execute: (args) => {
        const requested = (args as { panel?: unknown } | undefined)?.panel;
        const panel = typeof requested === "string" ? requested.trim() : "";
        if (!SETTINGS_TABS.has(panel)) {
          return {
            ok: false,
            error: `Unknown settings panel: ${panel || "(empty)"}. Expected one of ${Array.from(SETTINGS_TABS).join(", ")}.`,
          };
        }
        navigate(`/settings/${panel}`);
        return { ok: true, panel };
      },
    },
    {
      id: "route.back",
      label: "返回",
      description: "在历史记录中向后导航一个条目。",
      sideEffect: "navigation",
      execute: () => navigate(-1),
    },
    {
      id: "route.forward",
      label: "前进",
      description: "在历史记录中向前导航一个条目。",
      sideEffect: "navigation",
      execute: () => navigate(1),
    },
    {
      id: "help.capabilities",
      label: "CocodeAI 能做什么？",
      description: "列出 CocodeAI 的主要功能。",
      sideEffect: "none",
      execute: () => ({
        capabilities: [
          { id: "browse", label: "浏览网页", description: "控制浏览器导航、抓取和自动化网页任务。" },
          { id: "providers", label: "AI 模型提供商", description: "连接 Anthropic、OpenAI、Google、OpenRouter、Ollama 或其他 LLM 提供商。" },
          { id: "extensions", label: "MCP 扩展", description: "为 Google Workspace、GitHub、数据库等添加 MCP 服务器。" },
          { id: "voice", label: "语音模式", description: "通过 OpenAI Realtime 与 CocodeAI 进行实时语音交流。" },
          { id: "files", label: "文件管理", description: "在工作区中读取、写入和组织文件。" },
          { id: "code", label: "编写和运行代码", description: "通过完整的工具访问生成、编辑和执行代码。" },
          { id: "computer-use", label: "计算机使用", description: "通过截图和鼠标/键盘操作控制你的计算机。" },
          { id: "skills", label: "技能", description: "安装针对特定工作流的专业技能包。" },
          { id: "automations", label: "自动化", description: "安排定期运行的后台任务和代理。" },
          { id: "sharing", label: "分享会话", description: "通过 CocodeAI Cloud 与合作者分享工作区会话。" },
        ],
        hint: "使用 settings.panel.open 配置以上任意功能。例如：settings.panel.open({panel:'ai'}) 用于提供商，settings.panel.open({panel:'extensions'}) 用于 MCP。",
      }),
    },
  ], [navigate]);

  useControlActions(actions);
  return null;
}
