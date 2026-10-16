import { pgEnum } from 'drizzle-orm/pg-core';

// ---------- Identity ----------
export const roleEnum = pgEnum('role', [
  'PATIENT',
  'PHARMACY_OWNER',
  'PHARMACIST',
  'PHARMACY_ASSISTANT',
  'DELIVERY_COMPANY_ADMIN',
  'DRIVER',
  'ADMIN',
  'SUPER_ADMIN',
]);
export const accountStatusEnum = pgEnum('account_status', [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'DELETED',
]);
export const languageEnum = pgEnum('language', ['ar', 'fr']);
export const otpPurposeEnum = pgEnum('otp_purpose', [
  'REGISTER',
  'LOGIN',
  'RESET_PASSWORD',
  'VERIFY_PHONE',
  'VERIFY_EMAIL',
]);
export const otpTargetTypeEnum = pgEnum('otp_target_type', ['PHONE', 'EMAIL']);
export const devicePlatformEnum = pgEnum('device_platform', [
  'ios',
  'android',
  'web',
]);
export const consentTypeEnum = pgEnum('consent_type', [
  'TERMS',
  'PRIVACY',
  'HEALTH_DATA_PROCESSING',
  'SHARE_PRESCRIPTION_WITH_PHARMACY',
]);
export const invitationStatusEnum = pgEnum('invitation_status', [
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED',
]);

// ---------- Files ----------
export const filePurposeEnum = pgEnum('file_purpose', [
  'PRESCRIPTION',
  'CHIFA_CARD',
  'PHARMACY_DOC',
  'DRIVER_DOC',
  'MESSAGE_ATTACHMENT',
  'PROOF_OF_DELIVERY',
  'DEPENDANT_PROOF',
]);
export const malwareScanStatusEnum = pgEnum('malware_scan_status', [
  'PENDING',
  'CLEAN',
  'INFECTED',
]);

// ---------- Patient ----------
export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE']);
export const relationshipEnum = pgEnum('relationship', [
  'CHILD',
  'PARENT',
  'SPOUSE',
  'OTHER',
]);
export const dependantAuthorizationEnum = pgEnum(
  'dependant_authorization_status',
  ['DECLARED', 'VERIFIED', 'REJECTED'],
);

// ---------- Pharmacy ----------
export const pharmacyStatusEnum = pgEnum('pharmacy_status', [
  'DRAFT',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
]);
export const staffRoleEnum = pgEnum('staff_role', [
  'OWNER',
  'PHARMACIST',
  'ASSISTANT',
]);
export const pharmacyDocTypeEnum = pgEnum('pharmacy_doc_type', [
  'AUTHORIZATION',
  'PHARMACIST_DIPLOMA',
  'ID',
  'TAX',
  'OTHER',
]);
export const documentReviewStatusEnum = pgEnum('document_review_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
]);
export const payoutAccountTypeEnum = pgEnum('payout_account_type', [
  'BANK',
  'CCP',
]);

// ---------- Catalog ----------
export const medicineCategoryEnum = pgEnum('medicine_category', [
  'OTC',
  'PRESCRIPTION',
  'CONTROLLED',
  'COLD_CHAIN',
  'PSYCHOTROPIC',
  'OTHER',
]);
export const stockStatusEnum = pgEnum('stock_status', [
  'IN_STOCK',
  'LOW',
  'OUT_OF_STOCK',
]);

// ---------- Requests ----------
export const requestStatusEnum = pgEnum('request_status', [
  'REQUEST_SUBMITTED',
  'AWAITING_PHARMACY_RESPONSE',
  'CLARIFICATION_REQUIRED',
  'OFFER_AVAILABLE',
  'OFFER_ACCEPTED',
  'EXPIRED',
  'CANCELLED',
]);
export const requestUrgencyEnum = pgEnum('request_urgency', [
  'NORMAL',
  'URGENT',
]);
export const requestTypeEnum = pgEnum('request_type', [
  'PRESCRIPTION',
  'CHIFA',
  'PRODUCT',
]);
export const fileQualityStatusEnum = pgEnum('file_quality_status', [
  'UNCHECKED',
  'READABLE',
  'UNREADABLE',
]);
export const requestItemSourceEnum = pgEnum('request_item_source', [
  'PATIENT',
  'OCR',
  'PHARMACIST',
]);
export const ocrStatusEnum = pgEnum('ocr_status', [
  'PENDING',
  'COMPLETED',
  'FAILED',
]);
export const chifaVerificationStatusEnum = pgEnum('chifa_verification_status', [
  'NOT_VERIFIED',
  'PENDING_OFFICIAL_CHECK',
  'VERIFIED',
  'FAILED',
]);
export const recipientStatusEnum = pgEnum('recipient_status', [
  'SENT',
  'VIEWED',
  'INTERESTED',
  'DECLINED',
  'CLARIFICATION_ASKED',
  'OFFERED',
  'EXPIRED',
]);

