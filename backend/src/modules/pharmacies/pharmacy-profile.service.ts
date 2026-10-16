import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, ne } from 'drizzle-orm';
import { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { normalizeEmail, normalizePhone } from '../../common/utils/identifier';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  pharmacies,
  pharmacyDocuments,
  pharmacyOnDutySchedule,
  pharmacyOpeningHours,
  pharmacyPayoutAccounts,
  pharmacyServiceAreas,
  pharmacyStaff,
  staffProfiles,
  users,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/services/token.service';
import { FilesService } from '../files/files.service';
import { GeoService } from '../geo/geo.service';
import {
  AddDocumentDto,
  DocumentDto,
  OnDutyDto,
  PayoutAccountDto,
  PharmacyMeDto,
  PutOpeningHoursDto,
  ServiceAreaDto,
  UpdatePharmacyDto,
  UpdateStaffDto,
  VerificationStatusDto,
} from './dto/pharmacy.dto';

/** Documents required before a pharmacy can be submitted for verification. */
export const REQUIRED_PHARMACY_DOCS = [
  'AUTHORIZATION',
  'PHARMACIST_DIPLOMA',
  'ID',
] as const;
const LEGAL_FIELDS = [
  'legal_name',
  'authorization_number',
  'tax_id_nif',
  'commercial_register_rc',
] as const;

type PharmacyRow = typeof pharmacies.$inferSelect;
type DocRow = typeof pharmacyDocuments.$inferSelect;

const presentDoc = (d: DocRow): DocumentDto => ({
  id: d.id,
  doc_type: d.docType,
  file_id: d.fileId,
  review_status: d.reviewStatus,
  review_note: d.reviewNote,
  reviewed_at: d.reviewedAt,
  created_at: d.createdAt,
});

@Injectable()
export class PharmacyProfileService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly crypto: CryptoService,
    private readonly geo: GeoService,
    private readonly files: FilesService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  private async load(id: string): Promise<PharmacyRow> {
    const [p] = await this.db
      .select()
      .from(pharmacies)
      .where(eq(pharmacies.id, id))
      .limit(1);
    if (!p) throw new AppException('PHARMACY_NOT_FOUND');
    return p;
  }

  private present(p: PharmacyRow, staffRole: string): PharmacyMeDto {
    return {
      id: p.id,
      name_fr: p.nameFr,
      name_ar: p.nameAr,
      legal_name: p.legalName,
      authorization_number: p.authorizationNumber,
      tax_id_nif: p.taxIdNif,
      commercial_register_rc: p.commercialRegisterRc,
      wilaya_id: p.wilayaId,
      commune_id: p.communeId,
      address_line: p.addressLine,
      latitude: p.latitude,
      longitude: p.longitude,
      phone: p.phone,
      email: p.email,
      status: p.status,
      rejection_reason: p.rejectionReason,
      submitted_for_review_at: p.submittedForReviewAt,
      verified_at: p.verifiedAt,
      accepts_requests: p.acceptsRequests,
      delivery_available: p.deliveryAvailable,
      avg_response_minutes: p.avgResponseMinutes,
      my_staff_role: staffRole,
      updated_at: p.updatedAt,
    };
  }

  async me(ph: PharmacyContext) {
    return this.present(await this.load(ph.id), ph.staffRole);
  }

  async update(
    user: AuthUser,
    ph: PharmacyContext,
    dto: UpdatePharmacyDto,
    meta: RequestMeta,
  ) {
    const p = await this.load(ph.id);
    const touchedLegal = LEGAL_FIELDS.filter((f) => dto[f] !== undefined);
    if (p.status === 'VERIFIED' && touchedLegal.length) {
      throw new AppException('PHARMACY_FIELD_LOCKED', { fields: touchedLegal });
    }
    if (dto.wilaya_id !== undefined || dto.commune_id !== undefined) {
      await this.geo.assertCommuneInWilaya(
        dto.commune_id ?? p.communeId,
        dto.wilaya_id ?? p.wilayaId,
      );
    }
    if (
      dto.authorization_number &&
      dto.authorization_number !== p.authorizationNumber
    ) {
      const [taken] = await this.db
        .select({ id: pharmacies.id })
        .from(pharmacies)
        .where(
          and(
            eq(pharmacies.authorizationNumber, dto.authorization_number),
            ne(pharmacies.id, p.id),
          ),
        )
        .limit(1);
      if (taken) throw new AppException('PHARMACY_AUTHORIZATION_NUMBER_TAKEN');
    }
    const [updated] = await this.db
      .update(pharmacies)
      .set({
        nameFr: dto.name_fr,
        nameAr: dto.name_ar,
        legalName: dto.legal_name,
        authorizationNumber: dto.authorization_number,
        taxIdNif: dto.tax_id_nif,
        commercialRegisterRc: dto.commercial_register_rc,
        wilayaId: dto.wilaya_id,
        communeId: dto.commune_id,
        addressLine: dto.address_line,
        latitude: dto.latitude,
        longitude: dto.longitude,
        phone: dto.phone ? normalizePhone(dto.phone) : undefined,
        email: dto.email ? normalizeEmail(dto.email) : undefined,
        deliveryAvailable: dto.delivery_available,
        acceptsRequests: dto.accepts_requests,
      })
      .where(eq(pharmacies.id, p.id))
      .returning();
    await this.audit.log({
      action: 'PHARMACY_PROFILE_UPDATED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'pharmacy',
      resourceId: p.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { fields: Object.keys(dto) },
    });
    return this.present(updated, ph.staffRole);
  }

  // ------------------------------------------------------- hours & on duty

  async openingHours(ph: PharmacyContext) {
    const rows = await this.db
      .select()
      .from(pharmacyOpeningHours)
      .where(eq(pharmacyOpeningHours.pharmacyId, ph.id))
      .orderBy(asc(pharmacyOpeningHours.dayOfWeek));
    return rows.map((h) => ({
      day_of_week: h.dayOfWeek,
      is_closed: h.isClosed,
      is_24h: h.is24h,
      open_time: h.openTime?.slice(0, 5) ?? null,
      close_time: h.closeTime?.slice(0, 5) ?? null,
    }));
  }

  async putOpeningHours(ph: PharmacyContext, dto: PutOpeningHoursDto) {
    const days = new Set<number>();
    for (const d of dto.days) {
      if (days.has(d.day_of_week))
        throw new AppException('OPENING_HOURS_INVALID', {
          day_of_week: d.day_of_week,
        });
      days.add(d.day_of_week);
      const needsTimes = !d.is_closed && !d.is_24h;
      if (
        needsTimes &&
        (!d.open_time || !d.close_time || d.open_time === d.close_time)
      ) {
        throw new AppException('OPENING_HOURS_INVALID', {
          day_of_week: d.day_of_week,
        });
      }
    }
    await this.db.transaction(async (tx) => {
      await tx
        .delete(pharmacyOpeningHours)
        .where(eq(pharmacyOpeningHours.pharmacyId, ph.id));
      if (dto.days.length) {
        await tx.insert(pharmacyOpeningHours).values(
          dto.days.map((d) => ({
            pharmacyId: ph.id,
            dayOfWeek: d.day_of_week,
            isClosed: d.is_closed,
            is24h: d.is_24h,
            openTime: d.is_closed || d.is_24h ? null : d.open_time,
            closeTime: d.is_closed || d.is_24h ? null : d.close_time,
          })),
        );
      }
    });
    return this.openingHours(ph);
  }

  async listOnDuty(ph: PharmacyContext, q: PaginationQueryDto) {
    const where = and(
      eq(pharmacyOnDutySchedule.pharmacyId, ph.id),
      gt(pharmacyOnDutySchedule.dateTo, new Date()),
    );
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(pharmacyOnDutySchedule)
        .where(where)
        .orderBy(
          q.order === 'desc'
            ? desc(pharmacyOnDutySchedule.dateFrom)
            : asc(pharmacyOnDutySchedule.dateFrom),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db
        .select({ total: count() })
        .from(pharmacyOnDutySchedule)
        .where(where),
    ]);
    return Paginated.of(
      rows.map((r) => ({
        id: r.id,
        date_from: r.dateFrom,
        date_to: r.dateTo,
        created_at: r.createdAt,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  async addOnDuty(ph: PharmacyContext, dto: OnDutyDto) {
    const from = new Date(dto.date_from);
    const to = new Date(dto.date_to);
    if (
      to <= from ||
      to <= new Date() ||
      to.getTime() - from.getTime() > 14 * 86_400_000
    ) {
      throw new AppException('VALIDATION_FAILED', [
        {
          field: 'date_to',
          errors: [{ rule: 'min', message_key: 'validation.min' }],
        },
      ]);
    }
    const [r] = await this.db
      .insert(pharmacyOnDutySchedule)
      .values({ pharmacyId: ph.id, dateFrom: from, dateTo: to })
      .returning();
    return {
      id: r.id,
      date_from: r.dateFrom,
      date_to: r.dateTo,
      created_at: r.createdAt,
    };
  }

  async deleteOnDuty(ph: PharmacyContext, id: string) {
    const res = await this.db
      .delete(pharmacyOnDutySchedule)
      .where(
        and(
          eq(pharmacyOnDutySchedule.id, id),
          eq(pharmacyOnDutySchedule.pharmacyId, ph.id),
        ),
      )
      .returning({ id: pharmacyOnDutySchedule.id });
    if (!res.length) throw new AppException('ON_DUTY_NOT_FOUND');
    return { ok: true };
  }

  // --------------------------------------------------------- service areas

  async listServiceAreas(ph: PharmacyContext) {
    const rows = await this.db
      .select()
      .from(pharmacyServiceAreas)
      .where(eq(pharmacyServiceAreas.pharmacyId, ph.id));
    return rows.map((r) => ({
      id: r.id,
      wilaya_id: r.wilayaId,
      commune_id: r.communeId,
      max_radius_km: r.maxRadiusKm,
    }));
  }

  private async validateArea(dto: ServiceAreaDto) {
    if (dto.commune_id)
      await this.geo.assertCommuneInWilaya(dto.commune_id, dto.wilaya_id);
  }

  async addServiceArea(ph: PharmacyContext, dto: ServiceAreaDto) {
    await this.validateArea(dto);
    const [r] = await this.db
      .insert(pharmacyServiceAreas)
      .values({
        pharmacyId: ph.id,
        wilayaId: dto.wilaya_id,
        communeId: dto.commune_id ?? null,
        maxRadiusKm: dto.max_radius_km ?? null,
      })
      .returning();
    return {
      id: r.id,
      wilaya_id: r.wilayaId,
      commune_id: r.communeId,
      max_radius_km: r.maxRadiusKm,
    };
  }

  async updateServiceArea(
    ph: PharmacyContext,
    id: string,
    dto: ServiceAreaDto,
  ) {
    await this.validateArea(dto);
    const [r] = await this.db
      .update(pharmacyServiceAreas)
      .set({
        wilayaId: dto.wilaya_id,
        communeId: dto.commune_id ?? null,
        maxRadiusKm: dto.max_radius_km ?? null,
      })
      .where(
        and(
          eq(pharmacyServiceAreas.id, id),
          eq(pharmacyServiceAreas.pharmacyId, ph.id),
        ),
      )
      .returning();
    if (!r) throw new AppException('SERVICE_AREA_NOT_FOUND');
    return {
      id: r.id,
      wilaya_id: r.wilayaId,
      commune_id: r.communeId,
      max_radius_km: r.maxRadiusKm,
    };
  }

  async deleteServiceArea(ph: PharmacyContext, id: string) {
    const res = await this.db
      .delete(pharmacyServiceAreas)
      .where(
        and(
          eq(pharmacyServiceAreas.id, id),
          eq(pharmacyServiceAreas.pharmacyId, ph.id),
        ),
      )
      .returning({ id: pharmacyServiceAreas.id });
    if (!res.length) throw new AppException('SERVICE_AREA_NOT_FOUND');
    return { ok: true };
  }

  // -------------------------------------------------------- payout accounts

  private presentPayout(r: typeof pharmacyPayoutAccounts.$inferSelect) {
    let masked = '****';
    try {
      masked =
        CryptoService.mask(
          this.crypto.decrypt(r.accountNumberEncrypted).replace(/\s/g, ''),
        ) ?? '****';
    } catch {
      /* keep generic mask */
    }
    return {
      id: r.id,
      account_type: r.accountType,
      holder_name: r.holderName,
      account_number_masked: masked,
      verified: r.verified,
      created_at: r.createdAt,
    };
  }

  async listPayouts(ph: PharmacyContext) {
    const rows = await this.db
      .select()
      .from(pharmacyPayoutAccounts)
      .where(eq(pharmacyPayoutAccounts.pharmacyId, ph.id));
    return rows.map((r) => this.presentPayout(r));
  }

  async addPayout(
    user: AuthUser,
    ph: PharmacyContext,
    dto: PayoutAccountDto,
    meta: RequestMeta,
  ) {
    const [r] = await this.db
      .insert(pharmacyPayoutAccounts)
      .values({
        pharmacyId: ph.id,
        accountType: dto.account_type,
        holderName: dto.holder_name,
        accountNumberEncrypted: this.crypto.encrypt(
          dto.account_number.replace(/\s/g, ''),
        ),
        verified: false,
      })
      .returning();
    await this.audit.log({
      action: 'PAYOUT_ACCOUNT_ADDED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'pharmacy',
      resourceId: ph.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { payout_account_id: r.id, type: dto.account_type },
    });
    return this.presentPayout(r);
  }

  async deletePayout(
    user: AuthUser,
    ph: PharmacyContext,
    id: string,
    meta: RequestMeta,
  ) {
    const res = await this.db
      .delete(pharmacyPayoutAccounts)
      .where(
        and(
          eq(pharmacyPayoutAccounts.id, id),
          eq(pharmacyPayoutAccounts.pharmacyId, ph.id),
        ),
      )
      .returning({ id: pharmacyPayoutAccounts.id });
    if (!res.length) throw new AppException('PAYOUT_ACCOUNT_NOT_FOUND');
    await this.audit.log({
      action: 'PAYOUT_ACCOUNT_REMOVED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'pharmacy',
      resourceId: ph.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { payout_account_id: id },
    });
    return { ok: true };
  }

  // ------------------------------------------------- documents/verification

  async listDocuments(ph: PharmacyContext) {
    const rows = await this.db
      .select()
      .from(pharmacyDocuments)
      .where(eq(pharmacyDocuments.pharmacyId, ph.id))
      .orderBy(desc(pharmacyDocuments.createdAt));
    return rows.map(presentDoc);
  }

  async addDocument(user: AuthUser, ph: PharmacyContext, dto: AddDocumentDto) {
    await this.files.assertUsable(user.id, [dto.file_id], ['PHARMACY_DOC']);
    const [d] = await this.db
      .insert(pharmacyDocuments)
      .values({
        pharmacyId: ph.id,
        docType: dto.doc_type,
        fileId: dto.file_id,
        reviewStatus: 'PENDING',
      })
      .returning();
    return presentDoc(d);
  }

  async deleteDocument(ph: PharmacyContext, id: string) {
    const [d] = await this.db
      .select()
      .from(pharmacyDocuments)
      .where(
        and(
          eq(pharmacyDocuments.id, id),
          eq(pharmacyDocuments.pharmacyId, ph.id),
        ),
      )
      .limit(1);
    if (!d) throw new AppException('PHARMACY_DOCUMENT_NOT_FOUND');
    if (d.reviewStatus !== 'PENDING' && d.reviewStatus !== 'REJECTED')
      throw new AppException('PHARMACY_DOCUMENT_LOCKED');
    await this.db.delete(pharmacyDocuments).where(eq(pharmacyDocuments.id, id));
    return { ok: true };
  }

  private missingDocs(docs: DocRow[]) {
    return REQUIRED_PHARMACY_DOCS.filter(
      (type) =>
        !docs.some(
          (d) =>
            d.docType === type &&
            (d.reviewStatus === 'PENDING' || d.reviewStatus === 'APPROVED'),
        ),
    );
  }

  async verification(ph: PharmacyContext): Promise<VerificationStatusDto> {
    const p = await this.load(ph.id);
    const docs = await this.db
      .select()
      .from(pharmacyDocuments)
      .where(eq(pharmacyDocuments.pharmacyId, ph.id));
    const missing = this.missingDocs(docs);
    return {
      status: p.status,
      rejection_reason: p.rejectionReason,
      submitted_for_review_at: p.submittedForReviewAt,
      verified_at: p.verifiedAt,
      missing_documents: missing,
      documents: docs.map(presentDoc),
      can_submit:
        (p.status === 'DRAFT' || p.status === 'REJECTED') &&
        missing.length === 0,
    };
  }

  /** DRAFT / REJECTED → PENDING_VERIFICATION once all required documents are present. */
  async submitForVerification(
    user: AuthUser,
    ph: PharmacyContext,
    meta: RequestMeta,
  ) {
    const p = await this.load(ph.id);
    if (p.status !== 'DRAFT' && p.status !== 'REJECTED')
      throw new AppException('PHARMACY_VERIFICATION_NOT_ALLOWED', {
        status: p.status,
      });
    const docs = await this.db
      .select()
      .from(pharmacyDocuments)
      .where(eq(pharmacyDocuments.pharmacyId, ph.id));
    const missing = this.missingDocs(docs);
    if (missing.length)
      throw new AppException(
        'PHARMACY_DOCUMENTS_MISSING',
        { types: missing },
        { types: missing.join(', ') },
      );
    await this.db
      .update(pharmacies)
      .set({ status: 'PENDING_VERIFICATION', submittedForReviewAt: new Date() })
      .where(eq(pharmacies.id, p.id));
    await this.audit.log({
      action: 'PHARMACY_SUBMITTED_FOR_VERIFICATION',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'pharmacy',
      resourceId: p.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.verification(ph);
  }

  // ------------------------------------------------------------------ staff

  async listStaff(ph: PharmacyContext, q: PaginationQueryDto) {
    const where = eq(pharmacyStaff.pharmacyId, ph.id);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          s: pharmacyStaff,
          first: staffProfiles.firstName,
          last: staffProfiles.lastName,
          status: users.status,
        })
        .from(pharmacyStaff)
        .innerJoin(users, eq(users.id, pharmacyStaff.userId))
        .leftJoin(staffProfiles, eq(staffProfiles.userId, pharmacyStaff.userId))
        .where(where)
        .orderBy(
          q.order === 'asc'
            ? asc(pharmacyStaff.joinedAt)
            : desc(pharmacyStaff.joinedAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(pharmacyStaff).where(where),
    ]);
    return Paginated.of(
      rows.map(({ s, first, last, status }) => ({
        id: s.id,
        user_id: s.userId,
        first_name: first,
        last_name: last,
        staff_role: s.staffRole,
        is_active: s.isActive,
        pharmacist_license_number: s.pharmacistLicenseNumber,
        account_status: status,
        joined_at: s.joinedAt,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  /** Owner changes a staff member's role or deactivates them. */
  async updateStaff(
    user: AuthUser,
    ph: PharmacyContext,
    staffId: string,
    dto: UpdateStaffDto,
    meta: RequestMeta,
  ) {
    const [s] = await this.db
      .select()
      .from(pharmacyStaff)
      .where(
        and(eq(pharmacyStaff.id, staffId), eq(pharmacyStaff.pharmacyId, ph.id)),
      )
      .limit(1);
    if (!s) throw new AppException('STAFF_NOT_FOUND');
    if (s.staffRole === 'OWNER' || s.userId === user.id)
      throw new AppException('STAFF_CANNOT_MODIFY_OWNER');
    const license = dto.pharmacist_license_number ?? s.pharmacistLicenseNumber;
    if (dto.staff_role === 'PHARMACIST' && !license)
      throw new AppException('STAFF_LICENSE_REQUIRED');

    await this.db.transaction(async (tx) => {
      await tx
        .update(pharmacyStaff)
        .set({
          staffRole: dto.staff_role,
          isActive: dto.is_active,
          pharmacistLicenseNumber: dto.pharmacist_license_number,
        })
        .where(eq(pharmacyStaff.id, staffId));
      if (dto.staff_role && dto.staff_role !== s.staffRole) {
        await tx
          .update(users)
          .set({
            role:
              dto.staff_role === 'PHARMACIST'
                ? 'PHARMACIST'
                : 'PHARMACY_ASSISTANT',
          })
          .where(eq(users.id, s.userId));
      }
      // Role change or deactivation must apply immediately.
      if (
        (dto.staff_role && dto.staff_role !== s.staffRole) ||
        dto.is_active === false
      ) {
        await this.tokens.revokeAllForUser(
          s.userId,
          'pharmacy_staff_changed',
          {},
          tx,
        );
      }
      await this.audit.log(
        {
          action:
            dto.staff_role && dto.staff_role !== s.staffRole
              ? 'USER_ROLE_CHANGED'
              : 'PHARMACY_STAFF_UPDATED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'pharmacy_staff',
          resourceId: staffId,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: {
            from_role: s.staffRole,
            to_role: dto.staff_role,
            is_active: dto.is_active,
          },
        },
        tx,
      );
    });
    const list = await this.listStaff(ph, {
      page: 1,
      limit: 100,
      order: 'desc',
      offset: 0,
    } as PaginationQueryDto);
    return list.items.find((m) => m.id === staffId);
  }

  /** Used by admin verification (Phase 9) and tests. */
  async staffUserIds(
    pharmacyId: string,
    roles: ('OWNER' | 'PHARMACIST' | 'ASSISTANT')[],
  ) {
    const rows = await this.db
      .select({ userId: pharmacyStaff.userId })
      .from(pharmacyStaff)
      .where(
        and(
          eq(pharmacyStaff.pharmacyId, pharmacyId),
          eq(pharmacyStaff.isActive, true),
          inArray(pharmacyStaff.staffRole, roles),
        ),
      );
    return rows.map((r) => r.userId);
  }
}
