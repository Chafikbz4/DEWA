CREATE TYPE "public"."request_urgency" AS ENUM('NORMAL', 'URGENT');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'DEPENDANT_PROOF';--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "urgency" "request_urgency" DEFAULT 'NORMAL' NOT NULL;