import { CSSProperties, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import Board, { BoardHandle } from './Board';
import { addFile, askPersistent, collectFiles, copyAttachments, dataUrlToBlob, gcBlobs, putBlob } from './blobs';
import { Icon, Logo } from './Icon';
import Palette from './Palette';
import { CardPanel, LinkPanel } from './Panel';
import { loadState, newInvestigation, parseImport, saveState } from './storage';
import { AppState, CARD_W, Card, cardH, CardType, DEFAULT_LINK_COLOR, Investigation, Link, Sel, TYPE_META, View, uid } from './types';

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
    askPersistent();
    const used = new Set(stateRef.current.investigations.flatMap((i) => i.cards.flatMap((c) => (c.attachments || []).map((a) => a.id))));
    gcBlobs(used);
  }, []);

  // Historique annuler / rétablir (les déplacements rapprochés sont regroupés en une seule étape).
  const hist = useRef({ past: [] as Investigation[][], future: [] as Investigation[][], last: state.investigations, t: 0, skip: false });
  const [hv, setHv] = useState(0);
  useEffect(() => {
    const h = hist.current, cur = state.investigations;
    if (h.skip) { h.skip = false; h.last = cur; return; }
    if (cur === h.last) return;
    const changed = cur.length !== h.last.length || cur.some((i, n) => {
      const o = h.last[n]; return !o || o.id !== i.id || o.cards !== i.cards || o.links !== i.links || o.name !== i.name;
    });
    if (changed && Date.now() - h.t > 600) {
      h.past.push(h.last); if (h.past.length > 100) h.past.shift();
      h.future = []; setHv((n) => n + 1);
    }
    if (changed) h.t = Date.now();
    h.last = cur;
  }, [state.investigations]);
  const restore = (target: Investigation[]) => {
    hist.current.skip = true;
    setState((s) => {
      const invs = target.map((i) => { const now = s.investigations.find((x) => x.id === i.id); return now ? { ...i, view: now.view } : i; });
      return { investigations: invs, activeId: invs.some((i) => i.id === s.activeId) ? s.activeId : invs[0].id };
    });
    setSel(null); setLinkFrom(null); setHv((n) => n + 1);
  };
  const undo = () => { const h = hist.current, p = h.past.pop(); if (!p) return; h.future.push(stateRef.current.investigations); restore(p); };
  const redo = () => { const h = hist.current, f = h.future.pop(); if (!f) return; h.past.push(stateRef.current.investigations); restore(f); };
  const canUndo = hv >= 0 && hist.current.past.length > 0, canRedo = hv >= 0 && hist.current.future.length > 0;
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
  const duplicate = async (c: Card) => {
    const attachments = await copyAttachments(c.attachments).catch(() => []);
    const n = { ...c, attachments, id: uid(), x: c.x + 30, y: c.y + 30, title: c.title + ' (copie)', created: Date.now() };
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
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
        if (k === 'y') { e.preventDefault(); redo(); return; }
      }
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

  const doExport = async (name: string, list: Investigation[]) => {
    try {
      const files = await collectFiles(list.flatMap((i) => i.cards));
      download(name, { app: 'TraceBoard', version: 2, investigations: list, files });
    } catch { notify('Export impossible.'); }
  };
  const exportOne = () => doExport(`traceboard-${slug(inv.name)}.json`, [inv]);
  const exportAll = () => doExport('traceboard-toutes-les-enquetes.json', state.investigations);
  const importFile = async (f?: File) => {
    if (!f) return;
    try {
      const { list, files } = parseImport(await f.text());
      // Les fichiers joints reçoivent de nouveaux identifiants pour ne jamais être partagés entre enquêtes.
      for (const i of list) for (const c of i.cards) {
        const kept: typeof c.attachments = [];
        for (const a of c.attachments || []) {
          const data = files[a.id];
          if (!data) continue;
          const id = uid();
          await putBlob(id, await dataUrlToBlob(data));
          kept.push({ ...a, id });
        }
        c.attachments = kept;
      }
      setState((s) => ({ investigations: [...s.investigations, ...list], activeId: list[0].id }));
      setSel(null);
      notify(`${list.length} enquête(s) importée(s).`);
    } catch (e) { notify((e as Error).message || 'Import impossible.'); }
  };

  // Glisser-déposer de fichiers : sur une carte = pièce jointe ; sur le fond = nouvelle carte (Photo ou Document).
  const dropFiles = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length || !board.current) return;
    const at = board.current.toWorld(e.clientX, e.clientY);
    const target = inv.cards.find((c) => at.x >= c.x && at.x <= c.x + CARD_W && at.y >= c.y && at.y <= c.y + cardH(c));
    const ok: { f: File; a: Awaited<ReturnType<typeof addFile>> }[] = [];
    for (const f of files) {
      try { ok.push({ f, a: await addFile(f) }); } catch (err) { notify((err as Error).message || 'Fichier non ajouté.'); }
    }
    if (!ok.length) return;
    if (target) {
      patch((i) => ({ ...i, cards: i.cards.map((c) => (c.id === target.id ? { ...c, attachments: [...(c.attachments || []), ...ok.map((o) => o.a)] } : c)) }));
      setSel({ kind: 'card', id: target.id });
      notify(`${ok.length} fichier(s) joint(s) à « ${target.title || 'Sans titre'} ».`);
      return;
    }
    const made: Card[] = ok.map(({ a }, n) => {
      const type: CardType = a.mime.startsWith('image/') ? 'photo' : 'document';
      return { id: uid(), type, title: a.name.replace(/\.[^.]+$/, '') || TYPE_META[type].label, content: type === 'document' ? a.name : '', notes: '', sources: [], created: Date.now(), attachments: [a], x: Math.round(at.x - CARD_W / 2 + n * (CARD_W + 24)), y: Math.round(at.y - 48) };
    });
    patch((i) => ({ ...i, cards: [...i.cards, ...made] }));
    setSel({ kind: 'card', id: made[made.length - 1].id });
    notify(`${made.length} carte(s) créée(s) à partir des fichiers.`);
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

        <main className="stage" onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={dropFiles}>
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
            <button className="dock-btn" disabled={!canUndo} onClick={undo} title="Annuler (Ctrl Z)"><Icon name="undo" size={16} /><span>Annuler</span></button>
            <button className="dock-btn" disabled={!canRedo} onClick={redo} title="Rétablir (Ctrl Shift Z)"><Icon name="redo" size={16} /><span>Rétablir</span></button>
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
