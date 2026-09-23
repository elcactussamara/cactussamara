// POST /api/booking — demande de réservation d'une location (ATV / Scooter / VTT) dans Worco.
// Corps JSON : category, startDate, endDate, pickupTime, vehicles, name, email, phone, whatsapp?, message?
// Les ATV Tours ne passent pas ici : ils sont hors Worco (demande envoyée par WhatsApp côté client).
import type { APIRoute } from 'astro';
import { bookRental, parseContact, parseRental } from '../../lib/rental';
import { errorResponse, json } from '../../lib/api-response';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, code: 'validation', error: 'Invalid request.' }, 400);
  }

  // Anti-spam : champ invisible pour un humain, rempli par les robots → on fait semblant d'accepter.
  if (body.company) return json({ ok: true, orders: [], groupRef: null });

  try {
    const result = await bookRental(parseRental(body), parseContact(body));
    return json({ ok: true, ...result }, 201);
  } catch (e) {
    return errorResponse(e);
  }
};
