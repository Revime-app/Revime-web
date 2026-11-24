-- The client's taxonomy, replacing the provisional eight seeded by
-- 20260813010000_category. Two levels via a self-referential parentId.
--
-- NOTHING IS DELETED. Demande.categoryId is a required FK with ON DELETE
-- RESTRICT and two live demandes point at 'smartphone'. Five old rows are
-- reused, three are deactivated. Because 'smartphone' is reused rather than
-- replaced, this migration writes no Demande row at all.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Category"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Category_parentId_sortOrder_idx" ON "Category"("parentId", "sortOrder");

-- The eight top-level categories. gen_random_uuid() because Prisma's
-- @default(uuid()) is client-side, so this table has no DB-side id default.
INSERT INTO "Category" ("id", "parentId", "slug", "labelFr", "sortOrder", "active") VALUES
  (gen_random_uuid(), NULL, 'electronique',     'Électronique',       1, true),
  (gen_random_uuid(), NULL, 'maison-jardin',    'Maison & Jardin',    2, true),
  (gen_random_uuid(), NULL, 'mode-accessoires', 'Mode & accessoires', 3, true),
  (gen_random_uuid(), NULL, 'mobilite',         'Mobilité',           4, true),
  (gen_random_uuid(), NULL, 'famille',          'Famille',            5, true),
  (gen_random_uuid(), NULL, 'loisirs',          'Loisirs',            6, true),
  (gen_random_uuid(), NULL, 'vehicules',        'Véhicules',          7, true),
  (gen_random_uuid(), NULL, 'autres',           'Autres',             8, true);

-- Reuse the five old rows whose object class the new taxonomy still names.
-- Their slugs are kept: a slug is an identifier, and offers.int.spec.ts and
-- demandes.int.spec.ts both look up slug = 'smartphone'.
UPDATE "Category" SET "labelFr" = 'Smartphones', "sortOrder" = 1,
  "parentId" = (SELECT id FROM "Category" WHERE slug = 'electronique')
  WHERE slug = 'smartphone';
UPDATE "Category" SET "labelFr" = 'Tablettes & liseuses', "sortOrder" = 2,
  "parentId" = (SELECT id FROM "Category" WHERE slug = 'electronique')
  WHERE slug = 'tablette';
UPDATE "Category" SET "labelFr" = 'Ordinateurs', "sortOrder" = 3,
  "parentId" = (SELECT id FROM "Category" WHERE slug = 'electronique')
  WHERE slug = 'ordinateur';
UPDATE "Category" SET "labelFr" = 'Consoles & jeux vidéo', "sortOrder" = 4,
  "parentId" = (SELECT id FROM "Category" WHERE slug = 'electronique')
  WHERE slug = 'console';
UPDATE "Category" SET "labelFr" = 'Électroménager', "sortOrder" = 1,
  "parentId" = (SELECT id FROM "Category" WHERE slug = 'maison-jardin')
  WHERE slug = 'electromenager';

-- The 31 remaining subcategories. Joined on the parent's slug so no uuid is
-- ever written by hand.
INSERT INTO "Category" ("id", "parentId", "slug", "labelFr", "sortOrder", "active")
SELECT gen_random_uuid(), p.id, v.slug, v.label, v.ord, true
FROM (VALUES
  ('electronique',     'televisions',                    'Télévisions',                     5),
  ('electronique',     'photo-video',                    'Photo & vidéo',                   6),
  ('electronique',     'audio-enceintes',                'Audio & enceintes',               7),
  ('electronique',     'casques-ecouteurs',              'Casques & écouteurs',             8),
  ('electronique',     'objets-connectes',               'Objets connectés',                9),
  ('electronique',     'autres-appareils-electroniques', 'Autres appareils électroniques', 10),
  ('maison-jardin',    'petit-electromenager',           'Petit électroménager',            2),
  ('maison-jardin',    'meubles',                        'Meubles',                         3),
  ('maison-jardin',    'jardin-outillage',               'Jardin & outillage',              4),
  ('maison-jardin',    'eclairage',                      'Éclairage',                       5),
  ('maison-jardin',    'decoration',                     'Décoration',                      6),
  ('maison-jardin',    'autres-objets-maison',           'Autres objets de la maison',      7),
  ('mode-accessoires', 'vetements',                      'Vêtements',                       1),
  ('mode-accessoires', 'chaussures',                     'Chaussures',                      2),
  ('mode-accessoires', 'sacs-maroquinerie',              'Sacs & maroquinerie',             3),
  ('mode-accessoires', 'montres-bijoux',                 'Montres & bijoux',                4),
  ('mode-accessoires', 'accessoires',                    'Accessoires',                     5),
  ('mobilite',         'velos',                          'Vélos',                           1),
  ('mobilite',         'velos-electriques',              'Vélos électriques',               2),
  ('mobilite',         'trottinettes-electriques',       'Trottinettes électriques',        3),
  ('mobilite',         'autres-mobilite',                'Autres moyens de mobilité',       4),
  ('famille',          'equipement-bebe',                'Équipement bébé',                 1),
  ('famille',          'jouets',                         'Jouets',                          2),
  ('famille',          'mobilier-enfant',                'Mobilier enfant',                 3),
  ('loisirs',          'instruments-musique',            'Instruments de musique',          1),
  ('loisirs',          'jeux-jouets',                    'Jeux & jouets',                   2),
  ('loisirs',          'articles-sport',                 'Articles de sport',               3),
  ('loisirs',          'loisirs-creatifs',               'Loisirs créatifs',                4),
  ('vehicules',        'voitures',                       'Voitures',                        1),
  ('vehicules',        'motos',                          'Motos',                           2),
  ('vehicules',        'equipement-automobile',          'Équipement automobile',           3)
) AS v(parent, slug, label, ord)
JOIN "Category" p ON p.slug = v.parent;

-- Écran and Batterie describe what is BROKEN, not what the object IS. The new
-- taxonomy is purely the latter, so neither has a home in it; the breakage
-- already lives in the demande's description and parts fields.
-- Montre connectée is superseded by the broader 'Objets connectés', which
-- absorbs the watch into a class rather than still naming it, so it is
-- deactivated rather than reused.
-- These three keep parentId NULL and their old sortOrder. They are tombstones,
-- excluded from every response by the active filter.
UPDATE "Category" SET "active" = false
  WHERE slug IN ('ecran', 'batterie', 'montre-connectee');
