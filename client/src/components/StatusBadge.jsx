export default function StatusBadge({ status }) {
  const map = {
    running: { cls: 'badge-ok', dot: 'bg-emerald-400', label: 'Rodando' },
    stopped: { cls: 'badge-off', dot: 'bg-slate-400', label: 'Parado' },
    error: { cls: 'badge-err', dot: 'bg-rose-400', label: 'Erro' },
    checking: { cls: 'badge-pending', dot: 'bg-amber-400', label: 'Verificando' },
    unknown: { cls: 'badge-off', dot: 'bg-slate-500', label: 'Desconhecido' },
  };
  const s = map[status] || map.unknown;

  return (
    <span className={s.cls}>
      <span className={`dot ${s.dot}`} />
      {s.label}
    </span>
  );
}
