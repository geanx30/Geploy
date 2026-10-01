import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { getStoredTheme, applyTheme } from '../theme.js';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getStoredTheme);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
      className="shrink-0 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
