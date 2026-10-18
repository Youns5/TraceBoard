import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Card, TYPE_META } from './types';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

interface Props { cards: Card[]; onPick(id: string): void; onClose(): void }

export default function Palette({ cards, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const list = useMemo(() => {
    const n = norm(q.trim());
    const hay = (c: Card) => norm([c.title, c.content, c.notes, TYPE_META[c.type].label, ...c.sources].join(' '));
    return (n ? cards.filter((c) => hay(c).includes(n)) : cards).slice(0, 50);
  }, [q, cards]);

  const idx = Math.min(i, Math.max(0, list.length - 1));
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(idx + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(idx - 1, 0)); }
    else if (e.key === 'Enter' && list[idx]) { e.preventDefault(); onPick(list[idx].id); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="overlay" onPointerDown={onClose}>
      <div className="palette" role="dialog" aria-label="Rechercher une carte" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pal-in">
          <Icon name="search" size={16} />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} onKeyDown={key}
            placeholder="Rechercher une carte : nom, contenu, notes, source…" aria-label="Rechercher" />
          <kbd>Échap</kbd>
        </div>
        <ul className="pal-list">
          {list.map((c, n) => {
            const m = TYPE_META[c.type];
            return (
              <li key={c.id}>
                <button className={n === idx ? 'on' : ''} onMouseEnter={() => setI(n)} onClick={() => onPick(c.id)}>
                  <span className="chip" style={{ '--c': m.color } as CSSProperties}><Icon name={m.icon} size={14} /></span>
                  <span className="pal-t">{c.title || 'Sans titre'}<small>{c.content || m.label}</small></span>
                  <span className="pal-k">{m.label}</span>
                </button>
              </li>
            );
          })}
          {!list.length && <li className="pal-empty">{cards.length ? 'Aucun résultat.' : 'Aucune carte dans cette enquête.'}</li>}
        </ul>
      </div>
    </div>
  );
}
