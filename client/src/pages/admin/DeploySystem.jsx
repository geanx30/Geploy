import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GitBranch,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  FileText,
  Plug,
  Send,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast.jsx';

const emptyCloneForm = {
  name: '',
  repo_url: '',
  git_auth_type: 'none',
  git_username: '',
  git_token: '',
  git_ssh_key_path: '',
};

export default function DeploySystem() {
  const { push } = useToast();
  const navigate = useNavigate();

  const [cloneForm, setCloneForm] = useState(emptyCloneForm);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState('');
  const [preview, setPreview] = useState(null); // resultado do /preview

  const [users, setUsers] = useState([]);
  const [envValues, setEnvValues] = useState({}); // { targetPath: { KEY: value } }
  const [setupForm, setSetupForm] = useState({
    owner_user_id: '',
    process_type: 'windows_service',
    service_name: '',
    site_name: '',
    app_pool_name: '',
    start_command: '',
    post_update_commands: '',
    access_url: '',
    public_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    api.get('/admin/users').then(setUsers).catch(() => {});
  }, []);

  async function handleClone(e) {
    e.preventDefault();
    setCloneError('');
    setCloning(true);
    setPreview(null);
    try {
      const result = await api.post('/admin/deploy-requests/preview', cloneForm);
      if (!result.success) {
        setCloneError(result.output);
        return;
      }
      setPreview(result);
      const initialEnv = {};
      for (const tpl of result.envTemplates) {
        initialEnv[tpl.targetPath] = Object.fromEntries(tpl.keys.map((k) => [k.key, k.defaultValue]));
      }
      setEnvValues(initialEnv);
      setSetupForm((f) => ({
        ...f,
        service_name: cloneForm.name.replace(/\s+/g, ''),
        access_url: result.suggestedPorts[0] ? `vm-sistemas:${result.suggestedPorts[0]}` : '',
      }));
    } catch (err) {
      setCloneError(err.message);
    } finally {
      setCloning(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    if (!setupForm.owner_user_id) {
      setSubmitError('Selecione o dono do sistema.');
      return;
    }
    if (setupForm.process_type === 'windows_service' && !setupForm.start_command) {
      setSubmitError('Informe o comando que inicia o sistema.');
      return;
    }

    setSubmitting(true);
    try {
      const env_files = preview.envTemplates.map((tpl) => ({
        targetPath: tpl.targetPath,
        values: envValues[tpl.targetPath] || {},
      }));

      await api.post('/admin/deploy-requests', {
        name: cloneForm.name,
        repo_url: cloneForm.repo_url,
        git_auth_type: cloneForm.git_auth_type,
        git_username: cloneForm.git_username,
        git_token: cloneForm.git_token,
        git_ssh_key_path: cloneForm.git_ssh_key_path,
        staging_path: preview.stagingPath,
        owner_user_id: Number(setupForm.owner_user_id),
        process_type: setupForm.process_type,
        service_name: setupForm.service_name,
        site_name: setupForm.site_name,
        app_pool_name: setupForm.app_pool_name,
        start_command: setupForm.start_command,
        post_update_commands: setupForm.post_update_commands,
        access_url: setupForm.access_url,
        public_url: setupForm.public_url,
        env_files,
      });

      push('Pedido de deploy enviado para aprovação de um admin.', 'success');
      navigate('/admin/approvals');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const hasRisk = preview?.findings?.length > 0;

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Novo sistema (deploy)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Clona um repositório, analisa o código e ajuda a configurar antes de criar o sistema de verdade. Toda
          solicitação — mesmo feita por um admin — fica pendente até outro admin aprovar em{' '}
          <span className="font-medium">Aprovações</span>.
        </p>
      </div>

      {!preview && (
        <form onSubmit={handleClone} className="panel flex max-w-xl flex-col gap-4 p-6">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <GitBranch size={16} />
            <h2 className="font-semibold">Repositório</h2>
          </div>

          <div>
            <label className="label">Nome do sistema</label>
            <input
              className="input"
              required
              value={cloneForm.name}
              onChange={(e) => setCloneForm({ ...cloneForm, name: e.target.value })}
              placeholder="Ex.: Painel Financeiro"
            />
          </div>
          <div>
            <label className="label">URL do repositório (git clone)</label>
            <input
              className="input mono"
              required
              value={cloneForm.repo_url}
              onChange={(e) => setCloneForm({ ...cloneForm, repo_url: e.target.value })}
              placeholder="https://github.com/empresa/sistema.git"
            />
          </div>

          <div className="rounded-xl border border-slate-900/10 p-4 dark:border-white/10">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <KeyRound size={14} />
              Credencial do Git (se o repositório for privado)
            </div>
            <select
              className="input mb-3"
              value={cloneForm.git_auth_type}
              onChange={(e) => setCloneForm({ ...cloneForm, git_auth_type: e.target.value })}
            >
              <option value="none">Nenhuma (repositório público)</option>
              <option value="https_token">HTTPS + Token (PAT)</option>
              <option value="ssh_key">Chave SSH</option>
            </select>
            {cloneForm.git_auth_type === 'https_token' && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="input"
                  placeholder="usuário git"
                  value={cloneForm.git_username}
                  onChange={(e) => setCloneForm({ ...cloneForm, git_username: e.target.value })}
                />
                <input
                  type="password"
                  className="input"
                  placeholder="token (PAT)"
                  value={cloneForm.git_token}
                  onChange={(e) => setCloneForm({ ...cloneForm, git_token: e.target.value })}
                />
              </div>
            )}
            {cloneForm.git_auth_type === 'ssh_key' && (
              <input
                className="input mono"
                placeholder="C:\Sistemas\keys\deploy_key"
                value={cloneForm.git_ssh_key_path}
                onChange={(e) => setCloneForm({ ...cloneForm, git_ssh_key_path: e.target.value })}
              />
            )}
          </div>

          {cloneError && (
            <div className="alert-error">
              <AlertCircle size={15} className="shrink-0" />
              {cloneError}
            </div>
          )}

          <button type="submit" disabled={cloning} className="btn-primary w-full">
            {cloning ? <Loader2 size={16} className="animate-spin" /> : <GitBranch size={16} />}
            {cloning ? 'Clonando e analisando...' : 'Clonar e analisar'}
          </button>
        </form>
      )}

      {preview && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className={hasRisk ? 'alert-warning' : 'alert-success'}>
            {hasRisk ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
            {hasRisk
              ? `${preview.findings.length} ponto(s) suspeito(s) encontrado(s) no código clonado.`
              : 'Nenhum padrão de risco encontrado no código clonado.'}
          </div>

          {hasRisk && (
            <div className="panel p-5">
              <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">Pontos suspeitos</h3>
              <ul className="flex flex-col gap-1.5">
                {preview.findings.map((f, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-amber-600/10 bg-amber-600/5 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/10 dark:bg-amber-500/5 dark:text-amber-200"
                  >
                    <span className="font-medium">{f.label}</span>
                    <span className="mono text-amber-700/70 dark:text-amber-300/70">
                      {' '}
                      — {f.file}:{f.line}
                    </span>
                    {f.snippet && <div className="mono mt-1 truncate text-amber-700/60 dark:text-amber-300/60">{f.snippet}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.envTemplates.length > 0 && (
            <div className="panel p-5">
              <div className="mb-3 flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <FileText size={16} />
                <h3 className="font-semibold">Configuração encontrada ({preview.envTemplates.length} arquivo(s))</h3>
              </div>
              <div className="flex flex-col gap-5">
                {preview.envTemplates.map((tpl) => (
                  <div key={tpl.targetPath}>
                    <p className="mono mb-2 text-xs text-slate-500">
                      {tpl.templatePath} → será salvo como <span className="font-medium">{tpl.targetPath}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {tpl.keys.map((k) => (
                        <div key={k.key}>
                          <label className="label">{k.key}</label>
                          <input
                            className="input mono"
                            value={envValues[tpl.targetPath]?.[k.key] ?? ''}
                            onChange={(e) =>
                              setEnvValues((prev) => ({
                                ...prev,
                                [tpl.targetPath]: { ...prev[tpl.targetPath], [k.key]: e.target.value },
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Plug size={16} />
              <h3 className="font-semibold">Serviço e porta</h3>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              Portas livres sugeridas:
              {preview.suggestedPorts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSetupForm((f) => ({ ...f, access_url: `vm-sistemas:${p}` }))}
                  className="rounded-md border border-slate-900/10 px-1.5 py-0.5 font-mono hover:border-brand-500/40 hover:text-brand-600 dark:border-white/10 dark:hover:text-brand-300"
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Dono do sistema</label>
                <select
                  className="input"
                  required
                  value={setupForm.owner_user_id}
                  onChange={(e) => setSetupForm({ ...setupForm, owner_user_id: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Tipo de processo</label>
                <select
                  className="input"
                  value={setupForm.process_type}
                  onChange={(e) => setSetupForm({ ...setupForm, process_type: e.target.value })}
                >
                  <option value="windows_service">Serviço Windows (NSSM)</option>
                  <option value="iis_site">Site IIS (configurado manualmente)</option>
                </select>
              </div>
            </div>

            {setupForm.process_type === 'windows_service' ? (
              <>
                <div className="mt-3">
                  <label className="label">Nome do serviço</label>
                  <input
                    className="input mono"
                    required
                    value={setupForm.service_name}
                    onChange={(e) => setSetupForm({ ...setupForm, service_name: e.target.value })}
                  />
                </div>
                <div className="mt-3">
                  <label className="label">Comando que inicia o sistema</label>
                  <input
                    className="input mono"
                    required
                    placeholder='"C:\Program Files\nodejs\node.exe" server.js'
                    value={setupForm.start_command}
                    onChange={(e) => setSetupForm({ ...setupForm, start_command: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    O Geploy cria o serviço Windows com esse comando (via NSSM) assim que o pedido for aprovado.
                  </p>
                </div>
              </>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nome do site IIS</label>
                  <input
                    className="input mono"
                    value={setupForm.site_name}
                    onChange={(e) => setSetupForm({ ...setupForm, site_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">App Pool</label>
                  <input
                    className="input mono"
                    value={setupForm.app_pool_name}
                    onChange={(e) => setSetupForm({ ...setupForm, app_pool_name: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="mt-3">
              <label className="label">Comandos de instalação / pós-atualização (opcional)</label>
              <textarea
                className="input mono min-h-[80px]"
                placeholder={'npm install\nnpm run build'}
                value={setupForm.post_update_commands}
                onChange={(e) => setSetupForm({ ...setupForm, post_update_commands: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-500">
                Rodam uma vez agora, na aprovação, antes do serviço iniciar pela primeira vez (ex.:{' '}
                <span className="mono">npm install</span>) — e também em toda atualização futura.
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="label">Endereço interno</label>
                <input
                  className="input mono"
                  value={setupForm.access_url}
                  onChange={(e) => setSetupForm({ ...setupForm, access_url: e.target.value })}
                />
              </div>
              <div>
                <label className="label">DNS público (opcional)</label>
                <input
                  className="input mono"
                  value={setupForm.public_url}
                  onChange={(e) => setSetupForm({ ...setupForm, public_url: e.target.value })}
                />
              </div>
            </div>
          </div>

          {submitError && (
            <div className="alert-error">
              <AlertCircle size={15} className="shrink-0" />
              {submitError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setPreview(null);
                setCloneForm(emptyCloneForm);
              }}
            >
              Cancelar e recomeçar
            </button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Enviar para aprovação
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
