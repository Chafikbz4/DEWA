import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  SQL,
} from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE, Tx } from '../../database/database.module';
import {
  deliveryCompanies,
  deliveryCompanyDocuments,
  dependants,
  driverDocuments,
  drivers,
  pharmacies,
  pharmacyDocuments,
  pharmacyStaff,
  users,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

export const VERIFICATION_KINDS = [
  'pharmacies',
  'delivery-companies',
  'drivers',
  'dependants',
] as const;
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];
export type Decision = 'APPROVED' | 'REJECTED' | 'DOCUMENTS_REQUESTED';

interface DocRow {
  id: string;
  docType: string;
  fileId: string;
  reviewStatus: string;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

const presentDoc = (d: DocRow) => ({
  id: d.id,
  doc_type: d.docType,
  file_id: d.fileId,
  review_status: d.reviewStatus,
  review_note: d.reviewNote,
  reviewed_at: d.reviewedAt,
  uploaded_at: d.createdAt,
});

/**
 * Verification queues for pharmacies, delivery companies, drivers and
 * dependant proofs. Documents are opened through signed URLs
 * (GET /files/:id/access-url, logged). Decisions require a reason when
 * negative, are audited and notify the account holder.
 */
@Injectable()
export class VerificationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- queues

  async queue(
    kind: VerificationKind,
    q: {
      page: number;
      limit: number;
      offset: number;
      order: 'asc' | 'desc';
      status?: string;
    },
  ) {
    const page = <T>(rows: T[], total: number) =>
      Paginated.of(rows, total, q.page, q.limit);
    const dir = <C extends Parameters<typeof asc>[0]>(c: C) =>
      q.order === 'desc' ? desc(c) : asc(c);
    switch (kind) {
      case 'pharmacies': {
        const where = eq(
          pharmacies.status,
          (q.status ?? 'PENDING_VERIFICATION') as never,
        );
        const [rows, [{ total }]] = await Promise.all([
          this.db
            .select()
            .from(pharmacies)
            .where(where)
            .orderBy(dir(pharmacies.submittedForReviewAt))
            .limit(q.limit)
            .offset(q.offset),
          this.db.select({ total: count() }).from(pharmacies).where(where),
        ]);
        return page(
          rows.map((p) => ({
            id: p.id,
            name: p.nameFr,
            legal_name: p.legalName,
            authorization_number: p.authorizationNumber,
            wilaya_id: p.wilayaId,
            commune_id: p.communeId,
            status: p.status,
            submitted_at: p.submittedForReviewAt,
            created_at: p.createdAt,
          })),
          total,
        );
      }
      case 'delivery-companies': {
        const where = eq(
          deliveryCompanies.status,
          (q.status ?? 'PENDING_VERIFICATION') as never,
        );
        const [rows, [{ total }]] = await Promise.all([
          this.db
            .select()
            .from(deliveryCompanies)
            .where(where)
            .orderBy(dir(deliveryCompanies.createdAt))
            .limit(q.limit)
            .offset(q.offset),
          this.db
            .select({ total: count() })
            .from(deliveryCompanies)
            .where(where),
        ]);
        return page(
          rows.map((c) => ({
            id: c.id,
            name: c.name,
            legal_name: c.legalName,
            rc_number: c.rcNumber,
            status: c.status,
            created_at: c.createdAt,
          })),
          total,
        );
      }
      case 'drivers': {
        const where = eq(
          drivers.status,
          (q.status ?? 'PENDING_VERIFICATION') as never,
        );
        const [rows, [{ total }]] = await Promise.all([
          this.db
            .select()
            .from(drivers)
            .where(where)
            .orderBy(dir(drivers.createdAt))
            .limit(q.limit)
            .offset(q.offset),
          this.db.select({ total: count() }).from(drivers).where(where),
        ]);
        return page(
          rows.map((d) => ({
            id: d.id,
            first_name: d.firstName,
            last_name: d.lastName,
            vehicle_type: d.vehicleType,
            plate_number: d.plateNumber,
            company_id: d.companyId,
            status: d.status,
            created_at: d.createdAt,
          })),
          total,
        );
      }
      case 'dependants': {
        const where = and(
          eq(dependants.authorizationStatus, (q.status ?? 'DECLARED') as never),
          isNotNull(dependants.proofFileId),
          isNull(dependants.deletedAt),
        );
        const [rows, [{ total }]] = await Promise.all([
          this.db
            .select()
            .from(dependants)
            .where(where)
            .orderBy(dir(dependants.createdAt))
            .limit(q.limit)
            .offset(q.offset),
          this.db.select({ total: count() }).from(dependants).where(where),
        ]);
        // Proof of the relationship only – no health data.
        return page(
          rows.map((d) => ({
            id: d.id,
            patient_user_id: d.patientUserId,
            first_name: d.firstName,
            last_name: d.lastName,
            relationship: d.relationship,
            authorization_status: d.authorizationStatus,
            proof_file_id: d.proofFileId,
            created_at: d.createdAt,
          })),
          total,
        );
      }
    }
  }

