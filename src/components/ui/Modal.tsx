import React, { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "full";
  preventClose?: boolean;
}

const sizeClasses: Record<string, string> = {
  sm: "max-w-md",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  full: "w-full h-full m-0 rounded-none max-h-none",
};

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  preventClose = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !preventClose) {
        onClose();
        return;
      }
      // Simple focus trap
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose, preventClose]
  );

  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);
      // Focus first focusable element
      requestAnimationFrame(() => {
        const first = panelRef.current?.querySelector<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])'
        );
        first?.focus();
      });
    }
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 ${
        size === "full" ? "" : "bg-black/70"
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !preventClose) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel ${sizeClasses[size]} relative w-full ${
          size === "full" ? "h-screen" : "max-h-[90vh]"
        } flex flex-col bg-surface-3 border border-white/10 rounded-2xl shadow-3`}
      >
        <div className="p-6 border-b border-white/5 flex items-start justify-between gap-4 flex-none">
          <h2 className="text-xl font-bold text-text-high">{title}</h2>
          {!preventClose && (
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="p-2 rounded-lg hover:bg-white/10 text-text-muted hover:text-text-high transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">{children}</div>
        {footer && (
          <div className="p-6 border-t border-white/5 flex justify-end gap-3 bg-surface-1 flex-none">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
