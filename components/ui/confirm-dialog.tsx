"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "default" | "destructive";
}

/** Promise-based replacement for window.confirm(), styled to match the app shell. */
export function useConfirm() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(value: boolean) => void>(() => {});

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    dialogRef.current?.showModal();
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    dialogRef.current?.close();
    resolver.current(result);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    const onCancel = () => resolver.current(false);
    dialog?.addEventListener("cancel", onCancel);
    return () => dialog?.removeEventListener("cancel", onCancel);
  }, []);

  const dialog = (
    <dialog ref={dialogRef} className="erp-confirm-dialog" onClick={(e) => { if (e.target === e.currentTarget) close(false); }}>
      {options && (
        <div className="erp-confirm-body">
          <h2>{options.title}</h2>
          {options.description && <p>{options.description}</p>}
          <div className="erp-confirm-actions">
            <Button variant="outline" size="sm" onClick={() => close(false)}>Batal</Button>
            <Button variant={options.tone === "destructive" ? "destructive" : "default"} size="sm" onClick={() => close(true)}>
              {options.confirmLabel ?? "Lanjutkan"}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );

  return { confirm, dialog };
}
