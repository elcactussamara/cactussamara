// ATV Tours — source unique pour l'affichage (Booking.astro) ET le serveur (/api/tour-request),
// qui recalcule le prix lui-même au lieu de faire confiance au navigateur.
export type Tour = {
  id: string;
  name: string;
  duration: string;
  stops: string;
  /** Prix par quad selon le nombre de riders (USD). */
  prices: { 1: number; 2: number };
};

export const TOURS: Tour[] = [
  {
    id: 'north',
    name: 'North Tour',
    duration: '3h',
    stops: 'Playa Buena Vista, Playa Barrigona, Barco Quebrado, Santo Domingo Mountain Ride',
    prices: { 1: 90, 2: 105 },
  },
  {
    id: 'south',
    name: 'South Tour',
    duration: '3h30',
    stops: 'Playa Camaronal, Playa Islita, Estrada Mountain Ride',
    prices: { 1: 95, 2: 110 },
  },
];

/** Départs possibles (heure du Costa Rica) : un tour de ≤ 3h30 doit finir avant la fermeture (16:30). */
export const TOUR_DEPARTURE_HOURS = [8, 9, 10, 11, 12, 13];

/** 13 → { value: "13:00", label: "01:00 PM" } */
export function toTimeOption(h: number) {
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { value: `${String(h).padStart(2, '0')}:00`, label: `${String(h12).padStart(2, '0')}:00 ${period}` };
}
