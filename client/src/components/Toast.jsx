import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const STYLES = {
  success:
    'border-emerald-600/20 bg-white text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200',
  error:
    'border-rose-600/20 bg-white text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200',
  info: 'border-brand-600/20 bg-white text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-200',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2">
        {toasts.map(({ id, message, type }) => {
          const Icon = ICONS[type];
          return (
            <div
              key={id}
              className={`animate-slide-up flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-soft backdrop-blur-md ${STYLES[type]}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1 leading-snug">{message}</p>
              <button onClick={() => dismiss(id)} className="shrink-0 text-current/60 hover:text-current">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
