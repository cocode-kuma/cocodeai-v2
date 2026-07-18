import { desktopNotificationShow } from "@/app/lib/desktop";
import { isDesktopRuntime } from "@/app/utils";
import {
  DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE,
  isDesktopNotificationPreference,
  type DesktopNotificationPreference,
} from "@/react-app/kernel/desktop-notification-preferences";
import { LOCAL_PREFERENCES_KEY } from "@/react-app/kernel/local-preferences-storage";

type DesktopNotificationImportance = "important" | "routine";

export type DesktopNotificationEvent =
  | { type: "task.completed"; sessionId: string }
  | { type: "task.failed"; sessionId: string; errorText?: string }
  | { type: "permission.asked"; sessionId: string; detail?: string }
  | { type: "question.asked"; sessionId: string; question?: string };

type NotificationCopy = {
  title: string;
  body: string;
  importance: DesktopNotificationImportance;
};

function readDesktopNotificationPreference(): DesktopNotificationPreference {
  if (typeof window === "undefined") return DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE;
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFERENCES_KEY);
    if (!raw) return DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE;
    const parsed: unknown = JSON.parse(raw);
    const value = parsed && typeof parsed === "object"
      ? Reflect.get(parsed, "desktopNotifications")
      : undefined;
    return isDesktopNotificationPreference(value)
      ? value
      : DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE;
  } catch {
    return DEFAULT_DESKTOP_NOTIFICATION_PREFERENCE;
  }
}

function shouldNotify(
  preference: DesktopNotificationPreference,
  importance: DesktopNotificationImportance,
) {
  if (preference === "off") return false;
  if (preference === "important") return importance === "important";
  return true;
}

function isAppInView() {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && document.hasFocus();
}

function copyForEvent(event: DesktopNotificationEvent): NotificationCopy {
  switch (event.type) {
    case "task.completed":
      return {
        title: "任务已完成",
        body: "会话已运行完成。",
        importance: "routine",
      };
    case "task.failed":
      return {
        title: "任务失败",
        body: event.errorText?.trim() || "会话因错误而停止。",
        importance: "important",
      };
    case "permission.asked":
      return {
        title: "需要授权",
        body: event.detail?.trim() || "有一个会话正在等待授权才能继续。",
        importance: "important",
      };
    case "question.asked":
      return {
        title: "问题需要你回答",
        body: event.question?.trim() || "有一个会话正在等待你的回答。",
        importance: "important",
      };
  }
}

export function notifyDesktopEvent(event: DesktopNotificationEvent): void {
  if (!isDesktopRuntime()) return;
  const copy = copyForEvent(event);
  if (!shouldNotify(readDesktopNotificationPreference(), copy.importance)) return;
  if (isAppInView()) return;

  void desktopNotificationShow({
    title: copy.title,
    body: copy.body,
  }).catch(() => undefined);
}
