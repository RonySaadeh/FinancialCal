import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface Toast {
  id: number;
  tone: 'error' | 'success';
  message: string;
}

interface ToastApi {
  error: (message: string) => void;
  success: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({ error: () => {}, success: () => {} });
export const useToast = () => useContext(ToastContext);

let seq = 0;

/** Small notifications for background saves. Errors stay until dismissed; successes fade. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    if (tone === 'success') setTimeout(() => dismiss(id), 3000);
  }, [dismiss]);
  const api = useMemo(() => ({ error: (m: string) => push('error', m), success: (m: string) => push('success', m) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              t.tone === 'error' ? 'border-negative/30 bg-negative-soft text-negative' : 'border-positive/30 bg-positive-soft text-positive'
            }`}
          >
            {t.tone === 'error' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <p className="flex-1">{t.message}</p>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
