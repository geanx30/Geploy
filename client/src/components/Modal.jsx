import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ open, title, onClose, children, width = 'max-w-md' }) {
  if (!open) return null;

  // Portal para o body: um ancestor com backdrop-blur (ex.: o card ".panel")
  // cria um "containing block" para position:fixed, o que prenderia o modal
  // dentro dos limites do card em vez de cobrir a tela toda.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-fade-in dark:bg-slate-950/70">
      <div className={`w-full ${width} rounded-2xl border border-slate-900/10 bg-white shadow-2xl animate-slide-up dark:border-white/10 dark:bg-slate-900`}>
        <div className="flex items-center justify-between border-b border-slate-900/10 px-5 py-4 dark:border-white/10">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
