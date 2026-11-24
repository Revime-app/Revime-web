-- CF6-17: Seed baseline tips of the day for repairers and clients
-- Ensures the existing application tips are stored in the database and visible in the Admin Dashboard CRUD.
INSERT INTO "Tip" ("id", "text", "category", "active", "createdAt") VALUES
  ('c0000000-0000-4000-8000-000000000001', 'Une réponse rapide et un prix clair valent mieux qu’un prix bas.', 'REPAIRER', true, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000002', 'Privilégiez les réparateurs avec une identité vérifiée.', 'CLIENT', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