  async get(kind: VerificationKind, id: string) {
    switch (kind) {
      case 'pharmacies': {
        const [p] = await this.db
          .select()
          .from(pharmacies)
          .where(eq(pharmacies.id, id))
          .limit(1);
        if (!p) throw new AppException('NOT_FOUND');
        const docs = await this.db
          .select()
          .from(pharmacyDocuments)
          .where(eq(pharmacyDocuments.pharmacyId, id))
          .orderBy(desc(pharmacyDocuments.createdAt));
        return {
          id: p.id,
          name_fr: p.nameFr,
          name_ar: p.nameAr,
          legal_name: p.legalName,
          authorization_number: p.authorizationNumber,
          tax_id_nif: p.taxIdNif,
          commercial_register_rc: p.commercialRegisterRc,
          address_line: p.addressLine,
          wilaya_id: p.wilayaId,
          commune_id: p.communeId,
          phone: p.phone,
          status: p.status,
          rejection_reason: p.rejectionReason,
          submitted_at: p.submittedForReviewAt,
          verified_at: p.verifiedAt,
          documents: docs.map(presentDoc),
        };
      }
      case 'delivery-companies': {
        const [c] = await this.db
          .select()
          .from(deliveryCompanies)
          .where(eq(deliveryCompanies.id, id))
          .limit(1);
        if (!c) throw new AppException('NOT_FOUND');
        const docs = await this.db
          .select()
          .from(deliveryCompanyDocuments)
          .where(eq(deliveryCompanyDocuments.companyId, id))
          .orderBy(desc(deliveryCompanyDocuments.createdAt));
        return {
          id: c.id,
          name: c.name,
          legal_name: c.legalName,
          tax_id: c.taxId,
          rc_number: c.rcNumber,
          phone: c.phone,
          email: c.email,
          status: c.status,
          admin_user_id: c.adminUserId,
          verified_at: c.verifiedAt,
          documents: docs.map(presentDoc),
        };
      }
      case 'drivers': {
        const [d] = await this.db
          .select()
          .from(drivers)
          .where(eq(drivers.id, id))
          .limit(1);
        if (!d) throw new AppException('NOT_FOUND');
        const docs = await this.db
          .select()
          .from(driverDocuments)
          .where(eq(driverDocuments.driverId, id))
          .orderBy(desc(driverDocuments.createdAt));
        return {
          id: d.id,
          user_id: d.userId,
          first_name: d.firstName,
          last_name: d.lastName,
          vehicle_type: d.vehicleType,
          plate_number: d.plateNumber,
          company_id: d.companyId,
          status: d.status,
          documents: docs.map(presentDoc),
        };
      }
      case 'dependants': {
        const [d] = await this.db
          .select()
          .from(dependants)
          .where(eq(dependants.id, id))
          .limit(1);
        if (!d) throw new AppException('NOT_FOUND');
        return {
          id: d.id,
          patient_user_id: d.patientUserId,
          first_name: d.firstName,
          last_name: d.lastName,
          relationship: d.relationship,
          authorization_status: d.authorizationStatus,
          proof_file_id: d.proofFileId,
          created_at: d.createdAt,
        };
      }
    }
  }

  // -------------------------------------------------------------- decisions

