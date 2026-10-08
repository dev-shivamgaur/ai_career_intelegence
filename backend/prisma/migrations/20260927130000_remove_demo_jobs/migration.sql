-- Demo jobs are no longer seeded. New jobs are real catalog rows.
ALTER TABLE "job" ALTER COLUMN "isDemo" SET DEFAULT false;
DELETE FROM "job" WHERE "isDemo" = true;
