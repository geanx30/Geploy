import { formatDateTime } from '../../utils/date.js';
import { useEffect, useState } from 'react';
import { ShieldAlert, Check, X, FileDiff, Inbox, GitBranch, PackagePlus } from 'lucide-react';
import { api } from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import OutputDrawer from '../../components/OutputDrawer.jsx';
import { useToast } from '../../components/Toast.jsx';

const STATUS_LABEL = {
  pending: { cls: 'badge-pending', label: 'Pendente' },
  approved: { cls: 'badge-ok', label: 'Aprovada' },
  rejected: { cls: 'badge-err', label: 'Rejeitada' },
};

export default function ApprovalsAdmin() {
  const { push } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { id, kind, action }
  const [drawer, setDrawer] = useState({ open: false });

  function load() {
    setLoading(true);
    Promise.all([api.get('/admin/update-requests'), api.get('/admin/deploy-requests')])
      .then(([updates, deploys]) => {
        const normalized = [
          ...updates.map((r) => ({ ...r, kind: 'update', title: r.system_name })),
          ...deploys.map((r) => ({ ...r, kind: 'deploy', title: r.name })),
        ];
        normalized.sort((a, b) => b.id - a.id || a.kind.localeCompare(b.kind));
        setRequests(normalized);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function decide(item, action) {
    setConfirm(null);
    const base = item.kind === 'deploy' ? '/admin/deploy-requests' : '/admin/update-requests';
    const label = action === 'approve' ? 'Aprovação' : 'Rejeição';
    setDrawer({ title: `${label} — ${item.title}`, running: true, open: true, result: null });
    try {
      const result = await api.post(`${base}/${item.id}/${action}`);
      setDrawer({ title: `${label} — ${item.title}`, running: false, open: true, result });
      push(action === 'approve' ? 'Solicitação aprovada e aplicada.' : 'Solicitação rejeitada.', 'success');
      load();
    } catch (err) {
      const result = { success: false, output: err.message };
      setDrawer({ title: `${label} — ${item.title}`, running: false, open: true, result });
      push(err.message, 'error');
    }
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Aprovações</h1>
        <p className="mt-1 text-sm text-slate-500">
          Atualizações suspeitas e pedidos de sistema novo ficam aqui até um admin decidir.
        </p>
      </div>

      {!loading && pending.length === 0 && (
        <div className="panel mb-8 flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Inbox size={28} className="text-slate-400 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">Nenhuma solicitação pendente.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-8 flex flex-col gap-3">
          {pending.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="panel p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {r.kind === 'deploy' ? (
                      <PackagePlus size={16} className="text-brand-500" />
                    ) : (
                      <ShieldAlert size={16} className="text-amber-400" />
                    )}
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</h3>
                    <span className={STATUS_LABEL[r.status].cls}>{STATUS_LABEL[r.status].label}</span>
                    {r.kind === 'deploy' && <span className="badge-off">sistema novo</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Pedido por <span className="text-slate-500 dark:text-slate-400">{r.requested_by}</span> em{' '}
                    {formatDateTime(r.created_at)}
                    {r.kind === 'deploy' && r.owner_username && (
                      <>
                        {' '}
                        — dono: <span className="text-slate-500 dark:text-slate-400">{r.owner_username}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button className="btn-danger !px-3" onClick={() => setConfirm({ item: r, action: 'reject' })}>
                    <X size={14} />
                    Rejeitar
                  </button>
                  <button className="btn-primary !px-3" onClick={() => setConfirm({ item: r, action: 'approve' })}>
                    <Check size={14} />
                    {r.kind === 'deploy' ? 'Aprovar e criar' : 'Aprovar e aplicar'}
                  </button>
                </div>
              </div>

              {r.kind === 'deploy' && (
                <div className="mb-2.5 rounded-lg bg-slate-900/[0.02] p-3 text-xs text-slate-600 dark:bg-white/[0.03] dark:text-slate-400">
                  <div className="mono flex items-center gap-1.5">
                    <GitBranch size={12} className="shrink-0" />
                    {r.repo_url}
                  </div>
                  <div className="mt-1">
                    Pasta: <span className="mono">{r.final_path}</span> · Tipo:{' '}
                    {r.process_type === 'iis_site' ? 'Site IIS' : 'Serviço Windows'}
                    {r.access_url && (
                      <>
                        {' '}
                        · Endereço: <span className="mono">{r.access_url}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {r.findings.length > 0 && (
                <ul className="mb-2.5 flex flex-col gap-1.5">
                  {r.findings.map((f, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-amber-600/10 bg-amber-600/5 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/10 dark:bg-amber-500/5 dark:text-amber-200"
                    >
                      <span className="font-medium">{f.label}</span>
                      {f.file && (
                        <span className="mono text-amber-700/70 dark:text-amber-300/70">
                          {' '}
                          — {f.file}:{f.line}
                        </span>
                      )}
                      {f.snippet && (
                        <div className="mono mt-1 truncate text-amber-700/60 dark:text-amber-300/60">{f.snippet}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {r.kind === 'update' && (
                <details className="rounded-lg border border-slate-900/10 dark:border-white/10">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
                    <FileDiff size={13} />
                    Ver diff completo
                  </summary>
                  <pre className="mono max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-slate-900/10 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 dark:border-white/10 dark:bg-black/30 dark:text-slate-400">
                    {r.diff_text?.trim() || r.diff_stat}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Histórico recente</h2>
          <div className="panel overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-900/10 text-xs uppercase tracking-wide text-slate-500 dark:border-white/10">
                  <th className="px-5 py-3 font-medium">Sistema</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">Pedido por</th>
                  <th className="px-5 py-3 font-medium">Decidido por</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/5 dark:divide-white/5">
                {decided.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td className="px-5 py-3 text-slate-900 dark:text-slate-200">{r.title}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {r.kind === 'deploy' ? 'Sistema novo' : 'Atualização'}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{r.requested_by}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{r.decided_by || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={STATUS_LABEL[r.status].cls}>{STATUS_LABEL[r.status].label}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{r.decided_at ? formatDateTime(r.decided_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.action === 'approve'
            ? confirm.item.kind === 'deploy'
              ? 'Aprovar e criar este sistema?'
              : 'Aprovar e aplicar esta atualização?'
            : 'Rejeitar esta solicitação?'
        }
        message={
          confirm?.action === 'approve'
            ? confirm.item.kind === 'deploy'
              ? 'A pasta vai ser movida para o lugar definitivo, os .env gravados e o serviço Windows criado e iniciado agora, de verdade.'
              : 'O git pull e os comandos pós-atualização vão rodar agora, de verdade, no servidor.'
            : confirm?.item?.kind === 'deploy'
              ? 'A pasta clonada é removida e nada é criado.'
              : 'O código não será atualizado. O usuário pode abrir uma nova solicitação depois.'
        }
        confirmLabel={confirm?.action === 'approve' ? 'Aprovar' : 'Rejeitar'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => decide(confirm.item, confirm.action)}
      />

      <OutputDrawer
        open={drawer.open}
        title={drawer.title}
        running={drawer.running}
        result={drawer.result}
        onClose={() => setDrawer({ open: false })}
      />
    </div>
  );
}
