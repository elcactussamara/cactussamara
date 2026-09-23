// Aides multilingues : langue de la page, textes, liens vers la bonne version du site.
import { getRelativeLocaleUrl } from 'astro:i18n';
import { ui, type Dict, type Locale } from './ui';

export type { Locale };
export const LOCALES: Locale[] = ['en', 'es', 'fr'];

/** Langue d'une page (Astro.currentLocale) — anglais par défaut. */
export function getLocale(value?: string): Locale {
  return value === 'es' || value === 'fr' ? value : 'en';
}

/** Français : espace insécable avant ? ! : ; (la ponctuation ne part jamais seule à la ligne). */
function frenchSpacing<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/ ([?!:;])/g, ' $1') as T;
  if (Array.isArray(value)) return value.map(frenchSpacing) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, frenchSpacing(v)])) as T;
  }
  return value;
}
const dicts: Record<Locale, Dict> = { en: ui.en, es: ui.es, fr: frenchSpacing(ui.fr) };

/** Textes de la page dans sa langue. */
export function useT(locale?: string): Dict {
  return dicts[getLocale(locale)];
}

/** Remplace les {variables} d'un texte. */
export function fill(text: string, vars: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Lien vers une section de l'accueil dans la bonne langue : '/#booking', '/es/#booking'… */
export function homeHref(locale: string | undefined, hash = '') {
  return getRelativeLocaleUrl(getLocale(locale), '') + hash;
}

/** Lien vers une page dans la bonne langue : '/privacy/', '/fr/privacy/'… */
export function pageHref(locale: string | undefined, path: string) {
  return getRelativeLocaleUrl(getLocale(locale), path);
}

/** Code de langue pour les dates et heures (Intl). */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', es: 'es-CR', fr: 'fr-FR' };

/** Libellé d'heure : 12 h en anglais et en espagnol (usage au Costa Rica), 24 h en français. */
export function timeLabel(locale: string | undefined, hour: number) {
  const l = getLocale(locale);
  if (l === 'fr') return `${String(hour).padStart(2, '0')}:00`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = l === 'es' ? (hour < 12 ? 'a. m.' : 'p. m.') : hour < 12 ? 'AM' : 'PM';
  return `${String(h12).padStart(2, '0')}:00 ${suffix}`;
}
