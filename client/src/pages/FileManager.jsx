import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, CornerLeftUp, FileText, Folder, History, Loader2, Save } from 'lucide-react';
import { api } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useToast } from '../components/Toast.jsx';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const enc = encodeURIComponent;

export default function FileManager() {
  const { id } = useParams();
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const dir = searchParams.get('dir') || '';
  const file = searchParams.get('file') || '';

  const [systemName, setSystemName] = useState('');
  const [entries, setEntries] = useState([]);
  const [listError, setListError] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const [original, setOriginal] = useState('');
  const [content, setContent] = useState('');
  const [mtime, setMtime] = useState(null);
  const [fileError, setFileError] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backups, setBackups] = useState([]);
  const [pendingNav, setPendingNav] = useState(null);

  const dirty = Boolean(file) && !fileError && content !== original;

  useEffect(() => {
    api
      .get('/systems')
      .then((list) => setSystemName(list.find((s) => String(s.id) === id)?.name || ''))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    setListLoading(true);
    setListError('');
    api
      .get(`/systems/${id}/files?path=${enc(dir)}`)
      .then((r) => setEntries(r.entries))
      .catch((err) => {
        setEntries([]);
        setListError(err.message);
      })
      .finally(() => setListLoading(false));
  }, [id, dir]);

  async function loadBackups() {
    try {
      setBackups(await api.get(`/systems/${id}/file-backups?path=${enc(file)}`));
    } catch {
      setBackups([]);
    }
  }

  useEffect(() => {
    setFileError('');
    setBackups([]);
    if (!file) {
      setOriginal('');
      setContent('');
      return;
    }
    setFileLoading(true);
    api
      .get(`/systems/${id}/file?path=${enc(file)}`)
      .then((r) => {
        setOriginal(r.content);
        setContent(r.content);
        setMtime(r.mtime);
        loadBackups();
      })
      .catch((err) => {
        setOriginal('');
        setContent('');
        setFileError(err.message);
      })
      .finally(() => setFileLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, file]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function navigate(params) {
    if (dirty) setPendingNav(params);
    else setSearchParams(params);
  }

  const joinPath = (name) => (dir ? `${dir}/${name}` : name);
  const parentDir = dir.split('/').slice(0, -1).join('/');

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const result = await api.put(`/systems/${id}/file`, { path: file, content, expected_mtime: mtime });
      setOriginal(content);
      setMtime(result.mtime);
      push('Arquivo salvo.', 'success');
      loadBackups();
      api.get(`/systems/${id}/files?path=${enc(dir)}`).then((r) => setEntries(r.entries)).catch(() => {});
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function loadBackup(backupId) {
    if (!backupId) return;
    try {
      const r = await api.get(`/systems/${id}/file-backup?path=${enc(file)}&id=${enc(backupId)}`);
      setContent(r.content);
      push('Versão anterior carregada no editor. Revise e salve para restaurar.', 'info');
    } catch (err) {
      push(err.message, 'error');
    }
  }

  const crumbs = dir ? dir.split('/') : [];
  const isEnvFile = file.split('/').pop().toLowerCase().startsWith('.env');

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
        >
          <ArrowLeft size={14} />
          Voltar aos sistemas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Arquivos{systemName && ` — ${systemName}`}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Navegue pela pasta do sistema e edite arquivos de texto. Cada salvamento guarda uma cópia da versão anterior e
          fica registrado na auditoria.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="panel flex max-h-[calc(100vh-15rem)] min-h-[300px] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-900/10 px-3.5 py-2.5 text-xs dark:border-white/10">
            <button onClick={() => navigate({})} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
              raiz
            </button>
            {crumbs.map((name, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight size={12} className="text-slate-400" />
                <button
                  onClick={() => navigate({ dir: crumbs.slice(0, i + 1).join('/') })}
                  className="font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  {name}
                </button>
              </span>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-1.5">
            {listLoading && <p className="px-3 py-4 text-sm text-slate-500">Carregando...</p>}
            {listError && <div className="alert-error m-2">{listError}</div>}

            {!listLoading && !listError && dir && (
              <button
                onClick={() => navigate(parentDir ? { dir: parentDir } : {})}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05]"
              >
                <CornerLeftUp size={14} />
                ..
              </button>
            )}

            {!listLoading &&
              entries.map((e) => {
                const full = joinPath(e.name);
                const active = e.type === 'file' && full === file;
                return (
                  <button
                    key={e.name}
                    onClick={() => (e.type === 'dir' ? navigate({ dir: full }) : navigate({ dir, file: full }))}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                      active
                        ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300'
                        : 'text-slate-700 hover:bg-slate-900/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    {e.type === 'dir' ? (
                      <Folder size={14} className="shrink-0 text-amber-500" />
                    ) : (
                      <FileText size={14} className="shrink-0 text-slate-400" />
                    )}
                    <span className="mono min-w-0 flex-1 truncate text-[13px]">{e.name}</span>
                    {e.type === 'file' && <span className="shrink-0 text-[11px] text-slate-400">{formatSize(e.size)}</span>}
                  </button>
                );
              })}

            {!listLoading && !listError && entries.length === 0 && (
              <p className="px-3 py-4 text-sm text-slate-500">Pasta vazia.</p>
            )}
          </div>
        </div>

        <div className="panel flex min-h-[420px] flex-col overflow-hidden">
          {!file && (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
              Selecione um arquivo na lista para editar.
            </div>
          )}

          {file && (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-900/10 px-4 py-2.5 dark:border-white/10">
                <div className="min-w-0 flex-1">
                  <p className="mono truncate text-sm font-medium text-slate-900 dark:text-slate-100">{file}</p>
                  {dirty && <p className="text-[11px] text-amber-600 dark:text-amber-300">Alterações não salvas</p>}
                </div>

                {backups.length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    <History size={13} />
                    <select
                      className="input !w-auto !py-1.5 text-xs"
                      value=""
                      onChange={(e) => loadBackup(e.target.value)}
                    >
                      <option value="">Versões anteriores ({backups.length})</option>
                      {backups.map((b) => (
                        <option key={b.id} value={b.id}>
                          {new Date(b.created_at).toLocaleString('pt-BR')} — {formatSize(b.size)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button className="btn-primary !py-1.5" disabled={!dirty || saving} onClick={save}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar
                </button>
              </div>

              {isEnvFile && (
                <div className="alert-warning m-3 mb-0 !py-2 text-xs">
                  Este arquivo costuma conter segredos (senhas, chaves). As alterações valem na hora de salvar, mas o
                  sistema só lê o .env novamente quando for reiniciado.
                </div>
              )}

              {fileLoading && <p className="p-4 text-sm text-slate-500">Carregando arquivo...</p>}
              {fileError && <div className="alert-error m-3">{fileError}</div>}

              {!fileLoading && !fileError && (
                <textarea
                  className="input mono m-3 min-h-[320px] flex-1 resize-none overflow-auto whitespace-pre text-[13px] leading-relaxed"
                  style={{ height: 'calc(100vh - 22rem)' }}
                  wrap="off"
                  spellCheck={false}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                      e.preventDefault();
                      save();
                    }
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingNav)}
        title="Descartar alterações?"
        message="Você tem alterações não salvas neste arquivo. Se continuar, elas serão perdidas."
        confirmLabel="Descartar"
        onCancel={() => setPendingNav(null)}
        onConfirm={() => {
          setSearchParams(pendingNav);
          setPendingNav(null);
        }}
      />
    </div>
  );
}
