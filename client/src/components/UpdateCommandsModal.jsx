import { Terminal, Loader2, ShieldAlert, ShieldCheck, FileDiff } from 'lucide-react';
import Modal from './Modal.jsx';

export default function UpdateCommandsModal({
  open,
  systemName,
  value,
  onChange,
  onCancel,
  onConfirm,
  preview,
  previewLoading,
  isAdmin,
}) {
  const findings = preview?.findings || [];
  const hasRisk = findings.length > 0;
  const willNeedApproval = hasRisk && !isAdmin;

  return (
    <Modal open={open} title={`Atualizar — ${systemName}`} onClose={onCancel} width="max-w-lg">
      {previewLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={15} className="animate-spin" />
          Verificando o que vai mudar (git fetch + diff)...
        </div>
      )}

      {!previewLoading && preview?.success === false && (
        <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">
          Não foi possível verificar as mudanças: {preview.error}
        </div>
      )}

      {!previewLoading && preview?.success && !preview.hasChanges && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-300">
          <ShieldCheck size={15} />
          Já está atualizado — nada novo para trazer do repositório.
        </div>
      )}

      {!previewLoading && preview?.success && preview.hasChanges && (
        <div className="mb-4">
          <div
            className={`mb-2.5 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${
              hasRisk
                ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {hasRisk ? <ShieldAlert size={15} className="shrink-0" /> : <ShieldCheck size={15} className="shrink-0" />}
            <span>
              {hasRisk
                ? `${findings.length} ponto(s) suspeito(s) encontrado(s) nas mudanças.`
                : 'Nenhum padrão de risco encontrado nas mudanças.'}
              {willNeedApproval && ' Como você não é admin, isso vai pedir aprovação antes de aplicar.'}
            </span>
          </div>

          {hasRisk && (
            <ul className="mb-2.5 flex flex-col gap-1.5">
              {findings.map((f, i) => (
                <li key={i} className="rounded-lg border border-amber-500/10 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                  <span className="font-medium">{f.label}</span>
                  {f.file && (
                    <span className="mono text-amber-300/70">
                      {' '}
                      — {f.file}:{f.line}
                    </span>
                  )}
                  {f.snippet && <div className="mono mt-1 truncate text-amber-300/60">{f.snippet}</div>}
                </li>
              ))}
            </ul>
          )}

          <details className="rounded-lg border border-white/10">
            <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs text-slate-400 hover:text-slate-200">
              <FileDiff size={13} />
              Ver diff ({preview.diffStat?.split('\n').length || 0} arquivo(s))
            </summary>
            <pre className="mono max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-slate-400">
              {preview.diffText?.trim() || preview.diffStat}
            </pre>
          </details>
        </div>
      )}

      <p className="mb-3 text-sm text-slate-400">
        O <code className="mono">git pull</code> roda primeiro. Os comandos abaixo (opcionais) rodam em seguida, em
        sequência, na pasta do sistema — edite apenas para esta execução.
      </p>

      <label className="label flex items-center gap-1.5">
        <Terminal size={13} />
        Comandos pós-atualização
      </label>
      <textarea
        autoFocus
        className="input mono min-h-[100px] resize-y"
        placeholder={'npm install\nnpm run build\nnode scripts/init-db.js'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1.5 text-xs text-slate-500">Um comando por linha. Para na primeira falha.</p>

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className={willNeedApproval ? 'btn-secondary border-amber-500/30 text-amber-300' : 'btn-primary'} onClick={onConfirm} disabled={previewLoading}>
          {willNeedApproval ? 'Enviar para aprovação' : 'Atualizar'}
        </button>
      </div>
    </Modal>
  );
}
