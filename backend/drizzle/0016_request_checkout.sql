CREATE TYPE "public"."payment_method" AS ENUM('ON_DELIVERY', 'CCP', 'BARIDIMOB');--> statement-breakpoint
CREATE TYPE "public"."request_payment_status" AS ENUM('UNPAID', 'PAID', 'NOT_CHARGED');--> statement-breakpoint
ALTER TABLE "request_recipients" ADD COLUMN IF NOT EXISTS "fulfillment_type" "fulfillment_type";--> statement-breakpoint
ALTER TABLE "request_recipients" ADD COLUMN IF NOT EXISTS "delivery_company_id" uuid;--> statement-breakpoint
ALTER TABLE "request_recipients" ADD COLUMN IF NOT EXISTS "delivery_company_name" varchar(200);--> statement-breakpoint
ALTER TABLE "request_recipients" ADD COLUMN IF NOT EXISTS "payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "request_recipients" ADD COLUMN IF NOT EXISTS "payment_status" "request_payment_status";--> statement-breakpoint
ALTER TABLE "request_recipients" ADD COLUMN IF NOT EXISTS "checkout_completed_at" timestamp with time zone;
