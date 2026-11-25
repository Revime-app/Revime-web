/**
 * The categories the site puts forward, by the slugs of the API's catalogue (same as the app's
 * tiles). Each one names what people actually bring in, so a visitor recognises his problem.
 */
export type FeaturedCategory = { slug: string; label: string; examples: string; icon: string };

export const FEATURED_CATEGORIES: FeaturedCategory[] = [
  {
    slug: 'smartphone',
    label: 'Téléphone',
    examples: 'Écran, batterie, connecteur',
    icon: 'M8.5 2.5h7a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2ZM11 18.5h2',
  },
  {
    slug: 'ordinateur',
    label: 'Ordinateur',
    examples: 'Portable, clavier, lenteurs',
    icon: 'M5.5 5h13a1.5 1.5 0 0 1 1.5 1.5V16H4V6.5A1.5 1.5 0 0 1 5.5 5ZM2 19h20',
  },
  {
    slug: 'petit-electromenager',
    label: 'Électroménager',
    examples: 'Cafetière, aspirateur, four',
    icon: 'M6 2.5h12a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1ZM5 7h14M12 10.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  },
  {
    slug: 'velos',
    label: 'Vélo',
    examples: 'Freins, dérailleur, pneu',
    icon: 'M5.5 13a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM18.5 13a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM5.5 16.5 9 9h6l3.5 7.5M9 9l3 7.5M14 5.5h2L15 9',
  },
  {
    slug: 'trottinettes-electriques',
    label: 'Trottinette',
    examples: 'Batterie, frein, démarrage',
    icon: 'M6 18.5a2 2 0 1 0 0 .01M18 18.5a2 2 0 1 0 0 .01M6 18.5h9l3-13h-3M15 5.5h3',
  },
  {
    slug: 'console',
    label: 'Console',
    examples: 'Manette, lecteur, HDMI',
    icon: 'M7 8h10a4 4 0 0 1 4 4.4l-.5 3.6a2.4 2.4 0 0 1-4.2 1.2L14.5 15h-5l-1.8 2.2A2.4 2.4 0 0 1 3.5 16L3 12.4A4 4 0 0 1 7 8ZM8 11v3M6.5 12.5h3',
  },
  {
    slug: 'montres-bijoux',
    label: 'Montre et bijou',
    examples: 'Pile, bracelet, verre',
    icon: 'M9.5 6.5h5a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3ZM9 6.5 9.5 3h5l.5 3.5M9 17.5l.5 3.5h5l.5-3.5M12 10v2.5l1.5 1',
  },
  {
    slug: 'chaussures',
    label: 'Chaussures et cuir',
    examples: 'Semelle, talon, sac',
    icon: 'M3 16.5V9l4 1.5c1.5.6 3 .5 4-1l1-1.5 2 4 5.5 1.5a2 2 0 0 1 1.5 2v1H3ZM3 19.5h18',
  },
];

const OTHER_ICON = 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z';

/** The icon of a category by its label (lists carry the label, not the slug). */
export function iconForLabel(label: string): string {
  const l = label.toLowerCase();
  const hit = FEATURED_CATEGORIES.find(
    (c) =>
      l.includes(c.label.toLowerCase().split(' ')[0]!.slice(0, 5)) ||
      l.includes(c.slug.split('-')[0]!.slice(0, 5)),
  );
  return hit?.icon ?? OTHER_ICON;
}

export function CategoryIcon({ path, size = 24 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
