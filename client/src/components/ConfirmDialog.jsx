import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', onConfirm, onCancel }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fade-in dark:bg-slate-950/70">
      <div className="w-full max-w-sm rounded-2xl border border-slate-900/10 bg-white p-5 shadow-2xl animate-slide-up dark:border-white/10 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2.5 text-amber-600 dark:text-amber-300">
          <AlertTriangle size={20} />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        </div>
        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">{message}</p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
