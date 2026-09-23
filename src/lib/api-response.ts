// Réponses JSON des routes /api/* + traduction des erreurs pour le navigateur.
import { RentalError } from './rental';
import { WorcoError, isMock } from './worco';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ mock: isMock, ...(data as object) }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Erreurs métier → message utile ; erreurs techniques (clé, Worco en panne…) → message générique,
 *  le détail reste dans les logs serveur (jamais la clé). */
export function errorResponse(e: unknown) {
  if (e instanceof RentalError) return json({ ok: false, code: e.code, error: e.message, ...e.extra }, e.status);
  if (e instanceof WorcoError && e.status === 429) {
    return json({ ok: false, code: 'rate_limited', error: 'Too many requests right now — please try again in a minute.' }, 429);
  }
  console.error('[api]', e instanceof WorcoError ? `Worco HTTP ${e.status}: ${e.message}` : e);
  return json(
    { ok: false, code: 'server', error: 'Our booking system is unavailable right now. Please try again or contact us on WhatsApp.' },
    502,
  );
}
