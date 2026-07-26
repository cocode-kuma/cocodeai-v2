/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, MessageCircleMore, Settings, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { usePlatform } from "../../../kernel/platform";
import { useDenAuth } from "../../cloud/den-auth-provider";
import { useControlAction, type OpenworkControlAction } from "../../../shell/control/control-provider";
import { useShellConfig } from "../../../shell/shell-config";
import type { OpenworkServerStatus } from "../../../../app/lib/openwork-server";
import { readDenSettings } from "../../../../app/lib/den";
import {
  openWorkConnectAttentionTitle,
  resolveOpenWorkConnectStatus,
  type OpenWorkConnectStatus,
} from "../../connections/openwork-connect-status";
import type { SessionCloudMcpMaintenanceState } from "../../connections/use-session-mcp-maintenance";
import {
  getOpenWorkModelsActionUrl,
  hasOpenWorkModelsProvider,
  hideOpenWorkModelsPromo,
  useOpenWorkModelsPromoEligibility,
  isOpenWorkModelsPromoHidden,
  markOpenWorkModelsPromoShown,
  OPENWORK_MODELS_PROMO_SHOW_DELAY_MS,
  OPENWORK_MODELS_PROMO_VISIBLE_MS,
  openWorkModelsPromoChangedEvent,
  shouldShowOpenWorkModelsPromo,
} from "../../cloud/openwork-models-promo";

const DOCS_URL = "";
const STATUS_BAR_BOOT_STARTED_AT = Date.now();
const STATUS_BAR_INITIALIZING_MS = 15_000;

type StatusDotVariant = "connected" | "loading" | "partial" | "disconnected";

type StatusDotProps = {
  variant: StatusDotVariant;
};

function StatusDot({ variant }: StatusDotProps) {
  return (
    <span className="relative flex size-2.5 shrink-0 items-center justify-center">
      {variant === "loading" ? (
        <span
          className="absolute inline-flex size-full animate-ping rounded-full bg-amber-9/35"
        />
      ) : null}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          variant === "connected" && "bg-green-9",
          variant === "loading" && "bg-amber-9",
          variant === "partial" && "bg-amber-9",
          variant === "disconnected" && "bg-red-9",
        )}
      />
    </span>
  );
}

function OpenWorkConnectIndicator(props: {
  status: OpenWorkConnectStatus;
  onRunDiagnostics: () => void;
}) {
  const content = (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <StatusDot
        variant={props.status.state === "ready"
          ? "connected"
          : props.status.state === "checking"
            ? "loading"
            : "disconnected"}
      />
      <span>CocodeAI Connect: {props.status.label}</span>
    </span>
  );

  if (props.status.state !== "needs_attention") {
    return (
      <Tooltip>
        <TooltipTrigger render={<span data-testid="openwork-connect-status" className="inline-flex" />}>{content}</TooltipTrigger>
        <TooltipContent>{props.status.description}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        render={(
          <button
            type="button"
            data-testid="openwork-connect-status"
            title={openWorkConnectAttentionTitle(props.status.description)}
            className="rounded-md px-1.5 py-1 transition-colors hover:bg-muted"
          />
        )}
      >
        {content}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 gap-3 rounded-xl">
        <PopoverHeader>
          <PopoverTitle>CocodeAI Connect 需要注意</PopoverTitle>
          <PopoverDescription>{props.status.description}</PopoverDescription>
        </PopoverHeader>
        <Button size="sm" onClick={props.onRunDiagnostics}>运行诊断</Button>
      </PopoverContent>
    </Popover>
  );
}

type StatusIndicatorProps = {
  clientConnected: boolean;
  openworkServerStatus: OpenworkServerStatus;
  developerMode: boolean;
  loading?: boolean;
  initializing: boolean;
  reloadBusy?: boolean;
  reloadError?: string | null;
};

function StatusIndicator(props: StatusIndicatorProps) {
  if (props.reloadBusy) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot variant="loading" />
        <span className="shrink-0 font-medium text-foreground text-xs">
          {t("status.reloading_config")}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {t("config.reload_now_desc")}
        </span>
      </div>
    );
  }

  if (props.reloadError) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot variant="disconnected" />
        <span className="shrink-0 font-medium text-foreground text-xs">
          {t("system.reload_failed")}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {props.reloadError}
        </span>
      </div>
    );
  }

  if (props.loading || (props.openworkServerStatus === "disconnected" && props.initializing)) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot variant="loading" />
        <span className="shrink-0 font-medium text-foreground text-xs">
          {t("session.preparing_workspace")}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {t("session.loading_detail")}
        </span>
      </div>
    );
  }

  if (props.clientConnected) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <StatusDot variant="connected" />
          </TooltipTrigger>
          <TooltipContent>{t("status.connected")}</TooltipContent>
        </Tooltip>
        <span className="truncate text-muted-foreground text-xs">
          {t("status.ready_for_tasks")}
        </span>
        {props.developerMode ? (
          <span className="truncate text-muted-foreground text-xs">
            {t("status.developer_mode")}
          </span>
        ) : null}
      </div>
    );
  }

  if (props.openworkServerStatus === "limited") {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot variant="partial" />
        <span className="shrink-0 font-medium text-foreground text-xs">
          {t("status.limited_mode")}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {t("status.limited_hint")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <StatusDot variant="disconnected" />
      <span className="shrink-0 font-medium text-foreground text-xs">
        {t("status.disconnected_label")}
      </span>
      <span className="truncate text-muted-foreground text-xs">
        {t("status.disconnected_hint")}
      </span>
    </div>
  );
}

