/** @jsxImportSource react */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SUPPORT_EMAIL = "";
const SUPPORT_MAILTO = "";

/**
 * Small inline link rendered inside the remote-worker error card. When clicked,
 * it opens a dialog explaining the remote worker upgrade situation and how to
 * reach support.
 */
export function OpenWorkDenHelpLink() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="mt-2 inline-flex items-center text-[11px] font-medium text-blue-11 underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        使用远程 Worker？点击这里
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>远程 Worker</DialogTitle>
            <DialogDescription>
              我们近期升级了服务器。如果您的远程 Worker 是在升级之前部署的，可能不再与当前版本兼容。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-[13px] leading-5 text-gray-11">
            <p>要恢复使用，有两种方式：</p>
            <ul className="ml-4 list-disc space-y-2">
              <li>使用应用内的 <span className="font-medium text-dls-text">反馈</span> 按钮发送消息，我们会尽快处理。</li>
            </ul>
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              关闭
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                window.location.href = SUPPORT_MAILTO;
              }}
            >
             发送反馈
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
