import { useState } from 'react';
import { KeyRound, Loader2, AlertCircle, Copy, Check, Trash2 } from 'lucide-react';
import Modal from './Modal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { api } from '../api/client';

function CurlExample({ label, method, path, extraBody }) {
  const url = `${window.location.origin}${path}`;
  const body = extraBody ? ` \\\n  -d '${extraBody}'` : '';
  const cmd = `curl -X ${method} "${url}" \\\n  -H "Authorization: Bearer <TOKEN>"${body}`;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">{label}</p>
      <pre className="mono overflow-x-auto rounded-lg bg-slate-900/[0.04] p-2.5 text-[11px] leading-relaxed text-slate-700 dark:bg-black/30 dark:text-slate-300">
        {cmd}
      </pre>
    </div>
  );
}

export default function ApiTokenModal({ open, systemId, systemName, hasToken, onClose, onTokenChange }) {
  const [token, setToken] = useState(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setConfirmGenerate(false);
    setGenerating(true);
    setError('');
    try {
      const result = await api.post(`/systems/${systemId}/api-token`);
      setToken(result.token);
      setCopied(false);
      onTokenChange?.(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function remove() {
    setConfirmRemove(false);
    setRemoving(true);
    setError('');
    try {
      await api.del(`/systems/${systemId}/api-token`);
      setToken(null);
      onTokenChange?.(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving(false);
    }
  }

  function copyToken() {
    navigator.clipboard?.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleClose() {
    setToken(null);
    setError('');
    onClose?.();
  }

  return (
    <Modal open={open} title={`Token de API — ${systemName}`} onClose={handleClose}>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Permite que um script ou agente seu dispare <span className="font-medium">atualização</span> e{' '}
        <span className="font-medium">reinício</span> deste sistema direto por API, sem precisar entrar aqui no Geploy.
        Se a atualização encontrar algo suspeito, ela continua indo para aprovação de um admin — igual aconteceria
        clicando no botão.
      </p>

      {token && (
        <div className="mb-4 rounded-xl border border-amber-600/20 bg-amber-600/5 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
          <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            Guarde este token agora — ele não aparece de novo depois de fechar esta tela.
          </p>
          <div className="flex items-center gap-2">
            <input className="input mono flex-1 !text-xs" readOnly value={token} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-secondary shrink-0 !px-2.5" onClick={copyToken} title="Copiar">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      {token && (
        <div className="mb-4 flex flex-col gap-3">
          <CurlExample label="Atualizar" method="POST" path={`/api/trigger/${systemId}/update`} />
          <CurlExample label="Reiniciar" method="POST" path={`/api/trigger/${systemId}/restart`} />
          <CurlExample label="Ver status" method="GET" path={`/api/trigger/${systemId}/status`} />
        </div>
      )}

      {!token && hasToken && (
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Já existe um token gerado para este sistema (o valor não pode ser mostrado de novo). Gere um novo se
          precisar, ou remova se não for mais usar a automação.
        </p>
      )}

      {error && (
        <div className="alert-error mb-4">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {hasToken && (
          <button
            type="button"
            className="btn-secondary !text-rose-600 dark:!text-rose-300"
            disabled={removing}
            onClick={() => setConfirmRemove(true)}
          >
            {removing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Remover token
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          disabled={generating}
          onClick={() => (hasToken ? setConfirmGenerate(true) : generate())}
        >
          {generating ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
          {hasToken ? 'Gerar novo token' : 'Gerar token'}
        </button>
        <button type="button" className="btn-primary" onClick={handleClose}>
          Fechar
        </button>
      </div>

      <ConfirmDialog
        open={confirmGenerate}
        title="Gerar um novo token?"
        message="O token atual deste sistema para de funcionar assim que o novo for criado. Scripts que ainda usam o antigo vão passar a receber erro de autenticação."
        confirmLabel="Gerar novo token"
        onCancel={() => setConfirmGenerate(false)}
        onConfirm={generate}
      />

      <ConfirmDialog
        open={confirmRemove}
        title="Remover o token de API?"
        message="Qualquer script que use esse token para atualizar/reiniciar este sistema vai parar de funcionar."
        confirmLabel="Remover"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={remove}
      />
    </Modal>
  );
}
