// GET /api/quote — prix d'une location, pour la pastille prix du formulaire.
//   ?category=atv-rental                           → { from }  (tarif journalier le plus bas)
//   &startDate&endDate&pickupTime&vehicles          → { total, days, available, enough }
import type { APIRoute } from 'astro';
import { fromPrice, parseRental, quoteRental } from '../../lib/rental';
import { errorResponse, json } from '../../lib/api-response';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const params = Object.fromEntries(url.searchParams);
  try {
    if (!params.startDate || !params.endDate) {
      // Prix d'appel : change rarement → mis en cache 10 min sur le CDN (ménage la limite de 120 req/min)
      return json({ ok: true, ...(await fromPrice(params.category)) }, 200, {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
      });
    }
    const q = await quoteRental(parseRental(params));
    return json({
      ok: true,
      total: q.total,
      days: q.days,
      available: q.available,
      enough: q.enough,
      currencySymbol: q.currencySymbol,
    });
  } catch (e) {
    return errorResponse(e);
  }
};
