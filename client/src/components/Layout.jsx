import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Users, Boxes, ScrollText, LogOut, Rocket, ShieldAlert, Settings, Mail } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

const navItemClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-white/[0.07] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
  }`;

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-white/5 bg-slate-950/60 px-4 py-6 backdrop-blur">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-glow">
            <Rocket size={18} className="text-white" />
          </div>
          <div>
            <p className="text-base font-bold leading-tight tracking-tight text-white">Geploy</p>
            <p className="text-[11px] text-slate-500">Painel de deploy</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <NavLink to="/" end className={navItemClass}>
            <LayoutGrid size={17} />
            Meus sistemas
          </NavLink>

          {user?.role === 'admin' && (
            <>
              <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                Administração
              </p>
              <NavLink to="/admin/systems" className={navItemClass}>
                <Boxes size={17} />
                Sistemas
              </NavLink>
              <NavLink to="/admin/approvals" className={navItemClass}>
                <ShieldAlert size={17} />
                Aprovações
              </NavLink>
              <NavLink to="/admin/users" className={navItemClass}>
                <Users size={17} />
                Usuários
              </NavLink>
              <NavLink to="/admin/audit" className={navItemClass}>
                <ScrollText size={17} />
                Auditoria
              </NavLink>
              <NavLink to="/admin/smtp" className={navItemClass}>
                <Mail size={17} />
                SMTP
              </NavLink>
            </>
          )}
        </nav>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-800 text-xs font-bold uppercase text-slate-300">
            {user?.username?.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">{user?.username}</p>
            <p className="truncate text-xs text-slate-500">{user?.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
          </div>
          <button
            onClick={() => navigate('/account')}
            title="Minha conta"
            className="shrink-0 text-slate-500 hover:text-slate-200"
          >
            <Settings size={16} />
          </button>
          <button onClick={handleLogout} title="Sair" className="shrink-0 text-slate-500 hover:text-rose-300">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
