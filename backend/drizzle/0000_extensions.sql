-- Extensions required by the schema.
-- pgcrypto: gen_random_uuid() (built into PG13+, kept for portability)
-- postgis: geography points + GiST indexes for radius searches
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis;
