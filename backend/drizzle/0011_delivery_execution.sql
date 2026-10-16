CREATE TYPE "public"."driver_doc_type" AS ENUM('ID_CARD', 'DRIVING_LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE', 'OTHER');--> statement-breakpoint
ALTER TYPE "public"."file_purpose" ADD VALUE 'DELIVERY_COMPANY_DOC' BEFORE 'MESSAGE_ATTACHMENT';--> statement-breakpoint
CREATE TABLE "delivery_driver_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" varchar(254),
	"phone" varchar(16),
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_invitations_target_chk" CHECK ("delivery_driver_invitations"."email" IS NOT NULL OR "delivery_driver_invitations"."phone" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "driver_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"doc_type" "driver_doc_type" NOT NULL,
	"file_id" uuid NOT NULL,
	"review_status" "document_review_status" DEFAULT 'PENDING' NOT NULL,
	"reviewer_admin_id" uuid,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "pickup_code_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivery_code_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "delivery_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "returned_by_driver_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delivery_driver_invitations" ADD CONSTRAINT "delivery_driver_invitations_company_id_delivery_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."delivery_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_driver_invitations" ADD CONSTRAINT "delivery_driver_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_driver_invitations" ADD CONSTRAINT "delivery_driver_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_reviewer_admin_id_users_id_fk" FOREIGN KEY ("reviewer_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "driver_invitations_token_hash_uq" ON "delivery_driver_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "driver_invitations_company_status_idx" ON "delivery_driver_invitations" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "driver_documents_driver_idx" ON "driver_documents" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_documents_review_idx" ON "driver_documents" USING btree ("review_status","created_at");--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_attempts_chk" CHECK ("deliveries"."pickup_code_attempts" >= 0 AND "deliveries"."delivery_code_attempts" >= 0 AND "deliveries"."delivery_attempts" >= 0);