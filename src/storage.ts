import { AppState, Card, Investigation, Link, DEFAULT_LINK_COLOR, TYPE_META, uid } from './types';

const KEY = 'traceboard.v1';
const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

export function newInvestigation(name: string): Investigation {
  return { id: uid(), name, cards: [], links: [], view: { x: 0, y: 0, k: 1 }, updated: Date.now() };
}

export function sanitizeInv(raw: any): Investigation | null {
  if (!raw || typeof raw !== 'object') return null;
  const types = Object.keys(TYPE_META);
  const cards: Card[] = (Array.isArray(raw.cards) ? raw.cards : [])
    .filter((c: any) => c && typeof c === 'object' && typeof c.id === 'string')
    .map((c: any): Card => ({
      id: c.id,
      type: types.includes(c.type) ? c.type : 'text',
      title: str(c.title), content: str(c.content), notes: str(c.notes),
      sources: Array.isArray(c.sources) ? c.sources.filter((s: unknown) => typeof s === 'string') : [],
      x: num(c.x, 0), y: num(c.y, 0),
      image: typeof c.image === 'string' && c.image.startsWith('data:image/') ? c.image : undefined,
      created: num(c.created, Date.now()),
    }));
  const ids = new Set(cards.map((c) => c.id));
  const styles = ['solid', 'dashed', 'dotted'];
  const links: Link[] = (Array.isArray(raw.links) ? raw.links : [])
    .filter((l: any) => l && ids.has(l.from) && ids.has(l.to))
    .map((l: any): Link => ({
      id: typeof l.id === 'string' ? l.id : uid(), from: l.from, to: l.to, label: str(l.label),
      color: /^#[0-9a-f]{6}$/i.test(str(l.color)) ? l.color : DEFAULT_LINK_COLOR,
      style: styles.includes(l.style) ? l.style : 'solid',
      width: Math.min(8, Math.max(1, num(l.width, 2))), arrow: l.arrow !== false,
    }));
  const v = raw.view || {};
  return {
    id: typeof raw.id === 'string' ? raw.id : uid(),
    name: str(raw.name, 'Enquête importée') || 'Enquête importée',
    cards, links,
    view: { x: num(v.x, 0), y: num(v.y, 0), k: Math.min(3, Math.max(0.15, num(v.k, 1))) },
    updated: num(raw.updated, Date.now()),
  };
}

export function parseImport(text: string): Investigation[] {
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error('Fichier JSON invalide.'); }
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.investigations) ? data.investigations : data?.cards ? [data] : [];
  const out = list.map(sanitizeInv).filter((i): i is Investigation => !!i);
  if (!out.length) throw new Error('Aucune enquête TraceBoard trouvée dans ce fichier.');
  return out.map((i) => ({ ...i, id: uid() }));
}

const LEGACY_DEMO = 'Opération DÉMO';

function fresh(): AppState {
  const i = newInvestigation('Enquête 1');
  return { investigations: [i], activeId: i.id };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      let invs: Investigation[] = (Array.isArray(p.investigations) ? p.investigations : [])
        .map(sanitizeInv).filter((i: Investigation | null): i is Investigation => !!i);
      // Les anciennes versions créaient une enquête de démonstration : on la retire.
      const real = invs.filter((i) => i.name !== LEGACY_DEMO);
      if (real.length) invs = real;
      else if (invs.length && invs.every((i) => i.name === LEGACY_DEMO)) invs = [];
      if (invs.length) return { investigations: invs, activeId: invs.some((i) => i.id === p.activeId) ? p.activeId : invs[0].id };
    }
  } catch { /* données corrompues : on repart d'un tableau vide */ }
  return fresh();
}

export function saveState(s: AppState): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}
