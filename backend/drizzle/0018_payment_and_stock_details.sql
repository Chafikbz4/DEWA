ALTER TABLE "request_recipients" ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pharmacy_stock" ADD COLUMN IF NOT EXISTS "image_url" text;--> statement-breakpoint
ALTER TABLE "pharmacy_stock" ADD COLUMN IF NOT EXISTS "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;
