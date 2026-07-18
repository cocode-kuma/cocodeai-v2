/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, FileText, Loader2, MailPlus, ShieldCheck, XCircle } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { GoogleWorkspaceAuthStatus, OpenworkServerClient } from "../../../app/lib/openwork-server";
import { usePlatform } from "../../kernel/platform";
import type { ExtensionConfigContext } from "./extension-registry";
import { registerExtensionRuntime } from "./extension-registry";

type BusyAction = "status" | "connect" | "disconnect" | "set-active" | "test" | "smoke-test" | "save-secret";
type OptionalFeature = "gmailRead" | "driveFull" | "calendarWrite" | "chat";

const OPTIONAL_FEATURES: { id: OptionalFeature; label: string; description: string }[] = [
  { id: "gmailRead", label: "读取 Gmail", description: "读取您的 Gmail 邮件和会话。" },
  { id: "driveFull", label: "完整 Google Drive 访问", description: "搜索、读取和编辑您 Drive 中的所有文件，而不仅限于通过 CocodeAI 创建的文件。" },
  { id: "calendarWrite", label: "创建日历事件", description: "在您的 Google 日历上创建事件。" },
  { id: "chat", label: "Google Chat", description: "列出空间、阅读消息并在 Google Chat 中发送消息。" },
];
type GoogleWorkspaceCommand = () => Promise<unknown>;
const DESKTOP_ACTION_TIMEOUT_MS = 6 * 60 * 1000;
const CONNECT_POLL_INTERVAL_MS = 1_000;
// Must match GOOGLE_WORKSPACE_DESKTOP_CLIENT_ID in apps/server/src/extensions/google-workspace.ts.
const OPENWORK_BUILTIN_GOOGLE_CLIENT_ID = "929071212606-pmkqimjhm2tnp68kbklnout0irllj99h.apps.googleusercontent.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeGoogleWorkspaceAccount(value: unknown): GoogleWorkspaceAuthStatus["account"] {
  if (!isRecord(value)) return null;
  return {
    accountId: typeof value.accountId === "string" ? value.accountId : null,
    email: typeof value.email === "string" ? value.email : null,
    name: typeof value.name === "string" ? value.name : null,
    picture: typeof value.picture === "string" ? value.picture : null,
    sub: typeof value.sub === "string" ? value.sub : null,
    scopes: normalizeStringList(value.scopes),
    connectedAt: typeof value.connectedAt === "string" ? value.connectedAt : null,
  };
}

function normalizeGoogleWorkspaceAccounts(value: unknown): GoogleWorkspaceAuthStatus["accounts"] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeGoogleWorkspaceAccount).filter((item): item is NonNullable<GoogleWorkspaceAuthStatus["account"]> => item !== null);
}

function normalizeGoogleWorkspaceSmokeTest(value: unknown): GoogleWorkspaceAuthStatus["smokeTest"] {
  if (!isRecord(value)) return null;
  return {
    driveFileId: typeof value.driveFileId === "string" ? value.driveFileId : null,
    driveFileName: typeof value.driveFileName === "string" ? value.driveFileName : null,
    gmailDraftId: typeof value.gmailDraftId === "string" ? value.gmailDraftId : null,
  };
}

