import { CSSProperties, PointerEvent as RPE, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icon } from './Icon';
import { getBlob, isImage } from './blobs';
import { CARD_W, Card, Investigation, Sel, TYPE_META, View, cardH } from './types';

// Aperçu d'une carte Photo : image principale, sinon première image jointe, sinon « Aucune image ».
function PhotoPreview({ c }: { c: Card }) {
  const att = (c.attachments || []).find(isImage);
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (c.image || !att) { setUrl(''); return; }
    let u = ''; let alive = true;
    getBlob(att.id).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => undefined);
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [c.image, att?.id]);
  const src = c.image || url;
  if (src) return <img src={src} alt="" draggable={false} />;
  if (att) return <div className="noimg"><Icon name="image" size={18} />Chargement…</div>;
  return <div className="noimg"><Icon name="image" size={18} />Aucune image</div>;
}


export interface BoardHandle { getCenter(): { x: number; y: number }; fit(): void; focus(id: string): void; zoomBy(f: number): void; toWorld(clientX: number, clientY: number): { x: number; y: number } }

interface Props {
  inv: Investigation;
  selected: Sel | null;
  linkMode: boolean;
  linkFrom: string | null;
  onView(v: View): void;
  onMoveCard(id: string, x: number, y: number): void;
  onSelect(s: Sel | null): void;
  onLinkClick(id: string): void;
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function edge(c: Card, tx: number, ty: number) {
  const hw = CARD_W / 2, hh = cardH(c) / 2;
  const cx = c.x + hw, cy = c.y + hh;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: cx + dx * s, y: cy + dy * s };
}

