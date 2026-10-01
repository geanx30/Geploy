import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext.jsx';
import SystemCard from '../components/SystemCard.jsx';
import OutputDrawer from '../components/OutputDrawer.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState({ open: false });

  useEffect(() => {
    api
      .get('/systems')
      .then(setSystems)
      .finally(() => setLoading(false));
  }, []);

  function openOutput({ title, running, result }) {
    setDrawer({ open: true, title, running, result });
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {user?.role === 'admin' ? 'Todos os sistemas' : 'Meus sistemas'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Atualize, inicie, pare ou reinicie seus sistemas diretamente por aqui.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando...</p>}

      {!loading && systems.length === 0 && (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Inbox size={32} className="text-slate-600" />
          <p className="text-slate-400">Nenhum sistema cadastrado para você ainda.</p>
          <p className="text-sm text-slate-600">Peça a um administrador para cadastrar seu sistema.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {systems.map((s) => (
          <SystemCard
            key={s.id}
            system={s}
            ownerLabel={user?.role === 'admin' ? s.owner_username : null}
            onOpenOutput={openOutput}
          />
        ))}
      </div>

      <OutputDrawer
        open={drawer.open}
        title={drawer.title}
        running={drawer.running}
        result={drawer.result}
        onClose={() => setDrawer({ open: false })}
      />
    </div>
  );
}
