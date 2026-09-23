// ============================================================
// Client Worco — Public External API (côté SERVEUR uniquement)
// Doc : "Worco Public External API.yaml" (v1)
//
// - La clé API ne quitte jamais le serveur (astro:env secret).
// - Sans clé/URL configurées → MODE SIMULATION : réponses factices au format
//   Worco, aucune réservation réelle (voir .env.example).
// - Réservation « par catégorie » : le client choisit ATV / Scooter / VTT,
//   le serveur attribue lui-même des véhicules libres du bon type.
// ============================================================
import { WORCO_API_KEY, WORCO_BASE_URL } from 'astro:env/server';

/** live : clé configurée → vrai Worco
 *  mock : pas de clé, en local (npm run dev) → réponses simulées pour développer
 *  off  : pas de clé, site en ligne → pas de prix affichés, locations envoyées par WhatsApp */
export const worcoMode: 'live' | 'mock' | 'off' =
  WORCO_API_KEY && WORCO_BASE_URL ? 'live' : import.meta.env.DEV ? 'mock' : 'off';
export const isMock = worcoMode === 'mock';

/** Catégories du site → slug de type de véhicule Worco.
 *  ⚠️ À VÉRIFIER dès que la clé est dispo : les slugs réels sont listés dans
 *  `filters.types` de GET /vehicles/ (ex. "motorcycle" dans la doc). */
export const RENTAL_TYPES: Record<string, { worcoType: string; label: string }> = {
  'atv-rental': { worcoType: 'atv', label: 'ATV' },
  'scooter-rental': { worcoType: 'scooter', label: 'Scooter' },
  'mountain-bike-rental': { worcoType: 'bicycle', label: 'Mountain bike' },
};

/** Heure de retour : fermeture de l'agence (footer : 08:00–16:30). */
export const RETURN_TIME = '16:30';
/** Costa Rica : UTC−6 toute l'année (pas d'heure d'été). */
const CR_OFFSET = '-06:00';

// ---------- Types (sous-ensemble utile de la doc) ----------
export type WorcoVehicle = {
  uuid: string;
  full_name: string;
  type: string;
  price_per_day: string;
  price_for_range?: { total_price: string; days: number; average_price_per_day: string };
};
type VehicleList = {
  success: boolean;
  vehicles: WorcoVehicle[];
  total: number;
  page: number;
  total_pages: number;
  currency_code: string;
  currency_symbol: string;
};
export type WorcoBooking = { uuid: string; status: string; order_number: string; total_price: string };

export class WorcoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- Utilitaires ----------
/** "2026-09-10" + "08:00" (heure du Costa Rica) → "2026-09-10T14:00:00Z" */
export function crToUtc(date: string, time: string): string {
  return new Date(`${date}T${time}:00${CR_OFFSET}`).toISOString().replace('.000Z', 'Z');
}

/** Date du jour au Costa Rica, "YYYY-MM-DD". */
export function todayInCostaRica(): string {
  return new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${WORCO_BASE_URL}${path}`, {
    ...init,
    headers: { 'X-API-Key': WORCO_API_KEY!, Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new WorcoError(res.status, body.error || body.detail || `Worco HTTP ${res.status}`);
  return body as T;
}

// ---------- API ----------
/** Véhicules publiés d'un type ; avec start/end : seulement ceux libres sur la période,
 *  chacun avec son `price_for_range` (tarifs saisonniers inclus). */
export async function listVehicles(type: string, startUtc?: string, endUtc?: string) {
  if (isMock) return mockList(type, startUtc, endUtc);

  const vehicles: WorcoVehicle[] = [];
  let page = 1;
  let meta: VehicleList;
  do {
    const q = new URLSearchParams({ type, per_page: '48', page: String(page) });
    if (startUtc && endUtc) {
      q.set('start_date', startUtc);
      q.set('end_date', endUtc);
    }
    meta = await request<VehicleList>(`/vehicles/?${q}`);
    vehicles.push(...meta.vehicles);
    page++;
  } while (page <= meta.total_pages && page <= 5); // 5 × 48 véhicules : largement assez pour l'agence
  return { vehicles, currencySymbol: meta.currency_symbol || '$', currencyCode: meta.currency_code || 'USD' };
}

export type BookingInput = {
  vehicle_uuid: string;
  name: string;
  email: string;
  phone: string;
  whatsapp?: string;
  message?: string;
  start_date: string; // ISO UTC
  end_date: string; // ISO UTC
};

/** Crée UNE demande de réservation (statut `pending`). 409 si le véhicule vient d'être pris. */
export async function createBooking(input: BookingInput): Promise<WorcoBooking> {
  if (isMock) return mockBooking(input);
  const res = await request<{ success: boolean; booking: WorcoBooking }>('/bookings/', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.booking;
}

// ---------- Mode simulation ----------
// Flotte factice, au format exact de la doc, pour développer sans clé.
const MOCK_FLEET: Record<string, { count: number; name: string; price: number }> = {
  atv: { count: 4, name: 'CFMoto CForce 450', price: 80 },
  scooter: { count: 3, name: 'Honda Navi 110', price: 35 },
  bicycle: { count: 5, name: 'Norco Fluid HT', price: 25 },
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let mockOrderSeq = 0;

async function mockList(type: string, startUtc?: string, endUtc?: string) {
  await wait(350); // latence réseau réaliste, pour voir les états de chargement
  const fleet = MOCK_FLEET[type];
  const days =
    startUtc && endUtc ? Math.max(1, Math.ceil((Date.parse(endUtc) - Date.parse(startUtc)) / 86_400_000)) : 0;
  const vehicles: WorcoVehicle[] = fleet
    ? Array.from({ length: fleet.count }, (_, i) => ({
        uuid: `mock-${type}-${i + 1}`,
        full_name: `${fleet.name} #${i + 1}`,
        type,
        price_per_day: fleet.price.toFixed(2),
        ...(days && {
          price_for_range: {
            total_price: (fleet.price * days).toFixed(2),
            days,
            average_price_per_day: fleet.price.toFixed(2),
          },
        }),
      }))
    : [];
  return { vehicles, currencySymbol: '$', currencyCode: 'USD' };
}

async function mockBooking(input: BookingInput): Promise<WorcoBooking> {
  await wait(300);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  mockOrderSeq++;
  return {
    uuid: `mock-booking-${mockOrderSeq}`,
    status: 'pending',
    order_number: `MOCK-${day}-${String(mockOrderSeq).padStart(4, '0')}`,
    total_price: '0.00',
  };
}
