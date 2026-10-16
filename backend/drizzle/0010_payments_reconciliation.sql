CREATE TABLE "payment_reconciliation_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"payment_id" uuid,
	"order_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_kind_chk" CHECK ("payment_reconciliation_issues"."kind" IN ('AMOUNT_MISMATCH','DUPLICATE_PAYMENT','STALE_PENDING','MISSING_PAYMENT','ORPHAN_EVENT','PAID_ORDER_NOT_PAYABLE')),
	CONSTRAINT "reconciliation_status_chk" CHECK ("payment_reconciliation_issues"."status" IN ('OPEN','RESOLVED'))
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "initiated_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_reconciliation_issues" ADD CONSTRAINT "payment_reconciliation_issues_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliation_issues" ADD CONSTRAINT "payment_reconciliation_issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliation_issues" ADD CONSTRAINT "payment_reconciliation_issues_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_status_kind_idx" ON "payment_reconciliation_issues" USING btree ("status","kind","created_at");--> statement-breakpoint
CREATE INDEX "reconciliation_payment_idx" ON "payment_reconciliation_issues" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "reconciliation_order_idx" ON "payment_reconciliation_issues" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;