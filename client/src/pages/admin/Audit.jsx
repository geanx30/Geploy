import { Fragment, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { api } from '../../api/client';

const ACTION_LABELS = {
  update: 'Atualização',
  start: 'Iniciar',
  stop: 'Parar',
  restart: 'Reiniciar',
  'file-edit': 'Edição de arquivo',
  'git-credentials-set': 'Token configurado',
  'git-credentials-removed': 'Token removido',
  'update-requested': 'Atualização pedida',
  'update-approved': 'Atualização aprovada',
  'update-rejected': 'Atualização rejeitada',
};

export default function AuditAdmin() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api
      .get('/admin/audit')
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Auditoria</h1>
        <p className="mt-1 text-sm text-slate-500">Histórico de ações realizadas em todos os sistemas.</p>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-900/10 text-xs uppercase tracking-wide text-slate-500 dark:border-white/10">
              <th className="px-5 py-3 font-medium">Data</th>
              <th className="px-5 py-3 font-medium">Usuário</th>
              <th className="px-5 py-3 font-medium">Sistema</th>
              <th className="px-5 py-3 font-medium">Ação</th>
              <th className="px-5 py-3 font-medium">Resultado</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/5 dark:divide-white/5">
            {!loading &&
              logs.map((log) => (
                <Fragment key={log.id}>
                  <tr
                    className="cursor-pointer transition hover:bg-slate-900/[0.02] dark:hover:bg-white/[0.02]"
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  >
                    <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{log.username || '—'}</td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{log.system_name || '—'}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{ACTION_LABELS[log.action] || log.action}</td>
                    <td className="px-5 py-3">
                      {log.success ? (
                        <span className="badge-ok">
                          <CheckCircle2 size={12} /> Sucesso
                        </span>
                      ) : (
                        <span className="badge-err">
                          <XCircle size={12} /> Falha
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-400 dark:text-slate-600">
                      <ChevronDown size={15} className={`transition-transform ${expanded === log.id ? 'rotate-180' : ''}`} />
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 px-5 py-4 dark:bg-black/20">
                        <pre className="mono whitespace-pre-wrap text-xs text-slate-400">
                          {log.output?.trim() || '(sem saída)'}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
          </tbody>
        </table>
        {!loading && logs.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhum registro de auditoria ainda.</p>
        )}
      </div>
    </div>
  );
}