const Board = forwardRef<BoardHandle, Props>((p, ref) => {
  const el = useRef<HTMLDivElement>(null);
  const props = useRef(p); props.current = p;
  const v = p.inv.view;
  const viewRef = useRef(v); viewRef.current = v;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; v: View } | null>(null);
  const cd = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const zoomAt = (cx: number, cy: number, f: number) => {
    const o = viewRef.current;
    const k = clamp(o.k * f, 0.15, 3);
    props.current.onView({ k, x: cx - (cx - o.x) * (k / o.k), y: cy - (cy - o.y) * (k / o.k) });
  };
  const rect = () => el.current!.getBoundingClientRect();

  const fit = () => {
    const cs = props.current.inv.cards, r = rect();
    if (!cs.length) return props.current.onView({ x: r.width / 2, y: r.height / 2, k: 1 });
    const x0 = Math.min(...cs.map((c) => c.x)), y0 = Math.min(...cs.map((c) => c.y));
    const x1 = Math.max(...cs.map((c) => c.x + CARD_W)), y1 = Math.max(...cs.map((c) => c.y + cardH(c)));
    const k = clamp(Math.min(r.width / (x1 - x0 + 140), r.height / (y1 - y0 + 140)), 0.15, 1.5);
    props.current.onView({ k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k });
  };

  const focus = (id: string) => {
    const c = props.current.inv.cards.find((x) => x.id === id);
    if (!c) return;
    const r = rect(), k = clamp(Math.max(viewRef.current.k, 0.9), 0.15, 3);
    props.current.onView({ k, x: r.width / 2 - (c.x + CARD_W / 2) * k, y: r.height / 2 - (c.y + cardH(c) / 2) * k });
  };

  useImperativeHandle(ref, () => ({
    focus,
    zoomBy(f: number) { const r = rect(); zoomAt(r.width / 2, r.height / 2, f); },
    getCenter() {
      const r = rect(), o = viewRef.current;
      return { x: (r.width / 2 - o.x) / o.k, y: (r.height / 2 - o.y) / o.k };
    },
    toWorld(cx: number, cy: number) {
      const r = rect(), o = viewRef.current;
      return { x: (cx - r.left - o.x) / o.k, y: (cy - r.top - o.y) / o.k };
    },
    fit,
  }));

  useEffect(() => {
    const n = el.current!;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = n.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    n.addEventListener('wheel', h, { passive: false });
    return () => n.removeEventListener('wheel', h);
  }, []);

  const rel = (e: RPE) => { const r = rect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const bgDown = (e: RPE) => {
    el.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, rel(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, v: viewRef.current };
      pan.current = null;
    } else {
      pan.current = { sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };
    }
  };
  const bgMove = (e: RPE) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, rel(e));
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const o = pinch.current.v, k = clamp(o.k * (d / pinch.current.d), 0.15, 3);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      p.onView({ k, x: mx - (mx - o.x) * (k / o.k), y: my - (my - o.y) * (k / o.k) });
    } else if (pan.current) {
      const dx = e.clientX - pan.current.sx, dy = e.clientY - pan.current.sy;
      if (Math.hypot(dx, dy) > 3) pan.current.moved = true;
      p.onView({ k: v.k, x: pan.current.vx + dx, y: pan.current.vy + dy });
    }
  };
  const bgUp = (e: RPE) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pan.current && !pan.current.moved && e.type === 'pointerup') p.onSelect(null);
    if (pointers.current.size === 0) pan.current = null;
  };

  const cardDown = (e: RPE, c: Card) => {
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (p.linkMode) { p.onLinkClick(c.id); return; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    cd.current = { id: c.id, sx: e.clientX, sy: e.clientY, ox: c.x, oy: c.y, moved: false };
  };
  const cardMove = (e: RPE) => {
    const d = cd.current; if (!d) return;
    e.stopPropagation();
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    p.onMoveCard(d.id, d.ox + dx / viewRef.current.k, d.oy + dy / viewRef.current.k);
  };
  const cardUp = (e: RPE) => {
    const d = cd.current; cd.current = null;
    if (d && !d.moved && e.type === 'pointerup') p.onSelect({ kind: 'card', id: d.id });
  };

  const byId = new Map(p.inv.cards.map((c) => [c.id, c]));
  const stop = (e: RPE) => e.stopPropagation();
  const mid = () => { const r = rect(); return { x: r.width / 2, y: r.height / 2 }; };

  return (
    <div
      ref={el}
      className={'board' + (p.linkMode ? ' linking' : '')}
      style={{ backgroundSize: `${40 * v.k}px ${40 * v.k}px`, backgroundPosition: `${v.x}px ${v.y}px` }}
      onPointerDown={bgDown} onPointerMove={bgMove} onPointerUp={bgUp} onPointerCancel={bgUp}
    >
      <div className="world" style={{ transform: `translate(${v.x}px,${v.y}px) scale(${v.k})` }}>
        <svg className="links" width="1" height="1">
          <defs>
            {p.inv.links.map((l) => (
              <marker key={l.id} id={`ah-${l.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,0L10,5L0,10z" fill={l.color} />
              </marker>
            ))}
          </defs>
          {p.inv.links.map((l) => {
            const a = byId.get(l.from), b = byId.get(l.to);
            if (!a || !b) return null;
            const ca = { x: a.x + CARD_W / 2, y: a.y + cardH(a) / 2 }, cb = { x: b.x + CARD_W / 2, y: b.y + cardH(b) / 2 };
            const s = edge(a, cb.x, cb.y), t = edge(b, ca.x, ca.y);
            const sel = p.selected?.kind === 'link' && p.selected.id === l.id;
            const dash = l.style === 'dashed' ? `${l.width * 4} ${l.width * 3}` : l.style === 'dotted' ? `${l.width} ${l.width * 2.5}` : undefined;
            const len = Math.hypot(t.x - s.x, t.y - s.y) || 1, off = l.curve ? len * 0.2 : 0;
            const qx = (s.x + t.x) / 2 - ((t.y - s.y) / len) * off, qy = (s.y + t.y) / 2 + ((t.x - s.x) / len) * off;
            const d = l.curve ? `M${s.x},${s.y} Q${qx},${qy} ${t.x},${t.y}` : `M${s.x},${s.y} L${t.x},${t.y}`;
            const mx = l.curve ? 0.25 * s.x + 0.5 * qx + 0.25 * t.x : (s.x + t.x) / 2;
            const my = l.curve ? 0.25 * s.y + 0.5 * qy + 0.25 * t.y : (s.y + t.y) / 2;
            return (
              <g key={l.id} className={sel ? 'lk sel' : 'lk'}>
                {sel && <path d={d} fill="none" stroke={l.color} strokeOpacity={0.22} strokeWidth={l.width + 8} strokeLinecap="round" />}
                <path d={d} fill="none" stroke={l.color} strokeWidth={l.width} strokeDasharray={dash}
                  strokeLinecap="round" markerEnd={l.arrow ? `url(#ah-${l.id})` : undefined} />
                <path d={d} fill="none" stroke="transparent" strokeWidth={18} pointerEvents="stroke"
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => { e.stopPropagation(); p.onSelect({ kind: 'link', id: l.id }); }} />
                {l.label && (
                  <text x={mx} y={my - 6} textAnchor="middle" className="lk-label" fill={l.color}>{l.label}</text>
                )}
              </g>
            );
          })}
        </svg>

        {p.inv.cards.map((c) => {
          const m = TYPE_META[c.type];
          const sel = p.selected?.kind === 'card' && p.selected.id === c.id;
          return (
            <div
              key={c.id}
              className={'card' + (sel ? ' sel' : '') + (p.linkFrom === c.id ? ' from' : '')}
              style={{ left: c.x, top: c.y, width: CARD_W, height: cardH(c), '--c': m.color } as CSSProperties}
              onPointerDown={(e) => cardDown(e, c)} onPointerMove={cardMove} onPointerUp={cardUp} onPointerCancel={cardUp}
            >
              <div className="card-h">
                <span className="ico"><Icon name={m.icon} size={13} /></span>
                <span className="kind">{m.label}</span>
                <span className="badges">
                  {c.notes && <i title="Notes"><Icon name="note" size={11} /></i>}
                  {(c.attachments?.length ?? 0) > 0 && <i title="Pièces jointes"><Icon name="file" size={11} />{c.attachments!.length}</i>}
                  {c.sources.length > 0 && <i title="Sources"><Icon name="clip" size={11} />{c.sources.length}</i>}
                </span>
              </div>
              {c.type === 'photo' && (
                <PhotoPreview c={c} />
              )}
              <div className="card-t">{c.title || 'Sans titre'}</div>
              {c.content && <div className="card-c">{c.content}</div>}
            </div>
          );
        })}
      </div>

      <div className="zoomctl" onPointerDown={stop}>
        <button title="Zoom avant" aria-label="Zoom avant" onClick={() => { const m = mid(); zoomAt(m.x, m.y, 1.25); }}><Icon name="plus" size={15} /></button>
        <span>{Math.round(v.k * 100)}%</span>
        <button title="Zoom arrière" aria-label="Zoom arrière" onClick={() => { const m = mid(); zoomAt(m.x, m.y, 0.8); }}><Icon name="minus" size={15} /></button>
        <i className="zsep" />
        <button title="Tout afficher (F)" aria-label="Tout afficher" onClick={() => fit()}><Icon name="fit" size={15} /></button>
      </div>
    </div>
  );
});

export default Board;
