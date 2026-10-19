// Stockage des fichiers joints (images, documents) dans IndexedDB :
// pas de limite de 5 Mo comme localStorage, et les fichiers restent des fichiers (pas de base64 en mémoire).
import { Attachment, uid } from './types';

const DB = 'traceboard-files';
const STORE = 'files';
export const MAX_FILE = 100 * 1024 * 1024; // 100 Mo par fichier

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const rq = fn(t.objectStore(STORE));
    t.oncomplete = () => res(rq.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export const putBlob = (id: string, b: Blob) => tx('readwrite', (s) => s.put(b, id)).then(() => undefined);
export const getBlob = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id));
export const delBlob = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined);
export const delBlobs = (ids: string[]) => Promise.all(ids.map((i) => delBlob(i).catch(() => undefined))).then(() => undefined);

export function askPersistent() {
  try { navigator.storage?.persist?.(); } catch { /* ignoré */ }
}

export async function addFile(f: File): Promise<Attachment> {
  if (f.size > MAX_FILE) throw new Error(`« ${f.name} » dépasse ${MAX_FILE / 1024 / 1024} Mo.`);
  const a: Attachment = { id: uid(), name: f.name || 'fichier', mime: f.type || 'application/octet-stream', size: f.size, added: Date.now() };
  await putBlob(a.id, f);
  return a;
}

export async function copyAttachments(list: Attachment[] = []): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const a of list) {
    const b = await getBlob(a.id);
    if (!b) continue;
    const n = { ...a, id: uid() };
    await putBlob(n.id, b);
    out.push(n);
  }
  return out;
}

export const isImage = (a: Attachment) => a.mime.startsWith('image/');
export const fmtSize = (n: number) => (n < 1024 ? `${n} o` : n < 1048576 ? `${Math.round(n / 1024)} Ko` : `${(n / 1048576).toFixed(1)} Mo`);

const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result as string);
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(b);
});
export async function dataUrlToBlob(u: string): Promise<Blob> { return (await fetch(u)).blob(); }

// Pour l'export JSON : embarque les fichiers (base64) pour que l'export soit autonome.
export async function collectFiles(cards: { attachments?: Attachment[] }[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const c of cards) for (const a of c.attachments || []) {
    const b = await getBlob(a.id);
    if (b) out[a.id] = await toDataUrl(b);
  }
  return out;
}

// Ouvre (images, PDF, texte) ou télécharge (le reste) un fichier joint.
export async function openAttachment(a: Attachment, forceDownload = false) {
  const viewable = !forceDownload && (a.mime.startsWith('image/') || a.mime === 'application/pdf' || a.mime.startsWith('text/'));
  const w = viewable ? window.open('', '_blank') : null; // ouvert tout de suite pour éviter le blocage popup
  const b = await getBlob(a.id);
  if (!b) { w?.close(); throw new Error('Fichier introuvable.'); }
  const url = URL.createObjectURL(b);
  if (w) w.location.href = url;
  else { const el = document.createElement('a'); el.href = url; el.download = a.name; el.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Nettoyage au démarrage : supprime les fichiers qui n'appartiennent plus à aucune carte
// (la suppression est différée pour que « Annuler » puisse restaurer les pièces jointes).
export async function gcBlobs(used: Set<string>) {
  try {
    const keys = (await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) as string[];
    await delBlobs(keys.filter((k) => !used.has(k)));
  } catch { /* ignoré */ }
}
