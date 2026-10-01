import { createPortal } from 'react-dom';
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function OutputDrawer({ open, onClose, title, running, result }) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="h-full w-full max-w-xl border-l border-white/10 bg-slate-900 shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            {running && <Loader2 size={18} className="animate-spin text-brand-400" />}
            {!running && result?.success && <CheckCircle2 size={18} className="text-emerald-400" />}
            {!running && result && !result.success && <XCircle size={18} className="text-rose-400" />}
            <h3 className="font-semibold text-slate-100">{title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="h-[calc(100%-61px)] overflow-y-auto p-5">
          {running && (
            <p className="text-sm text-slate-400">Executando no servidor, aguarde...</p>
          )}
          {!running && result && (
            <pre className="mono whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-slate-300">
              {result.output?.trim() || '(sem saída)'}
            </pre>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