// ---------- Offers ----------
export const offerStatusEnum = pgEnum('offer_status', [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'WITHDRAWN',
]);
export const itemAvailabilityEnum = pgEnum('item_availability', [
  'AVAILABLE',
  'PARTIAL',
  'UNAVAILABLE',
  'ALTERNATIVE',
]);
export const patientApprovalEnum = pgEnum('patient_approval', [
  'NOT_REQUIRED',
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

// ---------- Messaging ----------
export const conversationStatusEnum = pgEnum('conversation_status', [
  'OPEN',
  'CLOSED',
]);
export const messageTypeEnum = pgEnum('message_type', [
  'TEXT',
  'IMAGE',
  'SYSTEM',
  'CLARIFICATION_QUESTION',
  'CLARIFICATION_ANSWER',
]);
export const notificationChannelEnum = pgEnum('notification_channel', [
  'IN_APP',
  'PUSH',
  'SMS',
  'EMAIL',
]);
export const notificationStatusEnum = pgEnum('notification_status', [
  'QUEUED',
  'SENT',
  'FAILED',
]);

// ---------- Orders ----------
export const orderStatusEnum = pgEnum('order_status', [
  'AWAITING_PAYMENT',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'PHARMACIST_VALIDATION_PENDING',
  'PREPARING',
  'READY_FOR_PICKUP',
  'DELIVERY_ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'FAILED',
]);
export const fulfillmentTypeEnum = pgEnum('fulfillment_type', [
  'DELIVERY',
  'PICKUP',
]);

// ---------- Payments ----------
export const paymentProviderEnum = pgEnum('payment_provider', [
  'EDAHABIA_SATIM',
  'MOCK',
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  'INITIATED',
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
]);
export const refundStatusEnum = pgEnum('refund_status', [
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
]);
export const commissionScopeEnum = pgEnum('commission_scope', [
  'GLOBAL',
  'PHARMACY',
]);
export const commissionTypeEnum = pgEnum('commission_type', [
  'PERCENT',
  'FIXED',
  'SUBSCRIPTION',
]);
export const settlementStatusEnum = pgEnum('settlement_status', [
  'DRAFT',
  'APPROVED',
  'PAID',
]);

// ---------- Delivery ----------
export const deliveryCompanyStatusEnum = pgEnum('delivery_company_status', [
  'PENDING_VERIFICATION',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
]);
export const deliveryCompanyDocTypeEnum = pgEnum('delivery_company_doc_type', [
  'COMMERCIAL_REGISTER',
  'TAX',
  'ID',
  'INSURANCE',
  'OTHER',
]);
export const driverStatusEnum = pgEnum('driver_status', [
  'PENDING_VERIFICATION',
  'VERIFIED',
  'SUSPENDED',
]);
export const vehicleTypeEnum = pgEnum('vehicle_type', [
  'MOTORCYCLE',
  'CAR',
  'VAN',
  'BIKE',
]);
export const deliveryStatusEnum = pgEnum('delivery_status', [
  'AVAILABLE',
  'ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURNED',
  'CANCELLED',
]);
export const proofTypeEnum = pgEnum('proof_type', [
  'OTP',
  'SIGNATURE',
  'PHOTO_NO_FACE',
]);

// ---------- Support & governance ----------
export const complaintAgainstTypeEnum = pgEnum('complaint_against_type', [
  'PHARMACY',
  'DRIVER',
  'PATIENT',
  'PLATFORM',
]);
export const complaintStatusEnum = pgEnum('complaint_status', [
  'OPEN',
  'IN_REVIEW',
  'RESOLVED',
  'REJECTED',
  'ESCALATED',
]);
export const sensitiveResourceTypeEnum = pgEnum('sensitive_resource_type', [
  'PRESCRIPTION',
  'CHIFA',
  'PATIENT_PROFILE',
]);
export const retentionJobStatusEnum = pgEnum('retention_job_status', [
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
]);

export type Role = (typeof roleEnum.enumValues)[number];
export type AccountStatus = (typeof accountStatusEnum.enumValues)[number];
export type Language = (typeof languageEnum.enumValues)[number];
export type OtpPurpose = (typeof otpPurposeEnum.enumValues)[number];
export type ConsentType = (typeof consentTypeEnum.enumValues)[number];
export type StaffRole = (typeof staffRoleEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
