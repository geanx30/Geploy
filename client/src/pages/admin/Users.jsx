import { formatDateTime } from '../../utils/date.js';
import { useEffect, useState } from 'react';
import { Plus, KeyRound, Trash2, ShieldCheck, UserIcon } from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useToast } from '../../components/Toast.jsx';

const emptyForm = { username: '', email: '', password: '', confirmPassword: '', role: 'user' };

export default function UsersAdmin() {
  const { push } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { mode: 'create' | 'edit', user }
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api
      .get('/admin/users')
      .then(setUsers)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function openCreate() {
    setForm(emptyForm);
    setError('');
    setModal({ mode: 'create' });
  }

  function openEdit(user) {
    setForm({ username: user.username, email: user.email || '', password: '', confirmPassword: '', role: user.role });
    setError('');
    setModal({ mode: 'edit', user });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password && form.password !== form.confirmPassword) {
      setError('A confirmação não bate com a senha.');
      return;
    }
    if (form.password && form.password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    try {
      if (modal.mode === 'create') {
        await api.post('/admin/users', form);
        push('Usuário criado com sucesso. Ele vai precisar trocar a senha no primeiro login.', 'success');
      } else {
        await api.put(`/admin/users/${modal.user.id}`, {
          password: form.password || undefined,
          role: form.role,
          email: form.email || undefined,
        });
        push(
          form.password ? 'Senha resetada. O usuário vai precisar trocá-la no próximo login.' : 'Usuário atualizado.',
          'success'
        );
      }
      setModal(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    try {
      await api.del(`/admin/users/${deleteTarget.id}`);
      push('Usuário removido.', 'success');
      setDeleteTarget(null);
      load();
    } catch (err) {
      push(err.message, 'error');
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Usuários</h1>
          <p className="mt-1 text-sm text-slate-500">Gerencie quem pode acessar o Geploy.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} />
          Novo usuário
        </button>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-900/10 text-xs uppercase tracking-wide text-slate-500 dark:border-white/10">
              <th className="px-5 py-3 font-medium">Usuário</th>
              <th className="px-5 py-3 font-medium">E-mail</th>
              <th className="px-5 py-3 font-medium">Perfil</th>
              <th className="px-5 py-3 font-medium">Criado em</th>
              <th className="px-5 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/5 dark:divide-white/5">
            {!loading &&
              users.map((u) => (
                <tr key={u.id} className="transition hover:bg-slate-900/[0.02] dark:hover:bg-white/[0.02]">
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-200">{u.username}</td>
                  <td className="px-5 py-3 text-slate-400">{u.email || <span className="text-slate-600">—</span>}</td>
                  <td className="px-5 py-3">
                    <span className={u.role === 'admin' ? 'badge-ok' : 'badge-off'}>
                      {u.role === 'admin' ? <ShieldCheck size={12} /> : <UserIcon size={12} />}
                      {u.role === 'admin' ? 'Admin' : 'Usuário'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{formatDateTime(u.created_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button className="btn-ghost !px-2.5" title="Editar / resetar senha" onClick={() => openEdit(u)}>
                        <KeyRound size={15} />
                      </button>
                      <button
                        className="btn-ghost !px-2.5 hover:!text-rose-600 dark:hover:!text-rose-300"
                        title="Remover"
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhum usuário cadastrado.</p>
        )}
      </div>

      <Modal open={Boolean(modal)} title={modal?.mode === 'create' ? 'Novo usuário' : `Editar ${modal?.user?.username}`} onClose={() => setModal(null)}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {modal?.mode === 'create' && (
            <div>
              <label className="label">Usuário</label>
              <input
                className="input"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
          )}
          <div>
            <label className="label">E-mail (para receber alertas)</label>
            <input
              type="email"
              className="input"
              placeholder="nome@empresa.com.br"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{modal?.mode === 'create' ? 'Senha' : 'Nova senha (opcional)'}</label>
            <input
              type="password"
              className="input"
              required={modal?.mode === 'create'}
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={modal?.mode === 'edit' ? 'Deixe em branco para manter' : 'mínimo 8 caracteres'}
            />
          </div>
          {(modal?.mode === 'create' || form.password) && (
            <div>
              <label className="label">Confirmar senha</label>
              <input
                type="password"
                className="input"
                required={modal?.mode === 'create' || Boolean(form.password)}
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              />
            </div>
          )}
          <div>
            <label className="label">Perfil</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          <p className="text-xs text-slate-500">
            {modal?.mode === 'create'
              ? 'O usuário vai precisar trocar essa senha ao fazer o primeiro login.'
              : form.password
                ? 'Ao salvar uma nova senha, o usuário vai precisar trocá-la no próximo login.'
                : null}
          </p>

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Remover ${deleteTarget?.username}?`}
        message="O usuário perderá acesso imediatamente. Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
