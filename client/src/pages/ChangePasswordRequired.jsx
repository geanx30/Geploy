import { KeyRound } from 'lucide-react';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';

export default function ChangePasswordRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-glow">
            <KeyRound size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Troque sua senha</h1>
          <p className="mt-1 text-sm text-slate-500">
            Por segurança, você precisa definir uma nova senha antes de continuar.
          </p>
        </div>

        <div className="panel p-6">
          <ChangePasswordForm submitLabel="Trocar senha e continuar" />
        </div>
      </div>
    </div>
  );
}
