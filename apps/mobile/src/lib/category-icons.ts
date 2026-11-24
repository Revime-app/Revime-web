import {
  IconElectronics,
  IconHomeGarden,
  IconFashion,
  IconBike,
  IconFamily,
  IconLeisure,
  IconVehicle,
  IconOther,
  // Children that reuse a glyph this app already imported for another surface.
  IconSmartphone,
  IconLaptop,
  IconConsole,
  IconCamera,
  // Children added by `CF-32`.
  IconTablet,
  IconTv,
  IconSpeaker,
  IconHeadphones,
  IconRouter,
  IconWashingMachine,
  IconBlender,
  IconShovel,
  IconBulb,
  IconFrame,
  IconHandBag,
  IconWatchAnalog,
  IconScooter,
  IconToyBrick,
  IconPuzzle,
  IconDumbbell,
  IconPaintBrush,
  IconMotorbike,
  IconTire,
} from '../icons';

/**
 * `CF-32` - « Dans la recherche : ajouter les icônes/logos manquants pour certaines
 * catégories. »
 *
 * 🛑 NOTHING WAS EVER RENDERING A BLANK ICON, AND MISREADING THAT COSTS YOU THE WHOLE FIX.
 * `ICON_BY_ROOT` below has always covered all eight active roots and always ended in a
 * fallback, so no row could render iconless. The defect was that all 36 CHILDREN inherited
 * their root's glyph: every one of the ten Électronique children drew the same CPU chip, and
 * « Montres & bijoux » drew a T-shirt. The client approved a prototype whose search gave each
 * item its own glyph (`repareme-web/src/screens/RechercheClient.tsx:9`, five distinct icons),
 * so he was reporting a regression against that, and « manquants » meant *the right glyph is
 * missing*, not *the row is empty*.
 *
 * **Two of the three numbers here are measured and one is a judgment - do not quote them as one
 * kind.** Measured: all 36 children inherited a root glyph, and 36 of the 37 rows Recherche
 * renders are children (`category-search.ts` makes a root-with-children not a row, so `Autres`
 * is the only root row). A judgment: **24 of the 36 carried a glyph that contradicted their
 * label**, which is not an objective count but the sum of the decisions in this file - 23
 * children given their own glyph below, plus « Chaussures », which needs one and cannot have
 * one. The owner reviewed the full 36-row list before it was written.
 *
 * `src/icons.ts` used to say « 36 hand-picked child icons would be a mapping nobody
 * maintains », which is why this was not done first time round. That comment is now amended.
 * The worry was fair; the answer to it is the totality check below, not restraint.
 *
 * WHY THE MAP IS TOTAL RATHER THAN SPARSE. Thirteen of the 36 children genuinely look right on
 * their root's glyph (« Meubles » on a sofa, « Vélos » on a bicycle). Those still get an entry,
 * written `ROOT`, instead of being left out. A sparse map cannot distinguish « checked, inherits
 * on purpose » from « nobody has got to this one yet » - and that ambiguity is precisely what
 * produced this feedback item, so reproducing it would be shipping the same defect in a new
 * shape.
 */

/** Root slug to icon. A slug with no entry falls back rather than crashing the row. */
const ICON_BY_ROOT: Record<string, typeof IconElectronics> = {
  electronique: IconElectronics,
  'maison-jardin': IconHomeGarden,
  'mode-accessoires': IconFashion,
  mobilite: IconBike,
  famille: IconFamily,
  loisirs: IconLeisure,
  vehicules: IconVehicle,
  autres: IconOther,
};

/**
 * The 36 active child slugs, read out of production Postgres on 2026-08-29 and held in the
 * taxonomy's own `sortOrder` so this list can be diffed against the database rather than
 * against a memory of it:
 *
 *   select p.slug, c.slug from "Category" c join "Category" p on c."parentId" = p.id
 *   where c.active and p.active order by p."sortOrder", c."sortOrder";
 *
 * 🛑 WHAT THE TYPE GATES, AND WHAT IT CANNOT. `apps/mobile` has no test harness; `tsc` is the
 * entire gate (`apps/mobile/AGENTS.md`). Deriving the union from this list and typing the map
 * as `Record<CategoryChildSlug, …>` makes the map's TOTALITY a compile error: add a slug here
 * without a glyph, or leave a glyph behind for a slug you removed, and the build fails.
 *
 * It does **not** verify this list against the database, and no gate in this repo can - the
 * taxonomy is runtime data. So a slug misspelled in BOTH places, or renamed in Postgres, still
 * compiles and simply falls through to its root glyph. That degradation is the old behaviour
 * rather than a crash, which is why it is acceptable, but it means **re-run the query above
 * when you touch the taxonomy**; do not treat a green typecheck as evidence these 36 strings
 * are real.
 */