function normalizeGoogleWorkspaceAuthStatus(value: unknown): GoogleWorkspaceAuthStatus {
  const record = isRecord(value) ? value : {};
  const vault = record.vault === "encrypted" || record.vault === "plaintext-dev" ? record.vault : "unavailable";
  return {
    configured: record.configured === true,
    missing: normalizeStringList(record.missing),
    customClient: record.customClient === true,
    vault,
    connected: record.connected === true,
    account: normalizeGoogleWorkspaceAccount(record.account),
    accounts: normalizeGoogleWorkspaceAccounts(record.accounts),
    activeAccountId: typeof record.activeAccountId === "string" ? record.activeAccountId : null,
    scopes: normalizeStringList(record.scopes),
    connectedAt: typeof record.connectedAt === "string" ? record.connectedAt : null,
    error: typeof record.error === "string" ? record.error : null,
    testStatus: typeof record.testStatus === "string" ? record.testStatus : null,
    smokeTest: normalizeGoogleWorkspaceSmokeTest(record.smokeTest),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForGoogleWorkspaceConnection(client: OpenworkServerClient, flowId: string, expiresAt: number) {
  while (Date.now() < expiresAt + 5_000) {
    const result = await client.googleWorkspaceConnectStatus(flowId);
    if (result.status === "connected" && result.googleWorkspace) return result.googleWorkspace;
    if (result.status === "failed" || result.status === "expired") {
      throw new Error(result.error ?? "Google Workspace connection did not complete.");
    }
    await sleep(CONNECT_POLL_INTERVAL_MS);
  }
  throw new Error("Google Workspace OAuth timed out.");
}

function GoogleWorkspaceConfig({ openworkServerClient, hostOpenworkServerClient, onExtensionConnectionChange, restartLocalServer }: ExtensionConfigContext) {
  const platform = usePlatform();
  const [status, setStatus] = useState<GoogleWorkspaceAuthStatus | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState("");
  const [customClientId, setCustomClientId] = useState("");
  const [customClientSecret, setCustomClientSecret] = useState("");
  const [optionalFeatures, setOptionalFeatures] = useState<Record<OptionalFeature, boolean>>({ gmailRead: false, driveFull: false, calendarWrite: false, chat: false });
  const serverAvailable = Boolean(openworkServerClient);
  const hostServerAvailable = Boolean(hostOpenworkServerClient);
  const canConnect = serverAvailable && status?.configured === true && status.vault !== "unavailable";
  const canTest = serverAvailable && status?.connected === true;

  const loadStatus = async (options: { clearError?: boolean } = {}) => {
    if (!openworkServerClient) return;
    setBusyAction("status");
    if (options.clearError !== false) setError(null);
    try {
      const result = normalizeGoogleWorkspaceAuthStatus(await openworkServerClient.googleWorkspaceStatus());
      setStatus(result);
      onExtensionConnectionChange?.("google-workspace", result.connected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取 Google Workspace 状态失败。");
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [openworkServerClient]);

  const runDesktopAction = async (action: Exclude<BusyAction, "status">, command: GoogleWorkspaceCommand) => {
    if (!openworkServerClient) return;
    setBusyAction(action);
    setError(null);
    try {
      const result = await Promise.race([
        command(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Google Workspace connection is taking too long. Try again, or restart CocodeAI if the browser already said authorization was received.")), DESKTOP_ACTION_TIMEOUT_MS);
        }),
      ]);
      const next = normalizeGoogleWorkspaceAuthStatus(result);
      setStatus(next);
      onExtensionConnectionChange?.("google-workspace", next.connected);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Google Workspace ${action} failed.`);
      await loadStatus({ clearError: false });
    } finally {
      setBusyAction(null);
    }
  };

  const connectGoogleWorkspace = async () => {
    if (!openworkServerClient) return null;
    const features = status?.customClient === true ? OPTIONAL_FEATURES.filter((feature) => optionalFeatures[feature.id]).map((feature) => feature.id) : [];
    const flow = await openworkServerClient.googleWorkspaceConnectStart({ features });
    platform.openLink(flow.authUrl);
    return waitForGoogleWorkspaceConnection(openworkServerClient, flow.flowId, flow.expiresAt);
  };

  const saveOauthEnv = async (entries: { key: string; value: string }[], onSaved: () => void) => {
    if (!hostOpenworkServerClient) {
      setError("Google OAuth settings can only be saved from the local desktop app.");
      return;
    }
    setBusyAction("save-secret");
    setError(null);
    try {
      await hostOpenworkServerClient.upsertUserEnv(entries);
      await hostOpenworkServerClient.setUserEnvPendingChanges(true);
      onSaved();
      if (restartLocalServer) {
        const restarted = await restartLocalServer();
        if (!restarted) setError("Saved Google OAuth settings. Restart CocodeAI to apply them.");
      } else {
        setError("Saved Google OAuth settings. Restart CocodeAI to apply them.");
      }
      await loadStatus({ clearError: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存 Google OAuth 设置失败。");
    } finally {
      setBusyAction(null);
    }
  };

  const saveGoogleClientSecret = async () => {
    const value = clientSecret.trim();
    if (!value) {
      setError("请输入你的 Google OAuth 桌面客户端的客户端密钥。");
      return;
    }
    await saveOauthEnv([{ key: "GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET", value }], () => setClientSecret(""));
  };

  const saveCustomOauthClient = async () => {
    const id = customClientId.trim();
    const secret = customClientSecret.trim();
    if (!id || !secret) {
      setError("请同时输入你自己的 Google OAuth 桌面客户端的客户端 ID 和客户端密钥。");
      return;
    }
    if (id === OPENWORK_BUILTIN_GOOGLE_CLIENT_ID) {
      setError("这是内置的 CocodeAI 客户端 ID，无法解锁 Gmail 读取权限。请在 Google Cloud Console（API 和服务 > 凭据 > 创建 OAuth 客户端 ID > 桌面应用）中创建你自己的 OAuth 客户端，并将其客户端 ID 粘贴到此处。");
      return;
    }
    await saveOauthEnv(
      [
        { key: "GOOGLE_WORKSPACE_OAUTH_CLIENT_ID", value: id },
        { key: "GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET", value: secret },
      ],
      () => {
        setCustomClientId("");
        setCustomClientSecret("");
      },
    );
  };

  const connectedAccounts = status?.accounts.length ? status.accounts : status?.account ? [status.account] : [];

  return (
    <div className="space-y-4">
      {!serverAvailable ? (
        <Alert variant="warning">
          <ShieldCheck />
          <AlertTitle>需要 CocodeAI 服务器</AlertTitle>
          <AlertDescription>启动 CocodeAI 服务器以连接 Google Workspace。</AlertDescription>
        </Alert>
      ) : null}

      {status?.connected ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>已连接到 Google Workspace</AlertTitle>
          <AlertDescription>
            {connectedAccounts.length === 1 && connectedAccounts[0]?.email ? `已登录为 ${connectedAccounts[0].email}。` : `已连接 ${connectedAccounts.length} 个 Google 账号。`}
            {status.testStatus ? ` ${status.testStatus}` : ""}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="warning">
          <ShieldCheck />
          <AlertTitle>连接 Google Workspace</AlertTitle>
          <AlertDescription>
            让 CocodeAI 在你需要时使用日历、选定的 Drive 文件和 Gmail 草稿。
          </AlertDescription>
        </Alert>
      )}

      {status && !status.configured ? (
        <Alert variant="warning">
          <XCircle />
          <AlertTitle>Google OAuth 客户端未配置</AlertTitle>
          <AlertDescription>添加你的 Google OAuth 桌面客户端密钥以连接 Google Workspace。</AlertDescription>
        </Alert>
      ) : null}

      {status && !status.configured ? (
        <Card variant="outline" size="sm">
          <CardHeader>
            <CardTitle>设置 Google OAuth</CardTitle>
            <CardDescription>
              使用 Google Cloud OAuth 桌面客户端。CocodeAI 已包含桌面客户端 ID；请将匹配的客户端密钥粘贴到此处。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder="Google OAuth desktop client secret"
              autoComplete="off"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              The secret is saved locally in CocodeAI environment settings and applied after the local server restarts.
            </p>
          </CardContent>
          <CardFooter>
            <Button disabled={busyAction === "save-secret" || !clientSecret.trim() || !hostServerAvailable} onClick={() => void saveGoogleClientSecret()}>
              {busyAction === "save-secret" ? <Loader2 className="size-4 animate-spin" /> : null}
              Save and apply
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {status?.vault === "unavailable" ? (
        <Alert variant="destructive">
          <XCircle />
          <AlertTitle>Encrypted token vault unavailable</AlertTitle>
          <AlertDescription>CocodeAI cannot securely save your Google connection on this machine right now.</AlertDescription>
        </Alert>
      ) : null}

      {error || status?.error ? (
        <Alert variant="destructive">
          <XCircle />
          <AlertTitle>Google Workspace error</AlertTitle>
          <AlertDescription>{error ?? status?.error}</AlertDescription>
        </Alert>
      ) : null}

      {status?.smokeTest ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>范围冒烟测试完成</AlertTitle>
          <AlertDescription>日历、Drive 和 Gmail 草稿访问权限已验证。</AlertDescription>
        </Alert>
      ) : null}

      <Card variant="outline" size="sm">
        <CardHeader>
          <CardTitle>CocodeAI 能做什么</CardTitle>
          <CardDescription>
            连接 Google Workspace，让 CocodeAI 帮助准备会议、处理选定文件和草稿邮件。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-3">
            <CalendarDays className="mb-2 size-4 text-blue-11" />
            <div className="text-sm font-medium text-card-foreground">读取日历</div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">列出即将发生的事件并提供会议上下文。</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <MailPlus className="mb-2 size-4 text-red-11" />
            <div className="text-sm font-medium text-card-foreground">Gmail 草稿</div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">仅创建草稿邮件。第一阶段不提供发送工具。</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <FileText className="mb-2 size-4 text-green-11" />
            <div className="text-sm font-medium text-card-foreground">选定的 Drive 文件</div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">读取通过 CocodeAI 显式选择或创建的文件。</div>
          </div>
        </CardContent>
      </Card>

      <Card variant="outline" size="sm">
        {connectedAccounts.length > 0 ? (
          <CardContent className="space-y-2 pt-6">
            {connectedAccounts.map((account) => (
              <div key={account.accountId ?? account.email ?? account.sub ?? "google-account"} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-card-foreground">{account.email ?? account.name ?? "Google 账号"}</div>
                  <div className="text-xs text-muted-foreground">{account.accountId === status?.activeAccountId ? "扩展操作的默认账号" : "已连接"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {account.accountId && account.accountId !== status?.activeAccountId ? (
                    <Button variant="outline" size="sm" disabled={Boolean(busyAction)} onClick={() => {
                      const accountId = account.accountId;
                      if (!accountId) return;
                      void runDesktopAction("set-active", () => openworkServerClient?.googleWorkspaceSetActiveAccount(accountId) ?? Promise.resolve(null));
                    }}>
                      {busyAction === "set-active" ? <Loader2 className="size-4 animate-spin" /> : null}
                      Make default
                    </Button>
                  ) : null}
                  <Button variant="destructive" size="sm" disabled={Boolean(busyAction)} onClick={() => void runDesktopAction("disconnect", () => openworkServerClient?.googleWorkspaceDisconnect(account.accountId) ?? Promise.resolve(null))}>
                    Disconnect
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        ) : null}
        <CardFooter className="flex-wrap gap-2 justify-between">
          <div className="flex flex-wrap gap-2">
            <Button disabled={Boolean(busyAction) || !canConnect} onClick={() => void runDesktopAction("connect", connectGoogleWorkspace)}>
              {busyAction === "connect" ? <Loader2 className="size-4 animate-spin" /> : null}
              {status?.connected ? "添加另一个 Google 账号" : "连接 Google"}
            </Button>
            {connectedAccounts.length > 1 ? (
              <Button variant="destructive" disabled={Boolean(busyAction)} onClick={() => void runDesktopAction("disconnect", () => openworkServerClient?.googleWorkspaceDisconnect() ?? Promise.resolve(null))}>
                {busyAction === "disconnect" ? <Loader2 className="size-4 animate-spin" /> : null}
                全部断开连接
              </Button>
            ) : null}
            <Button variant="outline" disabled={Boolean(busyAction) || !canTest} onClick={() => void runDesktopAction("test", () => openworkServerClient?.googleWorkspaceTestConnection() ?? Promise.resolve(null))}>
              {busyAction === "test" ? <Loader2 className="size-4 animate-spin" /> : null}
              Test connection
            </Button>
            <Button variant="outline" disabled={Boolean(busyAction) || !canTest} onClick={() => void runDesktopAction("smoke-test", () => openworkServerClient?.googleWorkspaceRunScopeSmokeTest() ?? Promise.resolve(null))}>
              {busyAction === "smoke-test" ? <Loader2 className="size-4 animate-spin" /> : null}
              Run diagnostic
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Accordion>
        <AccordionItem value="advanced">
          <AccordionTrigger>Advanced</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Use your own Google OAuth client to unlock extra permissions, like reading Gmail, full Drive access, creating calendar events, and Google Chat.
            </p>
            {status?.customClient ? (
              <Alert>
                <CheckCircle2 />
                <AlertTitle>Using your own Google OAuth client</AlertTitle>
                <AlertDescription>Extra permissions below are available.</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                <Input
                  value={customClientId}
                  onChange={(event) => setCustomClientId(event.target.value)}
                  placeholder="Your Google OAuth desktop client ID"
                  autoComplete="off"
                />
                <Input
                  type="password"
                  value={customClientSecret}
                  onChange={(event) => setCustomClientSecret(event.target.value)}
                  placeholder="Your Google OAuth desktop client secret"
                  autoComplete="off"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Create a desktop OAuth client in Google Cloud Console, then paste its client ID and secret. They are saved locally in CocodeAI environment settings and applied after the local server restarts.
                </p>
                <Button disabled={busyAction === "save-secret" || !customClientId.trim() || !customClientSecret.trim() || !hostServerAvailable} onClick={() => void saveCustomOauthClient()}>
                  {busyAction === "save-secret" ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save and apply
                </Button>
              </div>
            )}
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {status?.customClient
                  ? "允许或拒绝下面的每个额外权限。它们将在你下次连接 Google 账号时被请求。已连接？请断开并重新连接以更改。"
                  : "在上面添加你自己的 Google OAuth 客户端以启用这些选项。"}
              </p>
              {OPTIONAL_FEATURES.map((feature) => (
                <label key={feature.id} className="flex items-start gap-2.5">
                  <Checkbox
                    checked={optionalFeatures[feature.id]}
                    onCheckedChange={(checked) => setOptionalFeatures((current) => ({ ...current, [feature.id]: checked === true }))}
                    disabled={Boolean(busyAction) || status?.customClient !== true}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-card-foreground">{feature.label}</span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">{feature.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

registerExtensionRuntime({
  id: "google-workspace",
  settingsPanelRefs: ["openwork.googleWorkspace.settings"],
  settingsPanel: (ctx) => <GoogleWorkspaceConfig {...ctx} />,
  isConnected: (_entry, ctx) => ctx.extensionConnections?.["google-workspace"] === true,
});
