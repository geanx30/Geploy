import { useState } from 'react';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';
import Modal from './Modal.jsx';
import { api } from '../api/client';

export default function GitCredentialsModal({ open, systemId, systemName, onCancel, onSaved }) {
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Informe o token de acesso.');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/systems/${systemId}/git-credentials`, { git_username: username, git_token: token });
      setUsername('');
      setToken('');
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={`Configurar acesso ao repositório — ${systemName}`} onClose={onCancel}>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        O administrador não cadastrou um token de acesso para este sistema. Para poder atualizar, cadastre aqui o seu
        próprio token (PAT) com permissão de leitura no repositório.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="label">Usuário git (opcional)</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            <KeyRound size={13} />
            Token (PAT)
          </label>
          <input
            type="password"
            className="input"
            required
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>

        {error && (
          <div className="alert-error">
            <AlertCircle size={15} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving && <Loader2 size={15} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
