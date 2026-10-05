/**
 * O servidor guarda datas no formato "YYYY-MM-DD HH:MM:SS" em UTC (via SQLite
 * datetime('now')). Sem o "Z", o JS trata essa string como horário LOCAL em
 * vez de UTC, então toda data aparecia adiantada no fuso do servidor
 * (ex.: 3h a mais no horário de Brasília). Isso normaliza antes de formatar.
 */
export function formatDateTime(sqliteUtcString) {
  if (!sqliteUtcString) return '—';
  const iso = sqliteUtcString.includes('T') ? sqliteUtcString : `${sqliteUtcString.replace(' ', 'T')}Z`;
  return new Date(iso).toLocaleString('pt-BR');
}
