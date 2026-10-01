import { useEffect, useState } from 'react';
import { Mail, Send, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast.jsx';

const emptyForm = {
  host: '',
  port: '587',
  secure: false,
  username: '',
  password: '',
  from_address: '',
  enabled: false,
};

export default function SmtpAdmin() {
  const { push } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api
      .get('/admin/smtp')
      .then((s) => {
        if (s?.host) {
          setForm({
            host: s.host || '',
            port: String(s.port || '587'),
            secure: Boolean(s.secure),
            username: s.username || '',
            password: '',
            from_address: s.from_address || '',
            enabled: Boolean(s.enabled),
          });
          setHasPassword(Boolean(s.has_password));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const result = await api.put('/admin/smtp', { ...form, port: Number(form.port) });
      setHasPassword(Boolean(result.has_password));
      setForm((f) => ({ ...f, password: '' }));
      push('Configuração de SMTP salva.', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!testTo) return;
    setTesting(true);
    try {
      await api.post('/admin/smtp/test', { to: testTo });
      push(`E-mail de teste enviado para ${testTo}.`, 'success');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-white">SMTP</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configuração de envio de e-mail para os alertas (atualização suspeita e sistema fora do ar).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="panel flex max-w-xl flex-col gap-4 p-6">
        <div className="flex items-center gap-2 text-slate-300">
          <Mail size={16} />
          <h2 className="font-semibold">Servidor de e-mail</h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Host SMTP</label>
            <input
              className="input mono"
              placeholder="smtp.office365.com"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Porta</label>
            <input
              className="input mono"
              placeholder="587"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Usuário</label>
            <input
              className="input"
              placeholder="sistemas@empresa.com.br"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Senha {hasPassword && <span className="text-slate-600">(já configurada)</span>}</label>
            <input
              type="password"
              className="input"
              placeholder={hasPassword ? 'Deixe em branco para manter' : ''}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label">E-mail remetente (From)</label>
          <input
            className="input"
            placeholder="sistemas@empresa.com.br"
            value={form.from_address}
            onChange={(e) => setForm({ ...form, from_address: e.target.value })}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-white/5"
            checked={form.secure}
            onChange={(e) => setForm({ ...form, secure: e.target.checked })}
          />
          Usar SSL/TLS direto (porta 465). Deixe desmarcado para STARTTLS (porta 587, mais comum).
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-white/5"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Habilitar envio de alertas por e-mail
        </label>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button type="submit" disabled={saving} className="btn-primary mt-1 w-full">
          {saving && <Loader2 size={16} className="animate-spin" />}
          Salvar configuração
        </button>
      </form>

      <div className="panel mt-6 max-w-xl p-6">
        <div className="mb-3 flex items-center gap-2 text-slate-300">
          <Send size={16} />
          <h2 className="font-semibold">Enviar e-mail de teste</h2>
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="seu.email@empresa.com.br"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
          <button type="button" className="btn-secondary shrink-0" disabled={testing || !testTo} onClick={handleTest}>
            {testing && <Loader2 size={15} className="animate-spin" />}
            Enviar teste
          </button>
        </div>
      </div>
    </div>
  );
}
