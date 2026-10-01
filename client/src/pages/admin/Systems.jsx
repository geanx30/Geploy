import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Server, Globe, KeyRound, Terminal, Link2 } from 'lucide-react';
import { api } from '../../api/client';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useToast } from '../../components/Toast.jsx';

const emptyForm = {
  name: '',
  owner_user_id: '',
  repo_path: '',
  process_type: 'windows_service',
  service_name: '',
  site_name: '',
  app_pool_name: '',
  git_auth_type: 'none',
  git_username: '',
  git_token: '',
  git_ssh_key_path: '',
  post_update_commands: '',
  access_url: '',
  public_url: '',
};

export default function SystemsAdmin() {
  const { push } = useToast();
  const [systems, setSystems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { mode, system }
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    Promise.all([api.get('/admin/systems'), api.get('/admin/users')])
      .then(([s, u]) => {
        setSystems(s);
        setUsers(u);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function openCreate() {
    setForm(emptyForm);
    setError('');
    setModal({ mode: 'create' });
  }

  function openEdit(system) {
    setForm({
      name: system.name,
      owner_user_id: String(system.owner_user_id),
      repo_path: system.repo_path,
      process_type: system.process_type,
      service_name: system.service_name || '',
      site_name: system.site_name || '',
      app_pool_name: system.app_pool_name || '',
      git_auth_type: system.git_auth_type,
      git_username: system.git_username || '',
      git_token: '',
      git_ssh_key_path: system.git_ssh_key_path || '',
      post_update_commands: system.post_update_commands || '',
      access_url: system.access_url || '',
      public_url: system.public_url || '',
    });
    setError('');
    setModal({ mode: 'edit', system });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const payload = { ...form, owner_user_id: Number(form.owner_user_id) };
    try {
      if (modal.mode === 'create') {
        await api.post('/admin/systems', payload);
        push('Sistema cadastrado.', 'success');
      } else {
        await api.put(`/admin/systems/${modal.system.id}`, payload);
        push('Sistema atualizado.', 'success');
      }
      setModal(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    try {
      await api.del(`/admin/systems/${deleteTarget.id}`);
      push('Sistema removido.', 'success');
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
          <h1 className="text-2xl font-bold tracking-tight text-white">Sistemas</h1>
          <p className="mt-1 text-sm text-slate-500">Cadastre os sistemas e vincule cada um ao seu dono.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} />
          Novo sistema
        </button>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3 font-medium">Nome</th>
              <th className="px-5 py-3 font-medium">Dono</th>
              <th className="px-5 py-3 font-medium">Tipo</th>
              <th className="px-5 py-3 font-medium">Pasta</th>
              <th className="px-5 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {!loading &&
              systems.map((s) => (
                <tr key={s.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-5 py-3 font-medium text-slate-200">{s.name}</td>
                  <td className="px-5 py-3 text-slate-400">{s.owner_username}</td>
                  <td className="px-5 py-3">
                    <span className="badge-off">
                      {s.process_type === 'iis_site' ? <Globe size={12} /> : <Server size={12} />}
                      {s.process_type === 'iis_site' ? 'Site IIS' : 'Serviço'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="mono text-xs text-slate-500">{s.repo_path}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button className="btn-ghost !px-2.5" title="Editar" onClick={() => openEdit(s)}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="btn-ghost !px-2.5 hover:!text-rose-300"
                        title="Remover"
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!loading && systems.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhum sistema cadastrado.</p>
        )}
      </div>

      <Modal
        open={Boolean(modal)}
        title={modal?.mode === 'create' ? 'Novo sistema' : `Editar ${modal?.system?.name}`}
        onClose={() => setModal(null)}
        width="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nome</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Dono</label>
              <select
                className="input"
                required
                value={form.owner_user_id}
                onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}
              >
                <option value="" disabled>
                  Selecione...
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Pasta do repositório (no servidor)</label>
            <input
              className="input mono"
              required
              placeholder="C:\Sistemas\NomeDoSistema"
              value={form.repo_path}
              onChange={(e) => setForm({ ...form, repo_path: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label flex items-center gap-1.5">
                <Link2 size={13} />
                Endereço interno (opcional)
              </label>
              <input
                className="input mono"
                placeholder="vm-sistemas:3000"
                value={form.access_url}
                onChange={(e) => setForm({ ...form, access_url: e.target.value })}
              />
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <Link2 size={13} />
                DNS público (opcional)
              </label>
              <input
                className="input mono"
                placeholder="gcontrol.grupogadens.com.br"
                value={form.public_url}
                onChange={(e) => setForm({ ...form, public_url: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Tipo de processo</label>
            <select
              className="input"
              value={form.process_type}
              onChange={(e) => setForm({ ...form, process_type: e.target.value })}
            >
              <option value="windows_service">Serviço Windows (NSSM)</option>
              <option value="iis_site">Site / App Pool IIS</option>
            </select>
          </div>

          {form.process_type === 'windows_service' ? (
            <div>
              <label className="label">Nome do serviço</label>
              <input
                className="input mono"
                required
                placeholder="MeuSistemaService"
                value={form.service_name}
                onChange={(e) => setForm({ ...form, service_name: e.target.value })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nome do site IIS</label>
                <input
                  className="input mono"
                  required
                  value={form.site_name}
                  onChange={(e) => setForm({ ...form, site_name: e.target.value })}
                />
              </div>
              <div>
                <label className="label">App Pool (opcional)</label>
                <input
                  className="input mono"
                  value={form.app_pool_name}
                  onChange={(e) => setForm({ ...form, app_pool_name: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/10 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
              <KeyRound size={14} />
              Credencial do Git
            </div>
            <label className="label">Autenticação</label>
            <select
              className="input mb-3"
              value={form.git_auth_type}
              onChange={(e) => setForm({ ...form, git_auth_type: e.target.value })}
            >
              <option value="none">Nenhuma (repositório público ou já configurado)</option>
              <option value="https_token">HTTPS + Token (PAT)</option>
              <option value="ssh_key">Chave SSH</option>
            </select>

            {form.git_auth_type === 'https_token' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Usuário git</label>
                  <input
                    className="input"
                    value={form.git_username}
                    onChange={(e) => setForm({ ...form, git_username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Token (PAT)</label>
                  <input
                    type="password"
                    className="input"
                    placeholder={modal?.mode === 'edit' ? 'Deixe em branco para manter' : ''}
                    value={form.git_token}
                    onChange={(e) => setForm({ ...form, git_token: e.target.value })}
                  />
                </div>
              </div>
            )}

            {form.git_auth_type === 'ssh_key' && (
              <div>
                <label className="label">Caminho da chave privada</label>
                <input
                  className="input mono"
                  placeholder="C:\Sistemas\keys\sistema_deploy_key"
                  value={form.git_ssh_key_path}
                  onChange={(e) => setForm({ ...form, git_ssh_key_path: e.target.value })}
                />
              </div>
            )}
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Terminal size={13} />
              Comandos pós-atualização (opcional)
            </label>
            <textarea
              className="input mono min-h-[88px] resize-y"
              placeholder={'npm install\nnpm run build\nnode scripts/init-db.js'}
              value={form.post_update_commands}
              onChange={(e) => setForm({ ...form, post_update_commands: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Um comando por linha, executado nessa ordem na pasta do repositório logo após o <code className="mono">git pull</code>.
              Para na primeira falha.
            </p>
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

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
        title={`Remover ${deleteTarget?.name}?`}
        message="O sistema deixará de aparecer para o dono. Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
