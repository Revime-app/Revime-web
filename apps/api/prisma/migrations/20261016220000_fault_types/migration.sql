-- CreateTable
CREATE TABLE "FaultType" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "labelFr" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaultType_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Demande" ADD COLUMN "faultTypeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FaultType_categoryId_slug_key" ON "FaultType"("categoryId", "slug");

-- CreateIndex
CREATE INDEX "FaultType_categoryId_active_sortOrder_idx" ON "FaultType"("categoryId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "Demande_faultTypeId_idx" ON "Demande"("faultTypeId");

-- AddForeignKey
ALTER TABLE "FaultType" ADD CONSTRAINT "FaultType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demande" ADD CONSTRAINT "Demande_faultTypeId_fkey" FOREIGN KEY ("faultTypeId") REFERENCES "FaultType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS backstop
ALTER TABLE "FaultType" ENABLE ROW LEVEL SECURITY;

-- Seed baseline fault types
INSERT INTO "FaultType" ("id", "categoryId", "slug", "labelFr", "sortOrder", "active", "updatedAt")
SELECT gen_random_uuid(), c.id, v.slug, v.label, v.ord, true, NOW()
FROM (VALUES
  ('smartphone', 'ecran-casse-fissure', 'Écran cassé / fissuré', 1),
  ('smartphone', 'batterie-defaillante', 'Batterie défaillante / usée', 2),
  ('smartphone', 'connecteur-charge', 'Connecteur de charge / faux contact', 3),
  ('smartphone', 'camera-lentille', 'Appareil photo / lentille rayée', 4),
  ('smartphone', 'micro-haut-parleur', 'Microphone / haut-parleur défectueux', 5),
  ('smartphone', 'boutons-marche-arret', 'Boutons marche-arrêt / volume', 6),
  ('smartphone', 'oxydation-eau', 'Oxydation / dégât des eaux', 7),
  ('smartphone', 'autre-panne', 'Diagnostic / autre anomalie', 8),

  ('tablette', 'ecran-tactile', 'Écran / vitre tactile fissurée', 1),
  ('tablette', 'batterie-defaillante', 'Batterie défaillante', 2),
  ('tablette', 'connecteur-charge', 'Connecteur de charge', 3),
  ('tablette', 'boutons-connectique', 'Boutons et connectique', 4),
  ('tablette', 'autre-panne', 'Autre panne tablette', 5),

  ('ordinateur', 'ecran-dalle', 'Écran / dalle cassée ou noire', 1),
  ('ordinateur', 'batterie-defaillante', 'Batterie défaillante', 2),
  ('ordinateur', 'clavier-touchpad', 'Clavier / pavé tactile HS', 3),
  ('ordinateur', 'disque-ssd-boot', 'Disque dur / SSD / plantage au démarrage', 4),
  ('ordinateur', 'connecteur-alim', 'Connecteur d''alimentation', 5),
  ('ordinateur', 'ventilation-surchauffe', 'Ventilation / surchauffe anormale', 6),
  ('ordinateur', 'autre-panne', 'Autre panne informatique', 7),

  ('console', 'port-hdmi-affichage', 'Port HDMI / pas d''affichage', 1),
  ('console', 'lecteur-disque', 'Lecteur de disque / éjection bloquée', 2),
  ('console', 'joystick-drift', 'Joystick drift / manette défectueuse', 3),
  ('console', 'surchauffe-arret', 'Surchauffe / extinction inopinée', 4),
  ('console', 'alimentation', 'Alimentation électrique', 5),
  ('console', 'autre-panne', 'Autre panne console', 6),

  ('velos-electriques', 'batterie-autonomie', 'Batterie / perte d''autonomie', 1),
  ('velos-electriques', 'moteur-assistance', 'Moteur / assistance défaillante', 2),
  ('velos-electriques', 'pneu-crevaison', 'Pneu / crevaison récurrente', 3),
  ('velos-electriques', 'freinage', 'Système de freinage', 4),
  ('velos-electriques', 'controleur-cablage', 'Contrôleur / câblage électrique', 5),
  ('velos-electriques', 'autre-panne', 'Autre panne mobilité', 6),

  ('trottinettes-electriques', 'batterie-autonomie', 'Batterie / perte d''autonomie', 1),
  ('trottinettes-electriques', 'moteur-assistance', 'Moteur / assistance défaillante', 2),
  ('trottinettes-electriques', 'pneu-crevaison', 'Pneu / crevaison récurrente', 3),
  ('trottinettes-electriques', 'freinage', 'Système de freinage', 4),
  ('trottinettes-electriques', 'controleur-cablage', 'Contrôleur / câblage électrique', 5),
  ('trottinettes-electriques', 'autre-panne', 'Autre panne mobilité', 6)
) AS v(cat_slug, slug, label, ord)
JOIN "Category" c ON c.slug = v.cat_slug;
