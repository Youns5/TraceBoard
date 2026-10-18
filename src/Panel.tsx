import { CSSProperties, useState } from 'react';
import { Icon } from './Icon';
import { Card, LINK_COLORS, LineStyle, Link, TYPE_META, isHttp } from './types';

function readImage(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('lecture'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('image'));
      img.onload = () => {
        const s = Math.min(1, 640 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', 0.8));
      };
      img.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}

interface CP {
  card: Card; cards: Card[]; links: Link[];
  onChange(patch: Partial<Card>): void;
  onDelete(): void; onDuplicate(): void; onClose(): void;
  onSelectLink(id: string): void; onError(m: string): void;
}

export function CardPanel({ card, cards, links, onChange, onDelete, onDuplicate, onClose, onSelectLink, onError }: CP) {
  const m = TYPE_META[card.type];
  const [src, setSrc] = useState('');
  const addSrc = () => { const s = src.trim(); if (s) { onChange({ sources: [...card.sources, s] }); setSrc(''); } };
  const mine = links.filter((l) => l.from === card.id || l.to === card.id);
  const name = (id: string) => cards.find((c) => c.id === id)?.title || 'Sans titre';

  return (
    <aside className="panel">
      <header>
        <span className="chip" style={{ '--c': m.color } as CSSProperties}><Icon name={m.icon} size={15} /></span>
        <h2>{card.title || 'Sans titre'}<small>{m.label} · créée le {new Date(card.created).toLocaleDateString('fr-FR')}</small></h2>
        <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
      </header>
      <div className="panel-body">
        <label>Type
          <select value={card.type} onChange={(e) => onChange({ type: e.target.value as Card['type'] })}>
            {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label>Titre
          <input value={card.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Nom de la carte" />
        </label>
        <label>{m.field}
          <textarea rows={3} value={card.content} onChange={(e) => onChange({ content: e.target.value })} />
        </label>
        {card.type === 'url' && isHttp(card.content) && (
          <a className="btn ghost" href={card.content.trim()} target="_blank" rel="noopener noreferrer"><Icon name="external" size={14} /> Ouvrir le lien</a>
        )}
        {card.type === 'photo' && (
          <div className="photo-box">
            {card.image && <img src={card.image} alt="" />}
            <label className="btn ghost file">
              {card.image ? 'Remplacer l’image' : 'Choisir une image'}
              <input type="file" accept="image/*" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                try { onChange({ image: await readImage(f) }); } catch { onError('Image illisible.'); }
              }} />
            </label>
            {card.image && <button className="btn ghost" onClick={() => onChange({ image: undefined })}>Retirer l’image</button>}
          </div>
        )}
        <label>Notes
          <textarea rows={5} value={card.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Observations, hypothèses, niveau de confiance…" />
        </label>
        <div className="field">
          <span>Sources ({card.sources.length})</span>
          <ul className="sources">
            {card.sources.map((s, i) => (
              <li key={i}>
                {isHttp(s) ? <a href={s.trim()} target="_blank" rel="noopener noreferrer">{s}</a> : <span>{s}</span>}
                <button className="x" onClick={() => onChange({ sources: card.sources.filter((_, j) => j !== i) })} aria-label="Retirer la source"><Icon name="x" size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="row">
            <input value={src} placeholder="URL ou référence" onChange={(e) => setSrc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSrc()} />
            <button className="btn" onClick={addSrc}>Ajouter</button>
          </div>
        </div>
        {mine.length > 0 && (
          <div className="field">
            <span>Liens ({mine.length})</span>
            <ul className="sources">
              {mine.map((l) => (
                <li key={l.id}>
                  <button className="linkbtn" onClick={() => onSelectLink(l.id)}>
                    <b className="dot" style={{ background: l.color }} /> {name(l.from)} → {name(l.to)}{l.label ? ` · ${l.label}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="row">
          <button className="btn ghost" onClick={onDuplicate}><Icon name="copy" size={14} /> Dupliquer</button>
          <button className="btn danger" onClick={onDelete}><Icon name="trash" size={14} /> Supprimer</button>
        </div>
      </div>
    </aside>
  );
}

interface LP { link: Link; cards: Card[]; onChange(patch: Partial<Link>): void; onDelete(): void; onClose(): void }

export function LinkPanel({ link, cards, onChange, onDelete, onClose }: LP) {
  const name = (id: string) => cards.find((c) => c.id === id)?.title || 'Sans titre';
  return (
    <aside className="panel">
      <header>
        <span className="chip" style={{ '--c': link.color } as CSSProperties}><Icon name="link" size={15} /></span>
        <h2>Lien<small>{name(link.from)} → {name(link.to)}</small></h2>
        <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
      </header>
      <div className="panel-body">
        <label>Étiquette
          <input value={link.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="ex. utilise, propriétaire de…" />
        </label>
        <div className="field">
          <span>Couleur</span>
          <div className="swatches">
            {LINK_COLORS.map((c) => (
              <button key={c} className={'sw' + (c === link.color ? ' on' : '')} style={{ background: c }} onClick={() => onChange({ color: c })} aria-label={c} />
            ))}
            <input type="color" value={link.color} onChange={(e) => onChange({ color: e.target.value })} aria-label="Couleur personnalisée" />
          </div>
        </div>
        <label>Style
          <select value={link.style} onChange={(e) => onChange({ style: e.target.value as LineStyle })}>
            <option value="solid">Continu</option>
            <option value="dashed">Tirets</option>
            <option value="dotted">Pointillés</option>
          </select>
        </label>
        <label>Épaisseur : {link.width}px
          <input type="range" min={1} max={8} value={link.width} onChange={(e) => onChange({ width: +e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={link.arrow} onChange={(e) => onChange({ arrow: e.target.checked })} /> Afficher la flèche
        </label>
        <div className="row">
          <button className="btn ghost" onClick={() => onChange({ from: link.to, to: link.from })}><Icon name="swap" size={14} /> Inverser</button>
          <button className="btn danger" onClick={onDelete}><Icon name="trash" size={14} /> Supprimer</button>
        </div>
      </div>
    </aside>
  );
}
