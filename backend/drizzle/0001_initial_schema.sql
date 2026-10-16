CREATE TYPE "public"."account_status" AS ENUM('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."chifa_verification_status" AS ENUM('NOT_VERIFIED', 'PENDING_OFFICIAL_CHECK', 'VERIFIED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."commission_scope" AS ENUM('GLOBAL', 'PHARMACY');--> statement-breakpoint
CREATE TYPE "public"."commission_type" AS ENUM('PERCENT', 'FIXED', 'SUBSCRIPTION');--> statement-breakpoint
CREATE TYPE "public"."complaint_against_type" AS ENUM('PHARMACY', 'DRIVER', 'PATIENT', 'PLATFORM');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('TERMS', 'PRIVACY', 'HEALTH_DATA_PROCESSING', 'SHARE_PRESCRIPTION_WITH_PHARMACY');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."delivery_company_doc_type" AS ENUM('COMMERCIAL_REGISTER', 'TAX', 'ID', 'INSURANCE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."delivery_company_status" AS ENUM('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('AVAILABLE', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."dependant_authorization_status" AS ENUM('DECLARED', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android', 'web');--> statement-breakpoint
CREATE TYPE "public"."document_review_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."driver_status" AS ENUM('PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."file_purpose" AS ENUM('PRESCRIPTION', 'CHIFA_CARD', 'PHARMACY_DOC', 'DRIVER_DOC', 'MESSAGE_ATTACHMENT', 'PROOF_OF_DELIVERY');--> statement-breakpoint
CREATE TYPE "public"."file_quality_status" AS ENUM('UNCHECKED', 'READABLE', 'UNREADABLE');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_type" AS ENUM('DELIVERY', 'PICKUP');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('MALE', 'FEMALE');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."item_availability" AS ENUM('AVAILABLE', 'PARTIAL', 'UNAVAILABLE', 'ALTERNATIVE');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('ar', 'fr');--> statement-breakpoint
CREATE TYPE "public"."malware_scan_status" AS ENUM('PENDING', 'CLEAN', 'INFECTED');--> statement-breakpoint
CREATE TYPE "public"."medicine_category" AS ENUM('OTC', 'PRESCRIPTION', 'CONTROLLED', 'COLD_CHAIN', 'PSYCHOTROPIC', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('TEXT', 'IMAGE', 'SYSTEM', 'CLARIFICATION_QUESTION', 'CLARIFICATION_ANSWER');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('IN_APP', 'PUSH', 'SMS', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('QUEUED', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."ocr_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('AWAITING_PAYMENT', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'PHARMACIST_VALIDATION_PENDING', 'PREPARING', 'READY_FOR_PICKUP', 'DELIVERY_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('REGISTER', 'LOGIN', 'RESET_PASSWORD', 'VERIFY_PHONE', 'VERIFY_EMAIL');--> statement-breakpoint
CREATE TYPE "public"."otp_target_type" AS ENUM('PHONE', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."patient_approval" AS ENUM('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('EDAHABIA_SATIM', 'MOCK');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('INITIATED', 'PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payout_account_type" AS ENUM('BANK', 'CCP');--> statement-breakpoint
CREATE TYPE "public"."pharmacy_doc_type" AS ENUM('AUTHORIZATION', 'PHARMACIST_DIPLOMA', 'ID', 'TAX', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."pharmacy_status" AS ENUM('DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."proof_type" AS ENUM('OTP', 'SIGNATURE', 'PHOTO_NO_FACE');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('SENT', 'VIEWED', 'DECLINED', 'CLARIFICATION_ASKED', 'OFFERED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('CHILD', 'PARENT', 'SPOUSE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."request_item_source" AS ENUM('PATIENT', 'OCR', 'PHARMACIST');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('REQUEST_SUBMITTED', 'AWAITING_PHARMACY_RESPONSE', 'CLARIFICATION_REQUIRED', 'OFFER_AVAILABLE', 'OFFER_ACCEPTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('PRESCRIPTION', 'CHIFA', 'PRODUCT');--> statement-breakpoint
CREATE TYPE "public"."retention_job_status" AS ENUM('RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('PATIENT', 'PHARMACY_OWNER', 'PHARMACIST', 'PHARMACY_ASSISTANT', 'DELIVERY_COMPANY_ADMIN', 'DRIVER', 'ADMIN', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."sensitive_resource_type" AS ENUM('PRESCRIPTION', 'CHIFA', 'PATIENT_PROFILE');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('DRAFT', 'APPROVED', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('OWNER', 'PHARMACIST', 'ASSISTANT');--> statement-breakpoint
CREATE TYPE "public"."stock_status" AS ENUM('IN_STOCK', 'LOW', 'OUT_OF_STOCK');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('MOTORCYCLE', 'CAR', 'VAN', 'BIKE');--> statement-breakpoint
CREATE SEQUENCE "public"."request_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."order_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."receipt_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."complaint_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_type" "consent_type" NOT NULL,
	"version" varchar(32) NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_identifier" varchar(128) NOT NULL,
	"platform" "device_platform" NOT NULL,
	"push_token" text,
	"app_version" varchar(32),
	"biometric_enabled" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"target" varchar(254) NOT NULL,
	"target_type" "otp_target_type" NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_attempts_chk" CHECK ("otp_codes"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"device_id" uuid,
	"ip" varchar(45),
	"user_agent" varchar(512),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" varchar(64),
	"replaced_by_session_id" uuid,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "role" NOT NULL,
	"email" varchar(254),
	"phone" varchar(16),
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"status" "account_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"preferred_language" "language" DEFAULT 'fr' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret_encrypted" text,
	"biometric_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_or_phone_chk" CHECK ("users"."email" IS NOT NULL OR "users"."phone" IS NOT NULL),
	CONSTRAINT "users_failed_login_count_chk" CHECK ("users"."failed_login_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" "file_purpose" NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"original_name" varchar(255),
	"mime_type" varchar(127) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"is_encrypted" boolean DEFAULT true NOT NULL,
	"encryption_key_ref" varchar(255),
	"malware_scan_status" "malware_scan_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	CONSTRAINT "files_size_chk" CHECK ("files"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" varchar(60),
	"wilaya_id" smallint NOT NULL,
	"commune_id" integer NOT NULL,
	"street_line" varchar(255) NOT NULL,
	"building_details" varchar(255),
	"latitude" double precision,
	"longitude" double precision,
	"location" "geography" GENERATED ALWAYS AS (CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography END) STORED,
	"phone_contact" varchar(16),
	"delivery_notes" varchar(500),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "communes" (
	"id" integer PRIMARY KEY NOT NULL,
	"wilaya_id" smallint NOT NULL,
	"name_fr" varchar(100) NOT NULL,
	"name_ar" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dependants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"date_of_birth" date,
	"relationship" "relationship" NOT NULL,
	"authorization_status" "dependant_authorization_status" DEFAULT 'DECLARED' NOT NULL,
	"proof_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "patient_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"date_of_birth" date,
	"gender" "gender",
	"national_id_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wilayas" (
	"id" smallint PRIMARY KEY NOT NULL,
	"name_fr" varchar(100) NOT NULL,
	"name_ar" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_fr" varchar(200) NOT NULL,
	"name_ar" varchar(200) NOT NULL,
	"legal_name" varchar(255),
	"authorization_number" varchar(100),
	"tax_id_nif" varchar(30),
	"commercial_register_rc" varchar(30),
	"wilaya_id" smallint NOT NULL,
	"commune_id" integer NOT NULL,
	"address_line" varchar(255) NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"location" "geography" GENERATED ALWAYS AS (CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography END) STORED,
	"phone" varchar(16),
	"email" varchar(254),
	"status" "pharmacy_status" DEFAULT 'DRAFT' NOT NULL,
	"rejection_reason" text,
	"verified_at" timestamp with time zone,
	"verified_by_admin_id" uuid,
	"accepts_requests" boolean DEFAULT false NOT NULL,
	"delivery_available" boolean DEFAULT false NOT NULL,
	"avg_response_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pharmacies_avg_response_chk" CHECK ("pharmacies"."avg_response_minutes" IS NULL OR "pharmacies"."avg_response_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pharmacy_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"doc_type" "pharmacy_doc_type" NOT NULL,
	"file_id" uuid NOT NULL,
	"review_status" "document_review_status" DEFAULT 'PENDING' NOT NULL,
	"reviewer_admin_id" uuid,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy_on_duty_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"date_from" timestamp with time zone NOT NULL,
	"date_to" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "on_duty_range_chk" CHECK ("pharmacy_on_duty_schedule"."date_to" > "pharmacy_on_duty_schedule"."date_from")
);
--> statement-breakpoint
CREATE TABLE "pharmacy_opening_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"open_time" time,
	"close_time" time,
	"is_closed" boolean DEFAULT false NOT NULL,
	"is_24h" boolean DEFAULT false NOT NULL,
	CONSTRAINT "opening_hours_day_chk" CHECK ("pharmacy_opening_hours"."day_of_week" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE "pharmacy_payout_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"account_type" "payout_account_type" NOT NULL,
	"holder_name" varchar(200) NOT NULL,
	"account_number_encrypted" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy_service_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"wilaya_id" smallint NOT NULL,
	"commune_id" integer,
	"max_radius_km" integer,
	CONSTRAINT "service_area_radius_chk" CHECK ("pharmacy_service_areas"."max_radius_km" IS NULL OR "pharmacy_service_areas"."max_radius_km" > 0)
);
--> statement-breakpoint
CREATE TABLE "pharmacy_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"staff_role" "staff_role" NOT NULL,
	"pharmacist_license_number" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy_staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"email" varchar(254),
	"phone" varchar(16),
	"staff_role" "staff_role" NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"invited_by" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_email_or_phone_chk" CHECK ("pharmacy_staff_invitations"."email" IS NOT NULL OR "pharmacy_staff_invitations"."phone" IS NOT NULL),
	CONSTRAINT "invitations_not_owner_chk" CHECK ("pharmacy_staff_invitations"."staff_role" <> 'OWNER')
);
--> statement-breakpoint
CREATE TABLE "eligibility_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"applies_to_category" "medicine_category" NOT NULL,
	"allowed_online_request" boolean DEFAULT false NOT NULL,
	"allowed_online_payment" boolean DEFAULT false NOT NULL,
	"allowed_delivery" boolean DEFAULT false NOT NULL,
	"requires_pharmacist_validation" boolean DEFAULT true NOT NULL,
	"requires_original_prescription" boolean DEFAULT true NOT NULL,
	"legal_basis_reference" text,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eligibility_enabled_requires_review_chk" CHECK ("eligibility_policies"."is_enabled" = false OR ("eligibility_policies"."reviewed_by" IS NOT NULL AND "eligibility_policies"."reviewed_at" IS NOT NULL AND "eligibility_policies"."legal_basis_reference" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "medicines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_name" varchar(200) NOT NULL,
	"inn_dci" varchar(200),
	"form" varchar(100),
	"dosage" varchar(100),
	"pack_size" varchar(100),
	"manufacturer" varchar(200),
	"category" "medicine_category" NOT NULL,
	"requires_prescription" boolean DEFAULT true NOT NULL,
	"reimbursable_flag" boolean DEFAULT false NOT NULL,
	"regulatory_code" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"medicine_id" uuid NOT NULL,
	"stock_status" "stock_status" NOT NULL,
	"quantity" integer,
	"unit_price_centimes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pharmacy_stock_quantity_chk" CHECK ("pharmacy_stock"."quantity" IS NULL OR "pharmacy_stock"."quantity" >= 0),
	CONSTRAINT "pharmacy_stock_price_chk" CHECK ("pharmacy_stock"."unit_price_centimes" IS NULL OR "pharmacy_stock"."unit_price_centimes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "chifa_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"card_file_id" uuid,
	"insurance_number_encrypted" text,
	"holder_name" varchar(200),
	"verification_status" "chifa_verification_status" DEFAULT 'NOT_VERIFIED' NOT NULL,
	"verified_via" varchar(50),
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chifa_verified_requires_source_chk" CHECK ("chifa_submissions"."verification_status" <> 'VERIFIED' OR ("chifa_submissions"."verified_via" IS NOT NULL AND "chifa_submissions"."verified_via" <> 'MOCK' AND "chifa_submissions"."verified_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ocr_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_file_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"raw_text_encrypted" text,
	"extracted_json" jsonb,
	"status" "ocr_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"page_order" integer DEFAULT 1 NOT NULL,
	"quality_status" "file_quality_status" DEFAULT 'UNCHECKED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_files_page_order_chk" CHECK ("request_files"."page_order" >= 1)
);
--> statement-breakpoint
CREATE TABLE "request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"raw_name" varchar(255) NOT NULL,
	"medicine_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"dosage_text" varchar(255),
	"source" "request_item_source" NOT NULL,
	"ocr_confidence" real,
	"confirmed_by_pharmacist" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_items_quantity_chk" CHECK ("request_items"."quantity" > 0),
	CONSTRAINT "request_items_ocr_confidence_chk" CHECK ("request_items"."ocr_confidence" IS NULL OR ("request_items"."ocr_confidence" >= 0 AND "request_items"."ocr_confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "request_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"status" "recipient_status" DEFAULT 'SENT' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"viewed_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"decline_reason" text
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(32) NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"dependant_id" uuid,
	"request_type" "request_type" NOT NULL,
	"status" "request_status" DEFAULT 'REQUEST_SUBMITTED' NOT NULL,
	"address_id" uuid,
	"delivery_address_snapshot" jsonb,
	"patient_note" text,
	"delivery_wanted" boolean DEFAULT false NOT NULL,
	"consent_record_id" uuid,
	"expires_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"request_item_id" uuid,
	"medicine_id" uuid,
	"name" varchar(255) NOT NULL,
	"quantity_requested" integer DEFAULT 0 NOT NULL,
	"quantity_offered" integer DEFAULT 0 NOT NULL,
	"unit_price_centimes" bigint DEFAULT 0 NOT NULL,
	"line_total_centimes" bigint DEFAULT 0 NOT NULL,
	"availability" "item_availability" NOT NULL,
	"is_alternative" boolean DEFAULT false NOT NULL,
	"alternative_reason" text,
	"patient_approval" "patient_approval" DEFAULT 'NOT_REQUIRED' NOT NULL,
	CONSTRAINT "offer_items_qty_chk" CHECK ("offer_items"."quantity_requested" >= 0 AND "offer_items"."quantity_offered" >= 0),
	CONSTRAINT "offer_items_money_chk" CHECK ("offer_items"."unit_price_centimes" >= 0 AND "offer_items"."line_total_centimes" >= 0),
	CONSTRAINT "offer_items_line_total_chk" CHECK ("offer_items"."line_total_centimes" = "offer_items"."unit_price_centimes" * "offer_items"."quantity_offered")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"status" "offer_status" DEFAULT 'DRAFT' NOT NULL,
	"items_subtotal_centimes" bigint DEFAULT 0 NOT NULL,
	"delivery_fee_centimes" bigint DEFAULT 0 NOT NULL,
	"service_fee_centimes" bigint DEFAULT 0 NOT NULL,
	"total_centimes" bigint DEFAULT 0 NOT NULL,
	"preparation_minutes" integer,
	"valid_until" timestamp with time zone,
	"delivery_available" boolean DEFAULT false NOT NULL,
	"pharmacy_note" text,
	"requires_prescription_original" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "offers_money_chk" CHECK ("offers"."items_subtotal_centimes" >= 0 AND "offers"."delivery_fee_centimes" >= 0 AND "offers"."service_fee_centimes" >= 0 AND "offers"."total_centimes" >= 0),
	CONSTRAINT "offers_total_chk" CHECK ("offers"."total_centimes" = "offers"."items_subtotal_centimes" + "offers"."delivery_fee_centimes" + "offers"."service_fee_centimes"),
	CONSTRAINT "offers_preparation_chk" CHECK ("offers"."preparation_minutes" IS NULL OR "offers"."preparation_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"message_type" "message_type" DEFAULT 'TEXT' NOT NULL,
	"body" text,
	"file_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(64) NOT NULL,
	"title_key" varchar(128) NOT NULL,
	"body_key" varchar(128) NOT NULL,
	"payload" jsonb,
	"channel" "notification_channel" DEFAULT 'IN_APP' NOT NULL,
	"status" "notification_status" DEFAULT 'QUEUED' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"offer_item_id" uuid,
	"name" varchar(255) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_centimes" bigint NOT NULL,
	"line_total_centimes" bigint NOT NULL,
	CONSTRAINT "order_items_qty_chk" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_money_chk" CHECK ("order_items"."unit_price_centimes" >= 0 AND "order_items"."line_total_centimes" = "order_items"."unit_price_centimes" * "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor_user_id" uuid,
	"actor_role" "role",
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(32) NOT NULL,
	"request_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'AWAITING_PAYMENT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"fulfillment_type" "fulfillment_type" NOT NULL,
	"delivery_address_snapshot" jsonb,
	"items_subtotal_centimes" bigint NOT NULL,
	"delivery_fee_centimes" bigint DEFAULT 0 NOT NULL,
	"service_fee_centimes" bigint DEFAULT 0 NOT NULL,
	"total_centimes" bigint NOT NULL,
	"currency" char(3) DEFAULT 'DZD' NOT NULL,
	"pharmacist_validated_by" uuid,
	"pharmacist_validated_at" timestamp with time zone,
	"validation_note" text,
	"payment_deadline_at" timestamp with time zone,
	"cancel_reason" text,
	"cancelled_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_money_chk" CHECK ("orders"."items_subtotal_centimes" >= 0 AND "orders"."delivery_fee_centimes" >= 0 AND "orders"."service_fee_centimes" >= 0 AND "orders"."total_centimes" >= 0),
	CONSTRAINT "orders_total_chk" CHECK ("orders"."total_centimes" = "orders"."items_subtotal_centimes" + "orders"."delivery_fee_centimes" + "orders"."service_fee_centimes"),
	CONSTRAINT "orders_currency_chk" CHECK ("orders"."currency" = 'DZD'),
	CONSTRAINT "orders_version_chk" CHECK ("orders"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "commission_scope" NOT NULL,
	"pharmacy_id" uuid,
	"type" "commission_type" NOT NULL,
	"value" bigint NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"legal_review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_value_chk" CHECK ("commission_rules"."value" >= 0),
	CONSTRAINT "commission_percent_range_chk" CHECK ("commission_rules"."type" <> 'PERCENT' OR "commission_rules"."value" <= 10000),
	CONSTRAINT "commission_scope_pharmacy_chk" CHECK (("commission_rules"."scope" = 'GLOBAL' AND "commission_rules"."pharmacy_id" IS NULL) OR ("commission_rules"."scope" = 'PHARMACY' AND "commission_rules"."pharmacy_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid,
	"provider_event_id" varchar(128) NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload" jsonb,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_result" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_reference" varchar(128),
	"provider_order_id" varchar(128),
	"idempotency_key" varchar(128) NOT NULL,
	"amount_centimes" bigint NOT NULL,
	"currency" char(3) DEFAULT 'DZD' NOT NULL,
	"status" "payment_status" DEFAULT 'INITIATED' NOT NULL,
	"verified_server_side_at" timestamp with time zone,
	"failure_code" varchar(64),
	"raw_provider_response_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_chk" CHECK ("payments"."amount_centimes" >= 0),
	CONSTRAINT "payments_currency_chk" CHECK ("payments"."currency" = 'DZD'),
	CONSTRAINT "payments_confirmed_verified_chk" CHECK ("payments"."status" <> 'CONFIRMED' OR "payments"."verified_server_side_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"receipt_number" varchar(32) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_id" uuid,
	"data_snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_centimes" bigint NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_status" DEFAULT 'REQUESTED' NOT NULL,
	"requested_by" uuid,
	"approved_by_admin_id" uuid,
	"provider_refund_reference" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "refunds_amount_chk" CHECK ("refunds"."amount_centimes" > 0)
);
--> statement-breakpoint
CREATE TABLE "settlement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_centimes" bigint NOT NULL,
	"commission_centimes" bigint NOT NULL,
	CONSTRAINT "settlement_lines_money_chk" CHECK ("settlement_lines"."amount_centimes" >= 0 AND "settlement_lines"."commission_centimes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"gross_centimes" bigint DEFAULT 0 NOT NULL,
	"commission_centimes" bigint DEFAULT 0 NOT NULL,
	"refunds_centimes" bigint DEFAULT 0 NOT NULL,
	"net_centimes" bigint DEFAULT 0 NOT NULL,
	"status" "settlement_status" DEFAULT 'DRAFT' NOT NULL,
	"paid_at" timestamp with time zone,
	"payout_reference" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_period_chk" CHECK ("settlements"."period_end" >= "settlements"."period_start"),
	CONSTRAINT "settlements_money_chk" CHECK ("settlements"."gross_centimes" >= 0 AND "settlements"."commission_centimes" >= 0 AND "settlements"."refunds_centimes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"driver_id" uuid,
	"company_id" uuid,
	"status" "delivery_status" DEFAULT 'AVAILABLE' NOT NULL,
	"pickup_snapshot" jsonb NOT NULL,
	"dropoff_snapshot" jsonb NOT NULL,
	"package_label" varchar(64) NOT NULL,
	"delivery_fee_centimes" bigint DEFAULT 0 NOT NULL,
	"driver_payout_centimes" bigint DEFAULT 0 NOT NULL,
	"pickup_code_hash" text,
	"delivery_code_hash" text,
	"assigned_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"estimated_arrival_at" timestamp with time zone,
	"failure_reason" text,
	"return_confirmed_at" timestamp with time zone,
	"proof_type" "proof_type",
	"proof_file_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_money_chk" CHECK ("deliveries"."delivery_fee_centimes" >= 0 AND "deliveries"."driver_payout_centimes" >= 0),
	CONSTRAINT "deliveries_version_chk" CHECK ("deliveries"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "delivery_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"legal_name" varchar(255),
	"tax_id" varchar(30),
	"rc_number" varchar(30),
	"phone" varchar(16),
	"email" varchar(254),
	"status" "delivery_company_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"admin_user_id" uuid,
	"verified_by_admin_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_company_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"doc_type" "delivery_company_doc_type" NOT NULL,
	"file_id" uuid NOT NULL,
	"review_status" "document_review_status" DEFAULT 'PENDING' NOT NULL,
	"reviewer_admin_id" uuid,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_fee_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"base_fee_centimes" bigint NOT NULL,
	"per_km_centimes" bigint DEFAULT 0 NOT NULL,
	"min_fee_centimes" bigint,
	"max_fee_centimes" bigint,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_rules_money_chk" CHECK ("delivery_fee_rules"."base_fee_centimes" >= 0 AND "delivery_fee_rules"."per_km_centimes" >= 0 AND ("delivery_fee_rules"."min_fee_centimes" IS NULL OR "delivery_fee_rules"."min_fee_centimes" >= 0) AND ("delivery_fee_rules"."max_fee_centimes" IS NULL OR "delivery_fee_rules"."max_fee_centimes" >= 0)),
	CONSTRAINT "fee_rules_min_max_chk" CHECK ("delivery_fee_rules"."min_fee_centimes" IS NULL OR "delivery_fee_rules"."max_fee_centimes" IS NULL OR "delivery_fee_rules"."max_fee_centimes" >= "delivery_fee_rules"."min_fee_centimes")
);
--> statement-breakpoint
CREATE TABLE "delivery_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"from_status" "delivery_status",
	"to_status" "delivery_status" NOT NULL,
	"actor_user_id" uuid,
	"actor_role" "role",
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wilaya_id" smallint NOT NULL,
	"commune_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"plate_number" varchar(20),
	"license_number_encrypted" text,
	"status" "driver_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"current_latitude" double precision,
	"current_longitude" double precision,
	"last_location_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_role" "role",
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(64),
	"resource_id" varchar(64),
	"ip" varchar(45),
	"user_agent" varchar(512),
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaint_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"body" text NOT NULL,
	"file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(32) NOT NULL,
	"order_id" uuid,
	"reporter_user_id" uuid NOT NULL,
	"against_type" "complaint_against_type" NOT NULL,
	"against_id" uuid,
	"category" varchar(64) NOT NULL,
	"description" text NOT NULL,
	"status" "complaint_status" DEFAULT 'OPEN' NOT NULL,
	"assigned_admin_id" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_retention_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" varchar(64) NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"records_deleted" integer DEFAULT 0 NOT NULL,
	"status" "retention_job_status" DEFAULT 'RUNNING' NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensitive_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"resource_type" "sensitive_resource_type" NOT NULL,
	"resource_id" uuid NOT NULL,
	"justification" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_session_id_sessions_id_fk" FOREIGN KEY ("replaced_by_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communes" ADD CONSTRAINT "communes_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependants" ADD CONSTRAINT "dependants_patient_user_id_users_id_fk" FOREIGN KEY ("patient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dependants" ADD CONSTRAINT "dependants_proof_file_id_files_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD CONSTRAINT "pharmacies_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD CONSTRAINT "pharmacies_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacies" ADD CONSTRAINT "pharmacies_verified_by_admin_id_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_documents" ADD CONSTRAINT "pharmacy_documents_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_documents" ADD CONSTRAINT "pharmacy_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_documents" ADD CONSTRAINT "pharmacy_documents_reviewer_admin_id_users_id_fk" FOREIGN KEY ("reviewer_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_on_duty_schedule" ADD CONSTRAINT "pharmacy_on_duty_schedule_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_opening_hours" ADD CONSTRAINT "pharmacy_opening_hours_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_payout_accounts" ADD CONSTRAINT "pharmacy_payout_accounts_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_service_areas" ADD CONSTRAINT "pharmacy_service_areas_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_service_areas" ADD CONSTRAINT "pharmacy_service_areas_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_service_areas" ADD CONSTRAINT "pharmacy_service_areas_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_staff" ADD CONSTRAINT "pharmacy_staff_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_staff" ADD CONSTRAINT "pharmacy_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_staff" ADD CONSTRAINT "pharmacy_staff_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_staff_invitations" ADD CONSTRAINT "pharmacy_staff_invitations_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_staff_invitations" ADD CONSTRAINT "pharmacy_staff_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_staff_invitations" ADD CONSTRAINT "pharmacy_staff_invitations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_policies" ADD CONSTRAINT "eligibility_policies_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_stock" ADD CONSTRAINT "pharmacy_stock_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pharmacy_stock" ADD CONSTRAINT "pharmacy_stock_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chifa_submissions" ADD CONSTRAINT "chifa_submissions_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chifa_submissions" ADD CONSTRAINT "chifa_submissions_card_file_id_files_id_fk" FOREIGN KEY ("card_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocr_results" ADD CONSTRAINT "ocr_results_request_file_id_request_files_id_fk" FOREIGN KEY ("request_file_id") REFERENCES "public"."request_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_files" ADD CONSTRAINT "request_files_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_files" ADD CONSTRAINT "request_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_recipients" ADD CONSTRAINT "request_recipients_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_recipients" ADD CONSTRAINT "request_recipients_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_patient_user_id_users_id_fk" FOREIGN KEY ("patient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_dependant_id_dependants_id_fk" FOREIGN KEY ("dependant_id") REFERENCES "public"."dependants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_consent_record_id_consent_records_id_fk" FOREIGN KEY ("consent_record_id") REFERENCES "public"."consent_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_request_item_id_request_items_id_fk" FOREIGN KEY ("request_item_id") REFERENCES "public"."request_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_patient_user_id_users_id_fk" FOREIGN KEY ("patient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_offer_item_id_offer_items_id_fk" FOREIGN KEY ("offer_item_id") REFERENCES "public"."offer_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_patient_user_id_users_id_fk" FOREIGN KEY ("patient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pharmacist_validated_by_users_id_fk" FOREIGN KEY ("pharmacist_validated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_admin_id_users_id_fk" FOREIGN KEY ("approved_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_company_id_delivery_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."delivery_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_proof_file_id_files_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_companies" ADD CONSTRAINT "delivery_companies_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_companies" ADD CONSTRAINT "delivery_companies_verified_by_admin_id_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_company_documents" ADD CONSTRAINT "delivery_company_documents_company_id_delivery_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."delivery_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_company_documents" ADD CONSTRAINT "delivery_company_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_company_documents" ADD CONSTRAINT "delivery_company_documents_reviewer_admin_id_users_id_fk" FOREIGN KEY ("reviewer_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_fee_rules" ADD CONSTRAINT "delivery_fee_rules_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_company_id_delivery_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."delivery_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_messages" ADD CONSTRAINT "complaint_messages_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_messages" ADD CONSTRAINT "complaint_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_messages" ADD CONSTRAINT "complaint_messages_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_admin_id_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_access_logs" ADD CONSTRAINT "sensitive_access_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_user_type_idx" ON "consent_records" USING btree ("user_id","consent_type");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_identifier_uq" ON "devices" USING btree ("user_id","device_identifier");--> statement-breakpoint
CREATE INDEX "otp_target_purpose_created_idx" ON "otp_codes" USING btree ("target","purpose","created_at");--> statement-breakpoint
CREATE INDEX "otp_user_idx" ON "otp_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_family_idx" ON "sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "sessions_device_idx" ON "sessions" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email") WHERE "users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone") WHERE "users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_status_created_idx" ON "users" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_key_uq" ON "files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "files_purpose_created_idx" ON "files" USING btree ("purpose","created_at");--> statement-breakpoint
CREATE INDEX "files_retention_idx" ON "files" USING btree ("retention_until") WHERE "files"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "addresses_commune_idx" ON "addresses" USING btree ("commune_id");--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_default_per_user_uq" ON "addresses" USING btree ("user_id") WHERE "addresses"."is_default" = true AND "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "addresses_location_gix" ON "addresses" USING gist ("location");--> statement-breakpoint
CREATE INDEX "communes_wilaya_idx" ON "communes" USING btree ("wilaya_id");--> statement-breakpoint
CREATE INDEX "dependants_patient_idx" ON "dependants" USING btree ("patient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pharmacies_authorization_number_uq" ON "pharmacies" USING btree ("authorization_number");--> statement-breakpoint
CREATE INDEX "pharmacies_status_created_idx" ON "pharmacies" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "pharmacies_wilaya_commune_idx" ON "pharmacies" USING btree ("wilaya_id","commune_id");--> statement-breakpoint
CREATE INDEX "pharmacies_location_gix" ON "pharmacies" USING gist ("location");--> statement-breakpoint
CREATE INDEX "pharmacy_documents_pharmacy_idx" ON "pharmacy_documents" USING btree ("pharmacy_id");--> statement-breakpoint
CREATE INDEX "pharmacy_documents_review_idx" ON "pharmacy_documents" USING btree ("review_status","created_at");--> statement-breakpoint
CREATE INDEX "on_duty_pharmacy_range_idx" ON "pharmacy_on_duty_schedule" USING btree ("pharmacy_id","date_from","date_to");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_hours_pharmacy_day_uq" ON "pharmacy_opening_hours" USING btree ("pharmacy_id","day_of_week");--> statement-breakpoint
CREATE INDEX "payout_accounts_pharmacy_idx" ON "pharmacy_payout_accounts" USING btree ("pharmacy_id");--> statement-breakpoint
CREATE INDEX "service_areas_pharmacy_idx" ON "pharmacy_service_areas" USING btree ("pharmacy_id");--> statement-breakpoint
CREATE INDEX "service_areas_wilaya_commune_idx" ON "pharmacy_service_areas" USING btree ("wilaya_id","commune_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pharmacy_staff_pharmacy_user_uq" ON "pharmacy_staff" USING btree ("pharmacy_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pharmacy_staff_one_active_per_user_uq" ON "pharmacy_staff" USING btree ("user_id") WHERE "pharmacy_staff"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_uq" ON "pharmacy_staff_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_pharmacy_status_idx" ON "pharmacy_staff_invitations" USING btree ("pharmacy_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_one_enabled_per_category_uq" ON "eligibility_policies" USING btree ("applies_to_category") WHERE "eligibility_policies"."is_enabled" = true;--> statement-breakpoint
CREATE INDEX "medicines_brand_idx" ON "medicines" USING btree ("brand_name");--> statement-breakpoint
CREATE INDEX "medicines_inn_idx" ON "medicines" USING btree ("inn_dci");--> statement-breakpoint
CREATE INDEX "medicines_category_idx" ON "medicines" USING btree ("category","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "medicines_regulatory_code_uq" ON "medicines" USING btree ("regulatory_code");--> statement-breakpoint
CREATE UNIQUE INDEX "pharmacy_stock_pharmacy_medicine_uq" ON "pharmacy_stock" USING btree ("pharmacy_id","medicine_id");--> statement-breakpoint
CREATE INDEX "pharmacy_stock_medicine_status_idx" ON "pharmacy_stock" USING btree ("medicine_id","stock_status");--> statement-breakpoint
CREATE INDEX "chifa_request_idx" ON "chifa_submissions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ocr_results_request_file_idx" ON "ocr_results" USING btree ("request_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "request_files_request_page_uq" ON "request_files" USING btree ("request_id","page_order");--> statement-breakpoint
CREATE INDEX "request_items_request_idx" ON "request_items" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "request_recipients_request_pharmacy_uq" ON "request_recipients" USING btree ("request_id","pharmacy_id");--> statement-breakpoint
CREATE INDEX "request_recipients_pharmacy_status_idx" ON "request_recipients" USING btree ("pharmacy_id","status","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_reference_uq" ON "requests" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "requests_patient_created_idx" ON "requests" USING btree ("patient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "requests_status_created_idx" ON "requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "requests_expires_idx" ON "requests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "offer_items_offer_idx" ON "offer_items" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offers_request_idx" ON "offers" USING btree ("request_id","status");--> statement-breakpoint
CREATE INDEX "offers_pharmacy_status_created_idx" ON "offers" USING btree ("pharmacy_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_request_pharmacy_uq" ON "conversations" USING btree ("request_id","pharmacy_id");--> statement-breakpoint
CREATE INDEX "conversations_patient_idx" ON "conversations" USING btree ("patient_user_id");--> statement-breakpoint
CREATE INDEX "conversations_pharmacy_idx" ON "conversations" USING btree ("pharmacy_id","status");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_status_created_idx" ON "notifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_history_order_created_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_reference_uq" ON "orders" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_offer_active_uq" ON "orders" USING btree ("offer_id") WHERE "orders"."status" NOT IN ('CANCELLED', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE INDEX "orders_patient_created_idx" ON "orders" USING btree ("patient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_pharmacy_status_created_idx" ON "orders" USING btree ("pharmacy_id","status","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_request_idx" ON "orders" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "commission_rules_pharmacy_idx" ON "commission_rules" USING btree ("pharmacy_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_uq" ON "payment_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_uq" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_order_uq" ON "payments" USING btree ("provider","provider_order_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_status_created_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_number_uq" ON "receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "receipts_order_idx" ON "receipts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_status_created_idx" ON "refunds" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_lines_settlement_order_uq" ON "settlement_lines" USING btree ("settlement_id","order_id");--> statement-breakpoint
CREATE INDEX "settlement_lines_order_idx" ON "settlement_lines" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_pharmacy_period_uq" ON "settlements" USING btree ("pharmacy_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "settlements_status_idx" ON "settlements" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_order_uq" ON "deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "deliveries_status_created_idx" ON "deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "deliveries_driver_status_idx" ON "deliveries" USING btree ("driver_id","status");--> statement-breakpoint
CREATE INDEX "deliveries_company_status_idx" ON "deliveries" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "delivery_companies_status_idx" ON "delivery_companies" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_companies_rc_uq" ON "delivery_companies" USING btree ("rc_number");--> statement-breakpoint
CREATE INDEX "delivery_company_documents_company_idx" ON "delivery_company_documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "delivery_company_documents_review_idx" ON "delivery_company_documents" USING btree ("review_status","created_at");--> statement-breakpoint
CREATE INDEX "fee_rules_zone_active_idx" ON "delivery_fee_rules" USING btree ("zone_id","is_active","effective_from");--> statement-breakpoint
CREATE INDEX "delivery_history_delivery_created_idx" ON "delivery_status_history" USING btree ("delivery_id","created_at");--> statement-breakpoint
CREATE INDEX "delivery_zones_wilaya_commune_idx" ON "delivery_zones" USING btree ("wilaya_id","commune_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_user_uq" ON "drivers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drivers_company_idx" ON "drivers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "drivers_available_idx" ON "drivers" USING btree ("status","is_available") WHERE "drivers"."is_available" = true;--> statement-breakpoint
CREATE INDEX "drivers_location_gix" ON "drivers" USING gist ((ST_SetSRID(ST_MakePoint("current_longitude", "current_latitude"), 4326)::geography));--> statement-breakpoint
CREATE INDEX "audit_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_action_created_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "complaint_messages_complaint_created_idx" ON "complaint_messages" USING btree ("complaint_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_reference_uq" ON "complaints" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "complaints_status_created_idx" ON "complaints" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "complaints_reporter_idx" ON "complaints" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX "complaints_against_idx" ON "complaints" USING btree ("against_type","against_id");--> statement-breakpoint
CREATE INDEX "complaints_assigned_idx" ON "complaints" USING btree ("assigned_admin_id");--> statement-breakpoint
CREATE INDEX "retention_jobs_resource_run_idx" ON "data_retention_jobs" USING btree ("resource_type","run_at");--> statement-breakpoint
CREATE INDEX "sensitive_access_actor_created_idx" ON "sensitive_access_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "sensitive_access_resource_idx" ON "sensitive_access_logs" USING btree ("resource_type","resource_id");