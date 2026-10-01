import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext.jsx';

export default function ChangePasswordForm({ onSuccess, submitLabel = 'Trocar senha' }) {
  const { refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não bate com a nova senha.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      await refreshUser();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Falha ao trocar a senha');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="label">Senha atual</label>
        <input
          type="password"
          className="input"
          required
          autoFocus
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Nova senha</label>
        <input
          type="password"
          className="input"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="mínimo 8 caracteres"
        />
      </div>
      <div>
        <label className="label">Confirmar nova senha</label>
        <input
          type="password"
          className="input"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      <button type="submit" disabled={loading} className="btn-primary mt-1 w-full">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {submitLabel}
      </button>
    </form>
  );
}
