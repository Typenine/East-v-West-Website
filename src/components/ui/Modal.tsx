"use client";

import { ReactNode, useEffect, useRef } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  showClose = true,
  autoFocusPanel = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  showClose?: boolean;
  autoFocusPanel?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleIdRef = useRef<string>(`modal-title-${Math.random().toString(36).slice(2)}`);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Close on ESC and keep focus trapped within the dialog
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
      if (e.key === "Tab") {
        const root = panelRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    // Focus the panel on mount (configurable). If disabled, caller can autofocus inputs.
    if (autoFocusPanel) {
      setTimeout(() => {
        panelRef.current?.focus();
      }, 0);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, autoFocusPanel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleIdRef.current : undefined}
            tabIndex={-1}
            className="overflow-hidden rounded-2xl w-full max-w-lg outline-none"
            style={{
              background: 'var(--panel-card)',
              boxShadow: 'inset 0 0 0 1px var(--panel-border), var(--panel-shadow)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-[3px] w-full" style={{ background: 'var(--accent)' }} aria-hidden="true" />
            {(title || showClose) && (
              <div
                className="px-4 py-3 sm:px-6 flex items-center justify-between gap-3"
                style={{ background: 'var(--panel-header-bg)', borderBottom: '1px solid var(--panel-hairline)' }}
              >
                {title ? (
                  <h3
                    id={titleIdRef.current}
                    className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--panel-text)]"
                  >
                    {title}
                  </h3>
                ) : <span />}
                {showClose && (
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    className="text-[var(--panel-muted)] hover:text-[var(--panel-text)] hover:bg-[var(--panel-tint-soft)] px-2 py-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    ×
                  </button>
                )}
              </div>
            )}
            <div className="p-4 sm:p-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Modal;