const CATEGORY_CHILD_SLUGS = [
  // Électronique
  'smartphone', 'tablette', 'ordinateur', 'console', 'televisions',
  'photo-video', 'audio-enceintes', 'casques-ecouteurs', 'objets-connectes',
  'autres-appareils-electroniques',
  // Maison & Jardin
  'electromenager', 'petit-electromenager', 'meubles', 'jardin-outillage',
  'eclairage', 'decoration', 'autres-objets-maison',
  // Mode & accessoires
  'vetements', 'chaussures', 'sacs-maroquinerie', 'montres-bijoux', 'accessoires',
  // Mobilité
  'velos', 'velos-electriques', 'trottinettes-electriques', 'autres-mobilite',
  // Famille
  'equipement-bebe', 'jouets', 'mobilier-enfant',
  // Loisirs
  'instruments-musique', 'jeux-jouets', 'articles-sport', 'loisirs-creatifs',
  // Véhicules
  'voitures', 'motos', 'equipement-automobile',
] as const;

export type CategoryChildSlug = (typeof CATEGORY_CHILD_SLUGS)[number];

/**
 * Marker for a child whose root glyph is already the right answer. Read as « checked, inherits
 * deliberately », which is a different statement from a missing key.
 */
const ROOT = 'root' as const;

type ChildGlyph = typeof IconElectronics | typeof ROOT;

/**
 * Three choices here are judgment rather than obvious, and were shown to the owner before being
 * written:
 *
 * - « Jardin & outillage » gets a SHOVEL. The label spans a garden and a toolbox; a plant would
 *   serve only the first half and a wrench only the second.
 * - « Objets connectés » gets a ROUTER. The free set has no IoT glyph at all; a router is the
 *   nearest concrete connected object, where a wifi symbol denotes connectivity rather than a
 *   thing you can hand to a réparateur.
 * - « Jouets » (Famille) and « Jeux & jouets » (Loisirs) are two different categories under two
 *   different roots, so they take a toy brick and a puzzle. Giving them one glyph would
 *   re-create, between two rows, the very collision this item exists to remove.
 */
const ICON_BY_CHILD: Record<CategoryChildSlug, ChildGlyph> = {
  // Électronique - root glyph is a CPU chip.
  smartphone: IconSmartphone,
  tablette: IconTablet,
  ordinateur: IconLaptop,
  console: IconConsole,
  televisions: IconTv,
  'photo-video': IconCamera,
  'audio-enceintes': IconSpeaker,
  'casques-ecouteurs': IconHeadphones,
  'objets-connectes': IconRouter,
  'autres-appareils-electroniques': ROOT, // an « autres » bucket wants the generic root glyph

  // Maison & Jardin - root glyph is a sofa.
  electromenager: IconWashingMachine,
  'petit-electromenager': IconBlender,
  meubles: ROOT, // the sofa IS furniture
  'jardin-outillage': IconShovel,
  eclairage: IconBulb,
  decoration: IconFrame,
  'autres-objets-maison': ROOT,

  // Mode & accessoires - root glyph is a T-shirt.
  vetements: ROOT, // the T-shirt IS clothing
  // 🛑 FORCED, not a choice. @hugeicons/core-free-icons has NO footwear glyph - probed for
  // Shoe / Sneaker / Boot / Sandal / Slipper and every one came back empty. So « Chaussures »
  // is the one child of the 24 that were wrong which this slice cannot fix, and it is recorded
  // here rather than quietly left out of the table.
  chaussures: ROOT,
  'sacs-maroquinerie': IconHandBag,
  'montres-bijoux': IconWatchAnalog,
  accessoires: ROOT,

  // Mobilité - root glyph is a bicycle.
  velos: ROOT, // the root glyph is literally a bicycle
  'velos-electriques': ROOT, // no distinct e-bike glyph; a plain bicycle is honest
  'trottinettes-electriques': IconScooter,
  'autres-mobilite': ROOT,

  // Famille - root glyph is a baby bed.
  'equipement-bebe': ROOT, // no stroller or pram glyph in the free set
  jouets: IconToyBrick,
  'mobilier-enfant': ROOT, // a child's bed is child furniture

  // Loisirs - root glyph is a guitar.
  'instruments-musique': ROOT, // the guitar IS a musical instrument
  'jeux-jouets': IconPuzzle,
  'articles-sport': IconDumbbell,
  'loisirs-creatifs': IconPaintBrush,

  // Véhicules - root glyph is a car.
  voitures: ROOT, // the root glyph is literally a car
  motos: IconMotorbike,
  'equipement-automobile': IconTire,
};

/**
 * The glyph for one search row, resolving child → root → generic.
 *
 * `slug` is deliberately `string` rather than `CategoryChildSlug`: it arrives from the API at
 * runtime, so narrowing it here would be a type assertion dressed up as a check. A slug absent
 * from the map - a root's own row, or a category added after this file was written - lands on
 * its root glyph, which is exactly the behaviour that shipped before `CF-32`.
 *
 * `IconOther` is the last resort and exists so an unknown root renders a neutral grid rather
 * than throwing inside a list.
 */
export function iconForCategory(slug: string, rootSlug: string): typeof IconElectronics {
  const child: ChildGlyph | undefined = (ICON_BY_CHILD as Record<string, ChildGlyph>)[slug];
  if (child !== undefined && child !== ROOT) return child;
  return ICON_BY_ROOT[rootSlug] ?? IconOther;
}
