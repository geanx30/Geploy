import { useNavigate } from 'react-router-dom';
import { UserIcon, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';

export default function Account() {
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Minha conta</h1>
        <p className="mt-1 text-sm text-slate-500">Informações da sua conta e segurança.</p>
      </div>

      <div className="mb-6 panel flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-800 text-sm font-bold uppercase text-slate-100">
          {user?.username?.slice(0, 2)}
        </div>
        <div>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{user?.username}</p>
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            {user?.role === 'admin' ? <ShieldCheck size={14} /> : <UserIcon size={14} />}
            {user?.role === 'admin' ? 'Administrador' : 'Usuário'}
          </p>
        </div>
      </div>

      <div className="panel max-w-md p-6">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound size={16} className="text-slate-500 dark:text-slate-400" />
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Trocar senha</h2>
        </div>
        <ChangePasswordForm
          submitLabel="Salvar nova senha"
          onSuccess={() => {
            push('Senha alterada com sucesso.', 'success');
            navigate('/');
          }}
        />
      </div>
    </div>
  );
}
