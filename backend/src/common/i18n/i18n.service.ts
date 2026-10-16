import { Injectable } from '@nestjs/common';
import * as ar from '../../i18n/ar.json';
import * as fr from '../../i18n/fr.json';

export type Lang = 'ar' | 'fr';
export const SUPPORTED_LANGS: readonly Lang[] = ['ar', 'fr'];
export const DEFAULT_LANG: Lang = 'fr';

type Dict = { [key: string]: string | Dict };
const DICTS: Record<Lang, Dict> = { ar, fr };

@Injectable()
export class I18nService {
  /** Resolves ar/fr from an Accept-Language header (q-values honoured). */
  resolveLang(header?: string | string[]): Lang {
    const raw = Array.isArray(header) ? header.join(',') : header;
    if (!raw) return DEFAULT_LANG;
    const ranked = raw
      .split(',')
      .map((part) => {
        const [tag, ...params] = part.trim().split(';');
        const q = params.find((p) => p.trim().startsWith('q='));
        return {
          lang: tag.trim().toLowerCase().split('-')[0],
          q: q ? Number(q.split('=')[1]) : 1,
        };
      })
      .filter((x) => !Number.isNaN(x.q))
      .sort((a, b) => b.q - a.q);
    const match = ranked.find((x) => SUPPORTED_LANGS.includes(x.lang as Lang));
    return (match?.lang as Lang) ?? DEFAULT_LANG;
  }

  has(key: string, lang: Lang = DEFAULT_LANG): boolean {
    return typeof this.lookup(key, lang) === 'string';
  }

  t(key: string, lang: Lang, params?: Record<string, string | number>): string {
    const value = this.lookup(key, lang) ?? this.lookup(key, DEFAULT_LANG);
    if (typeof value !== 'string') return key;
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (m, name: string) =>
      params[name] !== undefined ? String(params[name]) : m,
    );
  }

  private lookup(key: string, lang: Lang): string | Dict | undefined {
    return key
      .split('.')
      .reduce<string | Dict | undefined>(
        (node, part) =>
          node && typeof node === 'object' ? node[part] : undefined,
        DICTS[lang],
      );
  }
}
