// ============================================================
// Logique « location par catégorie » au-dessus de l'API Worco (serveur).
// - quoteRental : véhicules libres du type + prix total pour N véhicules
// - bookRental  : 1 demande Worco par véhicule (l'API ne réserve qu'un
//                 véhicule par requête), avec repli sur le suivant en cas de 409
// ============================================================
import { RENTAL_TYPES, RETURN_TIME, crToUtc, todayInCostaRica, listVehicles, createBooking, WorcoError, worcoMode } from './worco';

export type RentalRequest = {
  category: string;
  startDate: string; // YYYY-MM-DD (heure du Costa Rica)
  endDate: string;
  pickupTime: string; // HH:MM (heure du Costa Rica)
  vehicles: number;
};

export type ContactInfo = { name: string; email: string; phone: string; whatsapp?: string; message?: string; language: string };

/** Langue du site utilisée par le client (pour lui répondre dans sa langue). */
const LANGUAGES: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French' };

/** Erreur « métier » renvoyée telle quelle au navigateur (code + message lisible). */
export class RentalError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(0[89]|1[0-6]):[0-5]\d$/; // créneaux de retrait 08:00 → 16:59
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseRental(input: Record<string, unknown>): RentalRequest {
  const category = String(input.category ?? '');
  const startDate = String(input.startDate ?? '');
  const endDate = String(input.endDate ?? '');
  const pickupTime = String(input.pickupTime ?? '08:00');
  const vehicles = Number.parseInt(String(input.vehicles ?? '1'), 10);

  if (!RENTAL_TYPES[category]) throw new RentalError(400, 'validation', 'Unknown activity.');
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) throw new RentalError(400, 'validation', 'Please pick your start and end dates.');
  if (startDate < todayInCostaRica()) throw new RentalError(400, 'validation', 'The start date is in the past.');
  if (endDate < startDate) throw new RentalError(400, 'validation', 'The end date must be after the start date.');
  if (!TIME_RE.test(pickupTime)) throw new RentalError(400, 'validation', 'Please choose a pick-up time.');
  if (!Number.isInteger(vehicles) || vehicles < 1) throw new RentalError(400, 'validation', 'Please enter a number of vehicles.');
  return { category, startDate, endDate, pickupTime, vehicles };
}

export function parseContact(input: Record<string, unknown>): ContactInfo {
  const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const contact = {
    name: clean(input.name, 120),
    email: clean(input.email, 160),
    phone: clean(input.phone, 40),
    whatsapp: clean(input.whatsapp, 40),
    message: clean(input.message, 1000),
    language: LANGUAGES[String(input.lang ?? '')] ?? LANGUAGES.en,
  };
  if (contact.name.length < 2) throw new RentalError(400, 'validation', 'Please enter your full name.');
  if (!EMAIL_RE.test(contact.email)) throw new RentalError(400, 'validation', 'Please enter a valid email address.');
  if (contact.phone.replace(/\D/g, '').length < 6) throw new RentalError(400, 'validation', 'Please enter a valid phone number.');
  return contact;
}

/** Site en ligne sans clé Worco : pas de prix ni de réservation (le formulaire passe par WhatsApp). */
function assertWorcoAvailable() {
  if (worcoMode === 'off') {
    throw new RentalError(503, 'offline', 'Online booking is not available yet — please send your request on WhatsApp.');
  }
}

/** Période Worco : retrait à l'heure choisie le 1er jour, retour à la fermeture le dernier jour. */
function period(r: RentalRequest) {
  return { startUtc: crToUtc(r.startDate, r.pickupTime), endUtc: crToUtc(r.endDate, RETURN_TIME) };
}

/** Véhicules libres (du moins cher au plus cher) + total pour N véhicules. */
export async function quoteRental(r: RentalRequest) {
  assertWorcoAvailable();
  const { worcoType } = RENTAL_TYPES[r.category];
  const { startUtc, endUtc } = period(r);
  const { vehicles, currencySymbol, currencyCode } = await listVehicles(worcoType, startUtc, endUtc);

  const pool = vehicles
    .filter((v) => v.price_for_range)
    .sort((a, b) => Number(a.price_for_range!.total_price) - Number(b.price_for_range!.total_price));
  const chosen = pool.slice(0, r.vehicles);
  const total = chosen.reduce((sum, v) => sum + Number(v.price_for_range!.total_price), 0);

  return {
    available: pool.length,
    enough: pool.length >= r.vehicles,
    total: Math.round(total * 100) / 100,
    days: chosen[0]?.price_for_range?.days ?? null,
    currencySymbol,
    currencyCode,
    pool,
    startUtc,
    endUtc,
  };
}

/** Prix d'appel « à partir de » : tarif journalier le plus bas du type (sans dates). */
export async function fromPrice(category: string) {
  assertWorcoAvailable();
  const type = RENTAL_TYPES[category];
  if (!type) throw new RentalError(400, 'validation', 'Unknown activity.');
  const { vehicles, currencySymbol } = await listVehicles(type.worcoType);
  const prices = vehicles.map((v) => Number(v.price_per_day)).filter((p) => p > 0);
  return { from: prices.length ? Math.min(...prices) : null, currencySymbol };
}

/** Réserve N véhicules : une demande Worco par véhicule, tous liés par une référence commune. */
export async function bookRental(r: RentalRequest, contact: ContactInfo) {
  assertWorcoAvailable();
  const quote = await quoteRental(r);
  const label = RENTAL_TYPES[r.category].label;
  if (!quote.enough) {
    throw new RentalError(409, 'not_enough', `Only ${quote.available} ${label}${quote.available === 1 ? '' : 's'} available on these dates.`, {
      available: quote.available,
    });
  }

  // Référence commune : l'agence voit dans son CRM que les N demandes vont ensemble.
  const groupRef = `WEB-${Date.now().toString(36).toUpperCase()}`;
  const orders: string[] = [];
  for (const vehicle of quote.pool) {
    if (orders.length === r.vehicles) break;
    const note = [
      `[Website] ${label} rental — vehicle ${orders.length + 1}/${r.vehicles} — ref ${groupRef}`,
      `Pick-up ${r.pickupTime}, return by ${RETURN_TIME} (Costa Rica time). Payment in cash at pick-up.`,
      `Customer language: ${contact.language}`,
      contact.message ? `Customer message: ${contact.message}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      const booking = await createBooking({
        vehicle_uuid: vehicle.uuid,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        whatsapp: contact.whatsapp || '',
        message: note,
        start_date: quote.startUtc,
        end_date: quote.endUtc,
      });
      orders.push(booking.order_number);
    } catch (e) {
      // Véhicule réservé entre-temps : on passe au suivant du pool
      if (e instanceof WorcoError && e.status === 409) continue;
      throw e;
    }
  }

  if (orders.length < r.vehicles) {
    // Rare : des véhicules ont été pris pendant l'envoi. Les demandes déjà créées restent
    // « pending » dans Worco (l'API n'a pas d'annulation) — l'agence les verra avec la réf.
    throw new RentalError(409, 'partial', `Only ${orders.length} of ${r.vehicles} ${label}s could be requested — the others were just booked.`, {
      orders,
      groupRef,
    });
  }
  return { orders, groupRef, total: quote.total, currencySymbol: quote.currencySymbol, days: quote.days };
}
