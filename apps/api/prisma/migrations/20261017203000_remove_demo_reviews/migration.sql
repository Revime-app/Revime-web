-- PRE-2: Remove demo reviews (deceptive commercial practice)
-- Targets seeded demo reviews where author or repairer email ends with @demo.revime.fr.
-- Leaves genuine customer reviews untouched.

DELETE FROM "Review"
WHERE "id" IN (
  SELECT r."id"
  FROM "Review" r
  JOIN "user" u_author ON r."authorUserId" = u_author."id"
  JOIN "user" u_repairer ON r."repairerUserId" = u_repairer."id"
  WHERE LOWER(u_author."email") LIKE '%@demo.revime.fr'
     OR LOWER(u_repairer."email") LIKE '%@demo.revime.fr'
);
