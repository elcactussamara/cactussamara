// POST /api/tour-request — demande d'ATV Tour (hors Worco) → email à Cactus.
// Le navigateur ouvre EN MÊME TEMPS WhatsApp avec le même contenu : l'agence reçoit les deux.
// Corps JSON : tour, date, departureTime, quads, ridersPerQuad, name, email, phone, whatsapp?, message?, lang?
import type { APIRoute } from 'astro';
import { TOURS, TOUR_DEPARTURE_HOURS, toTimeOption } from '../../data/tours';
import { parseContact, RentalError } from '../../lib/rental';
import { todayInCostaRica } from '../../lib/worco';
import { CACTUS_EMAIL, escapeHtml, isMailMock, sendMail } from '../../lib/mailer';
import { errorResponse, json } from '../../lib/api-response';

export const prerender = false;

function parseTour(body: Record<string, unknown>) {
  const tour = TOURS.find((t) => t.id === body.tour);
  const date = String(body.date ?? '');
  const departure = TOUR_DEPARTURE_HOURS.map(toTimeOption).find((o) => o.value === body.departureTime);
  const quads = Number.parseInt(String(body.quads ?? ''), 10);
  const riders = String(body.ridersPerQuad) === '1' ? 1 : String(body.ridersPerQuad) === '2' ? 2 : null;

  if (!tour) throw new RentalError(400, 'validation', 'Please select a tour.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayInCostaRica()) throw new RentalError(400, 'validation', 'Please pick your tour date.');
  if (!departure) throw new RentalError(400, 'validation', 'Please choose a departure time.');
  if (!Number.isInteger(quads) || quads < 1) throw new RentalError(400, 'validation', 'Please enter a number of quads.');
  if (!riders) throw new RentalError(400, 'validation', 'Please choose the number of riders per quad.');

  // Prix recalculé ici, à partir des tarifs officiels (jamais celui envoyé par le navigateur)
  return { tour, date, departure, quads, riders, total: tour.prices[riders] * quads };
}

const prettyDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, code: 'validation', error: 'Invalid request.' }, 400);
  }
  if (body.company) return json({ ok: true, ref: null }); // anti-spam

  try {
    const t = parseTour(body);
    const c = parseContact(body);
    const ref = `TOUR-${Date.now().toString(36).toUpperCase()}`;

    const rows: [string, string][] = [
      ['Tour', `${t.tour.name} (${t.tour.duration})`],
      ['Date', prettyDate(t.date)],
      ['Departure', `${t.departure.label} (Costa Rica time)`],
      ['Quads', `${t.quads} × ${t.riders} rider${t.riders > 1 ? 's' : ''} per quad`],
      ['Estimated total', `$${t.total} — cash at pick-up`],
      ['Name', c.name],
      ['Email', c.email],
      ['Phone', c.phone],
      ...(c.whatsapp ? ([['WhatsApp', c.whatsapp]] as [string, string][]) : []),
      ...(c.message ? ([['Message', c.message]] as [string, string][]) : []),
      ['Customer language', c.language],
      ['Reference', ref],
    ];

    await sendMail({
      to: CACTUS_EMAIL,
      replyTo: c.email,
      subject: `🌵 ATV tour request — ${t.tour.name}, ${prettyDate(t.date)} — ${c.name}`,
      text: [
        'New ATV tour request from the website:',
        '',
        ...rows.map(([k, v]) => `${k}: ${v}`),
        '',
        'Reply to this email to answer the customer directly. The customer was also offered to send this request on WhatsApp.',
      ].join('\n'),
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">
  <h2 style="margin:0 0 12px;color:#de6e27">🌵 New ATV tour request</h2>
  <table cellpadding="6" style="border-collapse:collapse">
    ${rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top;white-space:nowrap">${k}</td><td style="font-weight:600;white-space:pre-line">${escapeHtml(v)}</td></tr>`).join('\n    ')}
  </table>
  <p style="color:#666;font-size:13px;margin-top:16px">Reply to this email to answer the customer directly. The customer was also offered to send this request on WhatsApp.</p>
</div>`,
    });

    return json({ ok: true, ref, total: t.total, mailSimulated: isMailMock }, 201);
  } catch (e) {
    return errorResponse(e);
  }
};
