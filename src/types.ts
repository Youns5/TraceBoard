export type CardType = 'photo' | 'text' | 'person' | 'alias' | 'url' | 'phone' | 'document';
export type IconName = 'user' | 'at' | 'image' | 'globe' | 'phone' | 'file' | 'text';
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface Card {
  id: string;
  type: CardType;
  title: string;
  content: string;
  notes: string;
  sources: string[];
  x: number;
  y: number;
  image?: string;
  created: number;
}

export interface Link {
  id: string;
  from: string;
  to: string;
  label: string;
  color: string;
  style: LineStyle;
  width: number;
  arrow: boolean;
}

export interface View { x: number; y: number; k: number }

export interface Investigation {
  id: string;
  name: string;
  cards: Card[];
  links: Link[];
  view: View;
  updated: number;
}

export interface AppState { investigations: Investigation[]; activeId: string }
export type Sel = { kind: 'card' | 'link'; id: string };

export const TYPE_META: Record<CardType, { label: string; icon: IconName; color: string; field: string; key: string }> = {
  person:   { label: 'Personne',  icon: 'user',  color: '#6ea8fe', field: 'Identité / informations',  key: '1' },
  alias:    { label: 'Pseudo',    icon: 'at',    color: '#a78bfa', field: 'Plateforme / profil',      key: '2' },
  photo:    { label: 'Photo',     icon: 'image', color: '#f472b6', field: 'Légende',                  key: '3' },
  url:      { label: 'URL',       icon: 'globe', color: '#22d3ee', field: 'Adresse (https://…)',      key: '4' },
  phone:    { label: 'Numéro',    icon: 'phone', color: '#fbbf24', field: 'Numéro',                   key: '5' },
  document: { label: 'Document',  icon: 'file',  color: '#34d399', field: 'Référence / extrait',      key: '6' },
  text:     { label: 'Note',      icon: 'text',  color: '#94a3b8', field: 'Texte',                    key: '7' },
};

export const CARD_W = 210;
export const cardH = (c: Card) => (c.type === 'photo' ? 176 : 96);
export const DEFAULT_LINK_COLOR = '#8b9dc3';
export const LINK_COLORS = ['#8b9dc3', '#6ea8fe', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#f87171'];

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const isHttp = (s: string) => /^https?:\/\//i.test(s.trim());
