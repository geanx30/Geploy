import { useEffect, useState } from 'react';
import { RefreshCw, Play, Square, RotateCw, Server, Globe, FolderGit2, ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext.jsx';
import StatusBadge from './StatusBadge.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import UpdateCommandsModal from './UpdateCommandsModal.jsx';
import { useToast } from './Toast.jsx';

function AddressLink({ address }) {
  const href = /^https?:\/\//i.test(address) ? address : `http://${address}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1 truncate rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] text-brand-300 hover:bg-white/[0.06] hover:text-brand-200"
      title={address}
    >
      <ExternalLink size={11} className="shrink-0" />
      <span className="mono truncate">{address}</span>
    </a>
  );
}

function parseStatus(output = '') {
  const lower = output.toLowerCase();
  if (lower.includes('running') || lower.includes('started')) return 'running';
  if (lower.includes('stopped')) return 'stopped';
  return 'unknown';
}

export default function SystemCard({ system, onOpenOutput, ownerLabel }) {
  const { push } = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState('checking');
  const [busyAction, setBusyAction] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateCommandsDraft, setUpdateCommandsDraft] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function refreshStatus() {
    setStatus('checking');
    try {
      const result = await api.get(`/systems/${system.id}/status`);
      setStatus(result.success ? parseStatus(result.output) : 'error');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system.id]);

  async function runAction(action, label, body) {
    setBusyAction(action);
    onOpenOutput({ title: `${label} — ${system.name}`, running: true, result: null });
    try {
      const path = action === 'update' ? `/systems/${system.id}/update` : `/systems/${system.id}/${action}`;
      const result = await api.post(path, body);

      if (result.pending) {
        const pendingResult = {
          success: true,
          output: `Encontramos ${result.findings.length} ponto(s) suspeito(s) nas mudanças. A atualização foi enviada para um admin aprovar antes de ser aplicada (solicitação #${result.requestId}).`,
        };
        onOpenOutput({ title: `${label} — ${system.name}`, running: false, result: pendingResult });
        push('Atualização enviada para aprovação de um admin.', 'info');
        return;
      }

      onOpenOutput({ title: `${label} — ${system.name}`, running: false, result });
      push(result.success ? `${label} concluído com sucesso.` : `${label} falhou.`, result.success ? 'success' : 'error');
      refreshStatus();
    } catch (err) {
      const result = { success: false, output: err.message };
      onOpenOutput({ title: `${label} — ${system.name}`, running: false, result });
      push(`${label} falhou: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function loadPreview() {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const result = await api.post(`/systems/${system.id}/preview-update`);
      setPreview(result);
    } catch (err) {
      setPreview({ success: false, error: err.message });
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleAction(action, label) {
    if (action === 'update') {
      setUpdateCommandsDraft(system.post_update_commands || '');
      setUpdateModalOpen(true);
      loadPreview();
      return;
    }
    if (action === 'stop' || action === 'restart') {
      setConfirm({ action, label });
      return;
    }
    runAction(action, label);
  }

  function confirmUpdate() {
    setUpdateModalOpen(false);
    runAction('update', 'Atualização', { post_update_commands: updateCommandsDraft });
  }

  const ProcessIcon = system.process_type === 'iis_site' ? Globe : Server;

  return (
    <div className="panel flex flex-col gap-4 p-5 transition-shadow hover:shadow-glow/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-slate-100">{system.name}</h3>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <ProcessIcon size={13} />
            <span>{system.process_type === 'iis_site' ? 'Site IIS' : 'Serviço Windows'}</span>
            {ownerLabel && (
              <>
                <span className="text-slate-700">•</span>
                <span>{ownerLabel}</span>
              </>
            )}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="flex items-center gap-1.5 truncate rounded-lg bg-black/20 px-2.5 py-1.5 text-[11px] text-slate-500">
        <FolderGit2 size={13} className="shrink-0" />
        <span className="mono truncate">{system.repo_path}</span>
      </div>

      {(system.access_url || system.public_url) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {system.access_url && <AddressLink address={system.access_url} />}
          {system.public_url && <AddressLink address={system.public_url} />}
        </div>
      )}

      <div className="mt-auto flex items-center gap-1.5 pt-1">
        <button
          className="btn-primary min-w-0 flex-1 !px-3"
          disabled={Boolean(busyAction)}
          onClick={() => handleAction('update', 'Atualização')}
        >
          <RefreshCw size={15} className={`shrink-0 ${busyAction === 'update' ? 'animate-spin' : ''}`} />
          <span className="truncate">Atualizar</span>
        </button>
        <button
          className="btn-secondary shrink-0 !px-2.5"
          disabled={Boolean(busyAction)}
          title="Iniciar"
          onClick={() => handleAction('start', 'Iniciar')}
        >
          <Play size={15} />
        </button>
        <button
          className="btn-secondary shrink-0 !px-2.5"
          disabled={Boolean(busyAction)}
          title="Parar"
          onClick={() => handleAction('stop', 'Parar')}
        >
          <Square size={15} />
        </button>
        <button
          className="btn-secondary shrink-0 !px-2.5"
          disabled={Boolean(busyAction)}
          title="Reiniciar"
          onClick={() => handleAction('restart', 'Reiniciar')}
        >
          <RotateCw size={15} />
        </button>
      </div>

      <UpdateCommandsModal
        open={updateModalOpen}
        systemName={system.name}
        value={updateCommandsDraft}
        onChange={setUpdateCommandsDraft}
        onCancel={() => setUpdateModalOpen(false)}
        onConfirm={confirmUpdate}
        preview={preview}
        previewLoading={previewLoading}
        isAdmin={user?.role === 'admin'}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={`${confirm?.label} ${system.name}?`}
        message="Essa ação afeta o sistema em produção imediatamente. Deseja continuar?"
        confirmLabel={confirm?.label}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const { action, label } = confirm;
          setConfirm(null);
          runAction(action, label);
        }}
      />
    </div>
  );
}
