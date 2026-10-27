CREATE TYPE "public"."request_fulfillment_status" AS ENUM('PREPARING', 'READY', 'HANDED_TO_DELIVERY', 'DELIVERED', 'PICKED_UP');--> statement-breakpoint
ALTER TABLE "request_recipients" ADD COLUMN IF NOT EXISTS "fulfillment_status" "request_fulfillment_status";--> statement-breakpoint
ALTER TABLE "request_recipients" ADD COLUMN IF NOT EXISTS "fulfillment_updated_at" timestamp with time zone;
