import React, { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, LazyMotion, domAnimation } from "motion/react";
import * as motionSlim from "motion/react-m";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; message: string; type: ToastType };

type ToastFn = (msg: string, type?: ToastType) => void;

const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

const styles: Record<ToastType, string> = {
  success: "bg-accent-600/90 text-white border-accent-400/30",
  error: "bg-red-500/90 text-white border-red-400/30",
  info: "bg-surface-3/95 text-text-base border-white/10",
};

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 shrink-0" />,
  error: <AlertTriangle className="w-4 h-4 shrink-0" />,
  info: <Info className="w-4 h-4 shrink-0" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p.slice(-2), { id, message, type }]); // max 3
    setTimeout(
      () => setToasts((p) => p.filter((t) => t.id !== id)),
      type === "error" ? 7000 : 4000
    );
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-full max-w-md pointer-events-none px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motionSlim.div
              key={t.id}
              role="status"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className={`pointer-events-auto px-5 py-3 rounded-xl text-sm font-bold shadow-3 border flex items-center gap-3 ${styles[t.type]}`}
            >
              {icons[t.type]}
              <span className="flex-1">{t.message}</span>
              <button
                aria-label="Fermer"
                onClick={() =>
                  setToasts((p) => p.filter((x) => x.id !== t.id))
                }
              >
                <X className="w-4 h-4 opacity-60 hover:opacity-100" />
              </button>
            </motionSlim.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

// ConfirmDialog
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                …
              </span>
            ) : (
              confirmLabel
            )}
          </Button>
        </>
      }
    >
      {description && (
        <p className="text-sm text-text-base leading-relaxed">{description}</p>
      )}
    </Modal>
  );
}
