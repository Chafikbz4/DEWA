CREATE TYPE "public"."admin_sub_role" AS ENUM('VERIFICATION_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'COMPLIANCE_ADMIN');--> statement-breakpoint
ALTER TYPE "public"."sensitive_resource_type" ADD VALUE 'CONVERSATION';--> statement-breakpoint
CREATE TABLE "admin_role_permissions" (
	"admin_role" "admin_sub_role" NOT NULL,
	"permission" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_role_permissions_admin_role_permission_pk" PRIMARY KEY("admin_role","permission")
);
--> statement-breakpoint
CREATE TABLE "admin_user_roles" (
	"user_id" uuid NOT NULL,
	"admin_role" "admin_sub_role" NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_user_roles_user_id_admin_role_pk" PRIMARY KEY("user_id","admin_role")
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"type" varchar(64) NOT NULL,
	"lang" char(2) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" varchar(1000) NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_type_lang_pk" PRIMARY KEY("type","lang"),
	CONSTRAINT "notification_templates_lang_chk" CHECK ("notification_templates"."lang" IN ('ar','fr'))
);
--> statement-breakpoint
CREATE TABLE "platform_setting_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb NOT NULL,
	"changed_by" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensitive_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"resource_type" varchar(16) NOT NULL,
	"resource_id" uuid NOT NULL,
	"justification" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sensitive_grants_type_chk" CHECK ("sensitive_access_grants"."resource_type" IN ('REQUEST','CONVERSATION'))
);
--> statement-breakpoint
ALTER TABLE "complaint_messages" ADD COLUMN "is_internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "resolution_outcome" varchar(16);--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_setting_changes" ADD CONSTRAINT "platform_setting_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_access_grants" ADD CONSTRAINT "sensitive_access_grants_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "setting_changes_key_created_idx" ON "platform_setting_changes" USING btree ("key","created_at");--> statement-breakpoint
CREATE INDEX "sensitive_grants_lookup_idx" ON "sensitive_access_grants" USING btree ("admin_user_id","resource_type","resource_id","expires_at");--> statement-breakpoint
-- Default least-privilege matrix (src/common/auth/permissions.ts); editable by SUPER_ADMIN.
INSERT INTO "admin_role_permissions" ("admin_role", "permission") VALUES
('VERIFICATION_ADMIN','users.read'),
('VERIFICATION_ADMIN','verification.read'),
('VERIFICATION_ADMIN','verification.decide'),
('SUPPORT_ADMIN','users.read'),
('SUPPORT_ADMIN','users.manage'),
('SUPPORT_ADMIN','monitoring.read'),
('SUPPORT_ADMIN','sensitive.access'),
('SUPPORT_ADMIN','complaints.read'),
('SUPPORT_ADMIN','complaints.manage'),
('FINANCE_ADMIN','monitoring.read'),
('FINANCE_ADMIN','payments.read'),
('FINANCE_ADMIN','refunds.decide'),
('FINANCE_ADMIN','settlements.manage'),
('FINANCE_ADMIN','commission.manage'),
('FINANCE_ADMIN','delivery_config.manage'),
('FINANCE_ADMIN','analytics.read'),
('COMPLIANCE_ADMIN','users.read'),
('COMPLIANCE_ADMIN','monitoring.read'),
('COMPLIANCE_ADMIN','sensitive.access'),
('COMPLIANCE_ADMIN','complaints.read'),
('COMPLIANCE_ADMIN','eligibility.manage'),
('COMPLIANCE_ADMIN','catalog.manage'),
('COMPLIANCE_ADMIN','analytics.read'),
('COMPLIANCE_ADMIN','audit.read'),
('COMPLIANCE_ADMIN','security.read')
ON CONFLICT DO NOTHING;