  /** APPROVED / REJECTED / DOCUMENTS_REQUESTED on one entity, atomically. */
  async decide(
    admin: AuthUser,
    kind: VerificationKind,
    id: string,
    decision: Decision,
    input: { reason?: string; note?: string; doc_types?: string[] },
    meta: RequestMeta,
  ) {
    if (decision !== 'APPROVED' && !input.reason)
      throw new AppException('VERIFICATION_REASON_REQUIRED');
    if (decision === 'DOCUMENTS_REQUESTED' && kind === 'dependants')
      throw new AppException('VERIFICATION_INVALID_STATE');
    const now = new Date();
    const review = (status: 'APPROVED' | 'REJECTED') => ({
      reviewStatus: status,
      reviewerAdminId: admin.id,
      reviewNote: input.reason ?? input.note ?? null,
      reviewedAt: now,
    });
    const notifyUserIds: string[] = [];

    await this.db.transaction(async (tx) => {
      switch (kind) {
        case 'pharmacies': {
          const [p] = await tx
            .select()
            .from(pharmacies)
            .where(eq(pharmacies.id, id))
            .limit(1);
          if (!p) throw new AppException('NOT_FOUND');
          if (p.status !== 'PENDING_VERIFICATION')
            throw new AppException('VERIFICATION_INVALID_STATE', {
              status: p.status,
            });
          const staff = await tx
            .select({ userId: pharmacyStaff.userId })
            .from(pharmacyStaff)
            .where(
              and(
                eq(pharmacyStaff.pharmacyId, id),
                eq(pharmacyStaff.staffRole, 'OWNER'),
              ),
            );
          notifyUserIds.push(...staff.map((s) => s.userId));
          await this.reviewDocs(
            tx,
            pharmacyDocuments,
            eq(pharmacyDocuments.pharmacyId, id),
            decision,
            input.doc_types,
            review,
          );
          if (decision === 'APPROVED') {
            await tx
              .update(pharmacies)
              .set({
                status: 'VERIFIED',
                verifiedAt: now,
                verifiedByAdminId: admin.id,
                rejectionReason: null,
              })
              .where(eq(pharmacies.id, id));
            await this.activate(tx, notifyUserIds);
          } else {
            await tx
              .update(pharmacies)
              .set({
                status: decision === 'REJECTED' ? 'REJECTED' : 'DRAFT',
                rejectionReason: input.reason,
              })
              .where(eq(pharmacies.id, id));
          }
          break;
        }
        case 'delivery-companies': {
          const [c] = await tx
            .select()
            .from(deliveryCompanies)
            .where(eq(deliveryCompanies.id, id))
            .limit(1);
          if (!c) throw new AppException('NOT_FOUND');
          if (c.status !== 'PENDING_VERIFICATION')
            throw new AppException('VERIFICATION_INVALID_STATE', {
              status: c.status,
            });
          if (c.adminUserId) notifyUserIds.push(c.adminUserId);
          await this.reviewDocs(
            tx,
            deliveryCompanyDocuments,
            eq(deliveryCompanyDocuments.companyId, id),
            decision,
            input.doc_types,
            review,
          );
          if (decision === 'APPROVED') {
            await tx
              .update(deliveryCompanies)
              .set({
                status: 'VERIFIED',
                verifiedAt: now,
                verifiedByAdminId: admin.id,
              })
              .where(eq(deliveryCompanies.id, id));
            await this.activate(tx, notifyUserIds);
          } else if (decision === 'REJECTED') {
            await tx
              .update(deliveryCompanies)
              .set({ status: 'REJECTED' })
              .where(eq(deliveryCompanies.id, id));
          }
          break;
        }
        case 'drivers': {
          const [d] = await tx
            .select()
            .from(drivers)
            .where(eq(drivers.id, id))
            .limit(1);
          if (!d) throw new AppException('NOT_FOUND');
          if (d.status !== 'PENDING_VERIFICATION')
            throw new AppException('VERIFICATION_INVALID_STATE', {
              status: d.status,
            });
          notifyUserIds.push(d.userId);
          await this.reviewDocs(
            tx,
            driverDocuments,
            eq(driverDocuments.driverId, id),
            decision,
            input.doc_types,
            review,
          );
          if (decision === 'APPROVED') {
            await tx
              .update(drivers)
              .set({ status: 'VERIFIED' })
              .where(eq(drivers.id, id));
            await this.activate(tx, notifyUserIds);
          }
          // Rejected drivers stay PENDING_VERIFICATION with rejected documents (they may upload new ones).
          break;
        }
        case 'dependants': {
          const [d] = await tx
            .select()
            .from(dependants)
            .where(eq(dependants.id, id))
            .limit(1);
          if (!d || d.deletedAt) throw new AppException('NOT_FOUND');
          if (d.authorizationStatus !== 'DECLARED' || !d.proofFileId)
            throw new AppException('VERIFICATION_INVALID_STATE', {
              status: d.authorizationStatus,
            });
          notifyUserIds.push(d.patientUserId);
          await tx
            .update(dependants)
            .set({
              authorizationStatus:
                decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED',
            })
            .where(eq(dependants.id, id));
          break;
        }
      }
      await this.audit.log(
        {
          action: `VERIFICATION_${decision}`,
          actorUserId: admin.id,
          actorRole: admin.role,
          resourceType: kind,
          resourceId: id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          reason: input.reason ?? input.note ?? null,
          metadata: input.doc_types?.length
            ? { doc_types: input.doc_types }
            : undefined,
        },
        tx,
      );
    });

    if (notifyUserIds.length)
      await this.notifications.notify({
        userIds: notifyUserIds,
        type: 'VERIFICATION_DECIDED',
        params: { label_key: `labels.verification_decision.${decision}` },
        data: { kind, id, decision },
      });
    return { ...(await this.get(kind, id)), kind, decision };
  }

  /** Pending documents follow the decision (only the listed types when documents are requested). */
  private async reviewDocs(
    tx: Tx,
    table:
      | typeof pharmacyDocuments
      | typeof deliveryCompanyDocuments
      | typeof driverDocuments,
    owner: SQL | undefined,
    decision: Decision,
    docTypes: string[] | undefined,
    review: (s: 'APPROVED' | 'REJECTED') => Record<string, unknown>,
  ) {
    const conditions = [owner!];
    if (decision === 'DOCUMENTS_REQUESTED') {
      if (docTypes?.length)
        conditions.push(inArray(table.docType, docTypes as never[]));
      else conditions.push(eq(table.reviewStatus, 'PENDING'));
    } else conditions.push(eq(table.reviewStatus, 'PENDING'));
    await tx
      .update(table)
      .set(review(decision === 'APPROVED' ? 'APPROVED' : 'REJECTED') as never)
      .where(and(...conditions));
  }

  /** Accounts waiting for verification become ACTIVE. */
  private async activate(tx: Tx, userIds: string[]) {
    if (!userIds.length) return;
    await tx
      .update(users)
      .set({ status: 'ACTIVE' })
      .where(
        and(
          inArray(users.id, userIds),
          eq(users.status, 'PENDING_VERIFICATION'),
        ),
      );
  }
}
