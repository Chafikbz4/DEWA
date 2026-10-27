ALTER TABLE "request_recipients" ADD COLUMN IF NOT EXISTS "quoted_amount_centimes" bigint;--> statement-breakpoint
ALTER TABLE "request_recipients" ADD CONSTRAINT "request_recipients_quoted_amount_chk" CHECK ("quoted_amount_centimes" IS NULL OR "quoted_amount_centimes" >= 0);
