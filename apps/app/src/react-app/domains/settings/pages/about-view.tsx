/** @jsxImportSource react */
import { COCODEAI_BUILD_IDENTIFIER_LABEL } from "@/app/lib/build-identifier";
import { LayoutStack } from "../settings-layout";

export function AboutView() {
  return (
    <LayoutStack>
      <div className="flex flex-col items-center gap-4 py-8">
        {/* App Icon */}
        <div className="flex size-16 items-center justify-center rounded-2xl bg-dls-accent">
          <span className="text-2xl font-bold text-dls-accent-fg select-none">C</span>
        </div>

        {/* App Name & Version */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-lg font-semibold text-dls-text-primary">CocodeAI</h1>
          {COCODEAI_BUILD_IDENTIFIER_LABEL ? (
            <p className="text-sm text-dls-text-secondary">{COCODEAI_BUILD_IDENTIFIER_LABEL}</p>
          ) : null}
        </div>

        {/* Description */}
        <p className="max-w-xs text-center text-sm text-dls-text-secondary leading-relaxed">
          由酷码工作室开发的智能桌面助手，帮助你更高效地完成工作。
        </p>

        {/* Meta Info */}
        <div className="w-full max-w-xs space-y-3 rounded-xl border border-dls-border bg-dls-surface-muted p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-dls-text-secondary">开发团队</span>
            <span className="font-medium text-dls-text-primary">酷码工作室</span>
          </div>
        </div>

        {/* Copyright */}
        <p className="text-xs text-dls-text-secondary">
          &copy; {new Date().getFullYear()} 酷码工作室 (Cocode Studio). 保留所有权利。
        </p>
      </div>
    </LayoutStack>
  );
}
