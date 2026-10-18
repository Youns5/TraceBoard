import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import Board, { BoardHandle } from './Board';
import { Icon, Logo } from './Icon';
import Palette from './Palette';
import { CardPanel, LinkPanel } from './Panel';
import { loadState, newInvestigation, parseImport, saveState } from './storage';
import { AppState, CARD_W, Card, CardType, DEFAULT_LINK_COLOR, Investigation, Link, Sel, TYPE_META, View, uid } from './types';

const ORDER: CardType[] = ['person', 'alias', 'photo', 'url', 'phone', 'document', 'text'];
const download = (name: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'enquete';

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [sel, setSel] = useState<Sel | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [toast, setToast] = useState('');
  const [palette, setPalette] = useState(false);
  const board = useRef<BoardHandle>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const stateRef = useRef(state); stateRef.current = state;

  const inv = state.investigations.find((i) => i.id === state.activeId) || state.investigations[0];
  const selCard = sel?.kind === 'card' ? inv.cards.find((c) => c.id === sel.id) : undefined;
  const selLink = sel?.kind === 'link' ? inv.links.find((l) => l.id === sel.id) : undefined;

  useEffect(() => {
    setStatus('saving');
    const t = setTimeout(() => setStatus(saveState(state) ? 'saved' : 'error'), 300);
    return () => clearTimeout(t);
  }, [state]);
  useEffect(() => {
    const f = () => saveState(stateRef.current);
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, []);

  const notify = useCallback((m: string) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? '' : t)), 3500); }, []);

  const patch = useCallback((fn: (i: Investigation) => Investigation, touch = true) =>
    setState((s) => ({ ...s, investigations: s.investigations.map((i) => (i.id === s.activeId ? { ...fn(i), updated: touch ? Date.now() : i.updated } : i)) })), []);

  const setView = useCallback((view: View) => patch((i) => ({ ...i, view }), false), [patch]);
  const moveCard = useCallback((id: string, x: number, y: number) =>
    patch((i) => ({ ...i, cards: i.cards.map((c) => (c.id === id ? { ...c, x, y } : c)) })), [patch]);
  const editCard = (id: string, p: Partial<Card>) => patch((i) => ({ ...i, cards: i.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const editLink = (id: string, p: Partial<Link>) => patch((i) => ({ ...i, links: i.links.map((l) => (l.id === id ? { ...l, ...p } : l)) }));

  // Cherche, en spirale autour du centre de la vue, un emplacement libre pour la nouvelle carte.
  const freeSpot = (cx: number, cy: number, cards: Card[]) => {
    const w = CARD_W + 24, h = 176 + 24;
    const busy = (x: number, y: number) => cards.some((c) => Math.abs(c.x - x) < w && Math.abs(c.y - y) < h);
    const x0 = Math.round(cx - CARD_W / 2), y0 = Math.round(cy - 48);
    for (let r = 0; r < 12; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = x0 + dx * w, y = y0 + dy * h;
          if (!busy(x, y)) return { x, y };
        }
      }
    }
    return { x: x0, y: y0 };
  };
  const addCard = (type: CardType) => {
    const ctr = board.current?.getCenter() || { x: 200, y: 200 };
    const pos = freeSpot(ctr.x, ctr.y, inv.cards);
    const c: Card = { id: uid(), type, title: TYPE_META[type].label, content: '', notes: '', sources: [], created: Date.now(), ...pos };
    patch((i) => ({ ...i, cards: [...i.cards, c] }));
    setSel({ kind: 'card', id: c.id }); setLinkMode(false); setLinkFrom(null);
  };
  const duplicate = (c: Card) => {
    const n = { ...c, id: uid(), x: c.x + 30, y: c.y + 30, title: c.title + ' (copie)', created: Date.now() };
    patch((i) => ({ ...i, cards: [...i.cards, n] }));
    setSel({ kind: 'card', id: n.id });
  };
  const deleteCard = (id: string) => {
    patch((i) => ({ ...i, cards: i.cards.filter((c) => c.id !== id), links: i.links.filter((l) => l.from !== id && l.to !== id) }));
    setSel(null);
  };
  const deleteLink = (id: string) => { patch((i) => ({ ...i, links: i.links.filter((l) => l.id !== id) })); setSel(null); };

  const onLinkClick = (id: string) => {
    if (!linkFrom) { setLinkFrom(id); return; }
    if (linkFrom === id) { setLinkFrom(null); return; }
    const l: Link = { id: uid(), from: linkFrom, to: id, label: '', color: DEFAULT_LINK_COLOR, style: 'solid', width: 2, arrow: true };
    patch((i) => ({ ...i, links: [...i.links, l] }));
    setLinkFrom(null); setSel({ kind: 'link', id: l.id });
  };
  const toggleLink = () => { setLinkMode((m) => !m); setLinkFrom(null); };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return; }
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        sel.kind === 'card' ? deleteCard(sel.id) : deleteLink(sel.id);
      } else if (e.key === 'Escape') { setLinkMode(false); setLinkFrom(null); setSel(null); setMenu(false); setPalette(false); }
      else if (e.key.toLowerCase() === 'l') { e.preventDefault(); toggleLink(); }
      else if (e.key.toLowerCase() === 'f') { e.preventDefault(); board.current?.fit(); }
      else { const type = ORDER.find((k) => TYPE_META[k].key === e.key); if (type) { e.preventDefault(); addCard(type); } }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const switchTo = (id: string) => { setState((s) => ({ ...s, activeId: id })); setSel(null); setLinkMode(false); setLinkFrom(null); setMenu(false); };
  const create = () => {
    const n = newInvestigation(`Enquête ${state.investigations.length + 1}`);
    n.view = { x: 300, y: 200, k: 1 };
    setMenu(false);
    setState((s) => ({ investigations: [...s.investigations, n], activeId: n.id }));
    setSel(null); setLinkMode(false); setLinkFrom(null);
  };
  const remove = (i: Investigation) => {
    if (!window.confirm(`Supprimer l’enquête « ${i.name} » ? Cette action est définitive.`)) return;
    setState((s) => {
      let list = s.investigations.filter((x) => x.id !== i.id);
      if (!list.length) list = [newInvestigation('Enquête 1')];
      return { investigations: list, activeId: s.activeId === i.id ? list[0].id : s.activeId };
    });
    setSel(null);
  };
  const rename = (name: string) => patch((i) => ({ ...i, name }));

  const exportOne = () => download(`traceboard-${slug(inv.name)}.json`, { app: 'TraceBoard', version: 1, investigations: [inv] });
  const exportAll = () => download('traceboard-toutes-les-enquetes.json', { app: 'TraceBoard', version: 1, investigations: state.investigations });
  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      const list = parseImport(await f.text());
      setState((s) => ({ investigations: [...s.investigations, ...list], activeId: list[0].id }));
      setSel(null);
      notify(`${list.length} enquête(s) importée(s).`);
    } catch (e) { notify((e as Error).message); }
  };

  const nCards = inv.cards.length, nLinks = inv.links.length;
  const pick = (id: string) => { setPalette(false); setSel({ kind: 'card', id }); setLinkMode(false); setLinkFrom(null); board.current?.focus(id); };
  const ago = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

  return (
    <div className="app">
      <header className="top">
        <button className="icon-btn menu-btn" onClick={() => setMenu((m) => !m)} aria-label="Enquêtes"><Icon name="menu" size={18} /></button>
        <div className="brand"><Logo /><span>Trace<b>Board</b></span></div>
        <span className="crumb-sep">/</span>
        <input className="inv-name" value={inv.name} onChange={(e) => rename(e.target.value)} aria-label="Nom de l’enquête" spellCheck={false} />
        <span className={'status ' + status}>
          <Icon name={status === 'error' ? 'alert' : 'check'} size={12} />
          {status === 'saved' ? 'Enregistré en local' : status === 'saving' ? 'Enregistrement…' : 'Stockage plein : exportez vos données'}
        </span>
        <div className="grow" />
        <button className="search-btn" onClick={() => setPalette(true)} aria-label="Rechercher">
          <Icon name="search" size={14} /><span>Rechercher</span><kbd>Ctrl K</kbd>
        </button>
        <button className="btn ghost sm" onClick={exportOne}><Icon name="download" size={14} /><span>Exporter</span></button>
        <button className="btn ghost sm" onClick={() => fileIn.current?.click()}><Icon name="upload" size={14} /><span>Importer</span></button>
        <input ref={fileIn} type="file" accept=".json,application/json" hidden onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
      </header>

      <div className="main">
        <aside className={'side' + (menu ? ' open' : '')}>
          <div className="side-h"><h3>Enquêtes</h3><button className="btn primary sm" onClick={create}><Icon name="plus" size={14} />Nouvelle</button></div>
          <ul className="invs">
            {state.investigations.map((i) => (
              <li key={i.id} className={i.id === inv.id ? 'on' : ''}>
                <button className="inv-btn" onClick={() => switchTo(i.id)}>
                  <b>{i.name || 'Sans nom'}</b>
                  <small>{i.cards.length} cartes · {i.links.length} liens · {ago(i.updated)}</small>
                </button>
                <button className="x" onClick={() => remove(i)} aria-label={`Supprimer ${i.name}`}><Icon name="trash" size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="side-f">
            <div className="row">
              <button className="btn ghost sm" onClick={exportAll}><Icon name="download" size={14} />Tout exporter</button>
              <button className="btn ghost sm" onClick={() => fileIn.current?.click()}><Icon name="upload" size={14} />Importer</button>
            </div>
            <p className="muted"><Icon name="lock" size={12} /> Données stockées uniquement dans ce navigateur. Aucun serveur, aucun envoi.</p>
          </div>
        </aside>
        {menu && <div className="scrim" onClick={() => setMenu(false)} />}

        <main className="stage">
          <Board
            ref={board} inv={inv} selected={sel} linkMode={linkMode} linkFrom={linkFrom}
            onView={setView} onMoveCard={moveCard} onSelect={setSel} onLinkClick={onLinkClick}
          />

          {nCards === 0 && (
            <div className="empty">
              <div className="empty-card">
                <h2>Nouveau tableau d’enquête</h2>
                <p>Ajoutez vos premiers éléments : personnes, pseudos, URL, numéros, documents. Reliez-les ensuite pour faire apparaître la structure.</p>
                <div className="empty-types">
                  {ORDER.map((t) => (
                    <button key={t} className="chip-btn" style={{ '--c': TYPE_META[t].color } as CSSProperties} onClick={() => addCard(t)}>
                      <Icon name={TYPE_META[t].icon} size={14} />{TYPE_META[t].label}
                    </button>
                  ))}
                </div>
                <button className="btn ghost sm" onClick={() => fileIn.current?.click()}><Icon name="upload" size={14} />Importer une enquête (.json)</button>
              </div>
            </div>
          )}

          {linkMode && (
            <div className="hint">{linkFrom ? 'Sélectionnez la carte de destination' : 'Mode liaison : sélectionnez la carte de départ'}<kbd>Échap</kbd></div>
          )}

          <nav className="dock" aria-label="Outils">
            {ORDER.map((t) => (
              <button key={t} className="dock-btn" style={{ '--c': TYPE_META[t].color } as CSSProperties} onClick={() => addCard(t)} title={`${TYPE_META[t].label} (${TYPE_META[t].key})`}>
                <Icon name={TYPE_META[t].icon} size={16} /><span>{TYPE_META[t].label}</span><kbd>{TYPE_META[t].key}</kbd>
              </button>
            ))}
            <span className="sep" />
            <button className={'dock-btn link' + (linkMode ? ' on' : '')} onClick={toggleLink} title="Relier deux cartes (L)">
              <Icon name="link" size={16} /><span>Relier</span><kbd>L</kbd>
            </button>
            <button className="dock-btn" disabled={!sel} onClick={() => sel && (sel.kind === 'card' ? deleteCard(sel.id) : deleteLink(sel.id))} title="Supprimer la sélection (Suppr)">
              <Icon name="trash" size={16} /><span>Supprimer</span>
            </button>
          </nav>

          <div className="stats">{nCards} cartes · {nLinks} liens</div>
        </main>

        {selCard && (
          <CardPanel
            card={selCard} cards={inv.cards} links={inv.links}
            onChange={(p) => editCard(selCard.id, p)} onDelete={() => deleteCard(selCard.id)}
            onDuplicate={() => duplicate(selCard)} onClose={() => setSel(null)}
            onSelectLink={(id) => setSel({ kind: 'link', id })} onError={notify}
          />
        )}
        {selLink && (
          <LinkPanel link={selLink} cards={inv.cards} onChange={(p) => editLink(selLink.id, p)}
            onDelete={() => deleteLink(selLink.id)} onClose={() => setSel(null)} />
        )}
      </div>
      {palette && <Palette cards={inv.cards} onPick={pick} onClose={() => setPalette(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
