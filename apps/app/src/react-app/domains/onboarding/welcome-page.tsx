/** @jsxImportSource react */
import { type ReactNode } from "react";

import { t } from "../../../i18n";
import {
  Page,
  PageBackground,
  PageDescription,
  PageHeader,
  PageTitle,
  PageTitlebarRegion,
} from "@/components/page";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollAreaViewport } from "@/components/ui/scroll-area";

type WelcomePageProps = {
  onGetStarted: () => void;
  getStartedLabel?: string;
  busy?: boolean;
  error?: string | null;
  manualFolder?: string;
  onManualFolderChange?: (value: string) => void;
  onUseManualFolder?: () => void;
  showManualFolder?: boolean;
};

type OnboardingStepProps = {
  number: string;
  title: string;
  children: ReactNode;
};

function OnboardingStep({ number, title, children }: OnboardingStepProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/5 text-sm font-medium text-foreground">
        {number}
      </div>
      <div className="flex flex-col gap-0.5 pt-1">
        <div className="text-base font-medium text-foreground">{title}</div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function WelcomePage({
  onGetStarted,
  getStartedLabel,
  busy,
  error,
  manualFolder,
  onManualFolderChange,
  onUseManualFolder,
  showManualFolder,
}: WelcomePageProps) {
  return (
    <Page className="min-h-screen">
      <PageBackground />

      <PageTitlebarRegion />

      <ScrollArea className="relative z-10">
        <ScrollAreaViewport>
          <div className="flex min-h-screen items-center justify-center px-8 py-16">
            <div className="flex w-full max-w-md flex-col gap-10">
              {/* Header */}
              <PageHeader className="text-left">
                <PageTitle>{t("welcome.title")}</PageTitle>
                <PageDescription>{t("welcome.subtitle")}</PageDescription>
              </PageHeader>

              {/* Steps */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-foreground">
                    开始使用
                  </h2>
                </div>
                <OnboardingStep number="1" title="选择文件夹">
                  选择你机器上的任意文件夹作为工作区。
                </OnboardingStep>
                <OnboardingStep number="2" title="对话">
                  描述你的需求，AI 帮你搞定。
                </OnboardingStep>
                <OnboardingStep number="3" title="交互">
                  查看结果、审批操作，持续迭代。
                </OnboardingStep>
              </div>

              <div className="space-y-2">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={onGetStarted}
                  disabled={busy}
                >
                  {busy ? t("welcome.creating_workspace") : (getStartedLabel || t("welcome.get_started"))}
                </Button>
                {error ? (
                  <p className="text-center text-xs text-destructive">{error}</p>
                ) : null}
                {showManualFolder ? (
                  <div className="rounded-xl border border-dashed border-border p-3">
                    <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                      Daytona folder path
                      <input
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground outline-none focus:border-ring"
                        value={manualFolder ?? ""}
                        onChange={(event) => onManualFolderChange?.(event.target.value)}
                        placeholder="/workspace/my-project"
                      />
                    </label>
                    <Button
                      className="mt-2 w-full"
                      variant="outline"
                      onClick={onUseManualFolder}
                      disabled={busy || !manualFolder?.trim()}
                    >
                      Use this folder
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </ScrollAreaViewport>
      </ScrollArea>
    </Page>
  );
}