export type StatusBarProps = {
  clientConnected: boolean;
  openworkServerStatus: OpenworkServerStatus;
  developerMode: boolean;
  settingsOpen: boolean;
  onSendFeedback: () => void;
  onOpenSettings: () => void;
  providerConnectedIds: string[];
  mcpConnectedCount: number;
  loading?: boolean;
  showSettingsButton?: boolean;
  initializing?: boolean;
  reloadBusy?: boolean;
  reloadError?: string | null;
  openWorkConnectState?: SessionCloudMcpMaintenanceState;
};

export function StatusBar(props: StatusBarProps) {
  const platform = usePlatform();
  const denAuth = useDenAuth();
  const navigate = useNavigate();
  const { config: shellConfig } = useShellConfig();
  const docsButtonRef = useRef<HTMLButtonElement>(null);
  const feedbackButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [cocodeaiModelsHintVisible, setCocodeaiModelsHintVisible] = useState(false);
  const cocodeaiModelsPromoEligible = useOpenWorkModelsPromoEligibility();
  const hasCocodeaiModels = useMemo(
    () => hasOpenWorkModelsProvider(props.providerConnectedIds),
    [props.providerConnectedIds],
  );
  const [initializing, setInitializing] = useState(
    () => Date.now() - STATUS_BAR_BOOT_STARTED_AT < STATUS_BAR_INITIALIZING_MS,
  );
  const openWorkConnectStatus = resolveOpenWorkConnectStatus(
    denAuth.isSignedIn
      || (denAuth.status === "checking" && Boolean(readDenSettings().authToken?.trim())),
    props.openWorkConnectState,
  );

  useEffect(() => {
    if (!initializing) return;
    const remaining = Math.max(
      0,
      STATUS_BAR_INITIALIZING_MS - (Date.now() - STATUS_BAR_BOOT_STARTED_AT),
    );
    const timeout = window.setTimeout(() => setInitializing(false), remaining);
    return () => window.clearTimeout(timeout);
  }, [initializing]);

  useEffect(() => {
    const handlePromoChanged = () => {
      if (isOpenWorkModelsPromoHidden()) {
        setCocodeaiModelsHintVisible(false);
      }
    };
    window.addEventListener(openWorkModelsPromoChangedEvent, handlePromoChanged);
    return () => window.removeEventListener(openWorkModelsPromoChangedEvent, handlePromoChanged);
  }, []);

  useEffect(() => {
    if (!cocodeaiModelsPromoEligible || !shellConfig.cloudSignin || hasCocodeaiModels) {
      setCocodeaiModelsHintVisible(false);
      return;
    }
    if (denAuth.status === "checking") return;

    let showTimeout: number | null = null;
    const maybeShow = () => {
      if (showTimeout !== null || !shouldShowOpenWorkModelsPromo()) return;
      showTimeout = window.setTimeout(() => {
        showTimeout = null;
        if (!shouldShowOpenWorkModelsPromo()) return;
        markOpenWorkModelsPromoShown();
        setCocodeaiModelsHintVisible(true);
      }, OPENWORK_MODELS_PROMO_SHOW_DELAY_MS);
    };

    maybeShow();
    const interval = window.setInterval(maybeShow, 60_000);
    return () => {
      if (showTimeout !== null) {
        window.clearTimeout(showTimeout);
      }
      window.clearInterval(interval);
    };
  }, [denAuth.status, hasCocodeaiModels, cocodeaiModelsPromoEligible, shellConfig.cloudSignin]);

  useEffect(() => {
    if (!cocodeaiModelsHintVisible) return;
    const timeout = window.setTimeout(
      () => setCocodeaiModelsHintVisible(false),
      OPENWORK_MODELS_PROMO_VISIBLE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [cocodeaiModelsHintVisible]);

  const openOpenWorkModels = useCallback(() => {
    setCocodeaiModelsHintVisible(false);
    if (!denAuth.isSignedIn) {
      navigate("/settings/cloud-account");
    }
    platform.openLink(getOpenWorkModelsActionUrl(denAuth.isSignedIn));
  }, [denAuth.isSignedIn, navigate, platform]);

  const hideOpenWorkModels = useCallback(() => {
    setCocodeaiModelsHintVisible(false);
    hideOpenWorkModelsPromo();
  }, []);

  const docsControlAction = useMemo<OpenworkControlAction>(() => ({
    id: "status.docs.open",
    label: "打开 CocodeAI 文档",
    description: "从状态栏打开文档。",
    sideEffect: "external",
    targetRef: docsButtonRef,
    execute: () => platform.openLink(DOCS_URL),
  }), [platform]);
  useControlAction(docsControlAction);

  const feedbackControlAction = useMemo<OpenworkControlAction>(() => ({
    id: "status.feedback.open",
    label: "发送反馈",
    description: "从状态栏打开 CocodeAI 反馈界面。",
    sideEffect: "external",
    targetRef: feedbackButtonRef,
    execute: props.onSendFeedback,
  }), [props.onSendFeedback]);
  useControlAction(feedbackControlAction);

  const settingsControlAction = useMemo<OpenworkControlAction>(() => ({
    id: "status.settings.open",
    label: props.settingsOpen ? "从设置返回" : "从状态栏打开设置",
    description: "使用状态栏中可见的设置按钮。",
    sideEffect: "navigation",
    disabled: props.showSettingsButton === false,
    targetRef: settingsButtonRef,
    execute: props.onOpenSettings,
  }), [props.onOpenSettings, props.settingsOpen, props.showSettingsButton]);
  useControlAction(settingsControlAction);

  return (
    <div className="border-t border-border bg-background windows:bg-dls-surface">
      <div className="flex h-8 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <StatusIndicator
            clientConnected={props.clientConnected}
            openworkServerStatus={props.openworkServerStatus}
            developerMode={props.developerMode}
            loading={props.loading}
            initializing={initializing}
            reloadBusy={props.reloadBusy}
            reloadError={props.reloadError}
          />
          {/* CocodeAI: MCP/Connect 功能已隐藏 */}
          {/* openWorkConnectStatus 相关代码保留但渲染为空 */}
        </div>

        <div className="flex items-center gap-1">
          {/* CocodeAI: 隐藏 OpenWork Models 推广 */}
          {/* cocodeaiModelsHintVisible 相关代码保留但渲染为空 */}
          {shellConfig.docsButton ? (
            <Button
              ref={docsButtonRef}
              className="text-muted-foreground gap-2"
              variant="ghost"
              size="xs"
              onClick={() => platform.openLink(DOCS_URL)}
              title={t("status.open_docs")}
              aria-label={t("status.open_docs")}
            >
              <BookOpen className="size-3.5" />
              <span>{t("status.docs")}</span>
            </Button>
          ) : null}
          {shellConfig.feedbackButton ? (
            <Button
              ref={feedbackButtonRef}
              className="text-muted-foreground gap-2"
              variant="ghost"
              size="xs"
              onClick={props.onSendFeedback}
              title={t("status.send_feedback")}
              aria-label={t("status.send_feedback")}
            >
              <MessageCircleMore className="size-3.5" />
              <span>
                {t("status.feedback")}
              </span>
            </Button>
          ) : null}
          {props.showSettingsButton !== false ? (
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    ref={settingsButtonRef}
                    className="text-muted-foreground gap-2"
                    variant="ghost"
                    size="icon-xs"
                    onClick={props.onOpenSettings}
                    aria-label={props.settingsOpen ? t("status.back") : t("status.settings")}
                  >
                    <Settings className="size-3.5" />
                  </Button>
                )}
              />
              <TooltipContent>{t("status.settings")}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </div>
  );
}
