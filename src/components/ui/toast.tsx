"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type Toast = {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  action?: ToastAction;
};

export type ToastOptions = {
  title?: string;
  duration?: number;
  action?: ToastAction;
  id?: string;
};

type ToastInput = string | ({ message: string } & ToastOptions);

type ToastApi = {
  toast: (variant: ToastVariant, input: ToastInput) => string;
  success: (input: ToastInput) => string;
  error: (input: ToastInput) => string;
  warning: (input: ToastInput) => string;
  info: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
};

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 3500,
  info: 4000,
  warning: 5000,
  error: 6500,
};

const ToastContext = createContext<ToastApi | null>(null);

// Module-level singleton so non-React callers (React Query cache handlers, etc.) can toast.
let externalApi: ToastApi | null = null;

export function getToastApi(): ToastApi | null {
  return externalApi;
}

function normalizeInput(variant: ToastVariant, input: ToastInput): Omit<Toast, "id"> & { id?: string } {
  if (typeof input === "string") {
    return { message: input, variant, duration: DEFAULT_DURATION[variant] };
  }
  return {
    message: input.message,
    title: input.title,
    variant,
    duration: input.duration ?? DEFAULT_DURATION[variant],
    action: input.action,
    id: input.id,
  };
}

function createId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    setToasts([]);
  }, []);

  const scheduleAutoDismiss = useCallback(
    (id: string, duration: number) => {
      if (duration <= 0) return;
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const toast = useCallback(
    (variant: ToastVariant, input: ToastInput): string => {
      const normalized = normalizeInput(variant, input);
      const id = normalized.id ?? createId();
      const next: Toast = {
        id,
        title: normalized.title,
        message: normalized.message,
        variant: normalized.variant,
        duration: normalized.duration,
        action: normalized.action,
      };
      setToasts((current) => {
        const existing = current.findIndex((t) => t.id === id);
        if (existing >= 0) {
          const clone = current.slice();
          clone[existing] = next;
          return clone;
        }
        return [...current, next].slice(-6);
      });
      scheduleAutoDismiss(id, next.duration);
      return id;
    },
    [scheduleAutoDismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (input) => toast("success", input),
      error: (input) => toast("error", input),
      warning: (input) => toast("warning", input),
      info: (input) => toast("info", input),
      dismiss,
      dismissAll,
    }),
    [toast, dismiss, dismissAll],
  );

  useEffect(() => {
    externalApi = api;
    return () => {
      if (externalApi === api) externalApi = null;
    };
  }, [api]);

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((timer) => clearTimeout(timer));
      currentTimers.clear();
    };
  }, []);

  return (
    <ToastContext value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const ctx = use(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>.");
  }
  return ctx;
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <ol
      role="region"
      aria-live="polite"
      aria-label="Benachrichtigungen"
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2 sm:right-6 sm:top-6"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </ol>,
    document.body,
  );
}

const variantStyles: Record<ToastVariant, { frame: string; eyebrow: string; title: string; body: string; icon: React.ReactNode }> = {
  success: {
    frame: "border-emerald-300/80 bg-emerald-50/90 shadow-[0_12px_30px_-12px_rgba(5,150,105,0.45)]",
    eyebrow: "text-emerald-700",
    title: "text-emerald-950",
    body: "text-emerald-900",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5 text-emerald-600">
        <path d="M5 10.5l3.2 3.2L15 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  error: {
    frame: "border-rose-300/80 bg-rose-50/90 shadow-[0_12px_30px_-12px_rgba(194,58,58,0.45)]",
    eyebrow: "text-rose-700",
    title: "text-rose-950",
    body: "text-rose-900",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5 text-rose-600">
        <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 6.5v4.2M10 13.4v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  warning: {
    frame: "border-amber-300/80 bg-amber-50/95 shadow-[0_12px_30px_-12px_rgba(217,119,6,0.45)]",
    eyebrow: "text-amber-800",
    title: "text-amber-950",
    body: "text-amber-900",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5 text-amber-600">
        <path d="M10 3.2l7.4 12.8H2.6L10 3.2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 8.5v3.2M10 14.1v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  info: {
    frame: "border-sky-300/80 bg-sky-50/90 shadow-[0_12px_30px_-12px_rgba(2,132,199,0.4)]",
    eyebrow: "text-sky-700",
    title: "text-sky-950",
    body: "text-sky-900",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5 text-sky-600">
        <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 9v4.2M10 6.4v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
};

const variantEyebrowLabel: Record<ToastVariant, string> = {
  success: "Erfolg",
  error: "Fehler",
  warning: "Warnung",
  info: "Hinweis",
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const styles = variantStyles[toast.variant];
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <li
      role={toast.variant === "error" || toast.variant === "warning" ? "alert" : "status"}
      className={`pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border p-3.5 backdrop-blur-sm transition-all duration-200 ease-out ${styles.frame} ${entered ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}
    >
      <span className="mt-0.5 shrink-0">{styles.icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${styles.eyebrow}`}>
          {toast.title ? toast.title : variantEyebrowLabel[toast.variant]}
        </p>
        <p className={`mt-0.5 break-words text-sm leading-5 ${styles.body}`}>{toast.message}</p>
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
            className={`mt-2 inline-flex items-center rounded-md border border-current/30 bg-white/60 px-2.5 py-1 text-xs font-semibold transition hover:bg-white ${styles.title}`}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Schliessen"
        className={`shrink-0 rounded-md p-1 text-xs transition hover:bg-black/5 ${styles.eyebrow}`}
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
          <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}
