ALTER TYPE "public"."recipient_status" ADD VALUE 'INTERESTED' BEFORE 'DECLINED';--> statement-breakpoint
ALTER TABLE "pharmacies" ADD COLUMN "submitted_for_review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "medicines" ADD COLUMN "name_ar" varchar(200);--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medicines_brand_trgm_idx" ON "medicines" USING gin ("brand_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "medicines_name_ar_trgm_idx" ON "medicines" USING gin ("name_ar" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "medicines_inn_trgm_idx" ON "medicines" USING gin ("inn_dci" gin_trgm_ops);