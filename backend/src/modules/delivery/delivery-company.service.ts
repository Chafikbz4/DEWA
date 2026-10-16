import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { Lang } from '../../common/i18n/i18n.service';
import {
  maskIdentifier,
  NormalizedIdentifier,
  normalizeEmail,
  normalizePhone,
} from '../../common/utils/identifier';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  deliveries,
  deliveryCompanies,
  deliveryCompanyDocuments,
  deliveryDriverInvitations,
  drivers,
  users,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { MessageSender } from '../messaging-providers/message-sender.service';
import { DRIVER_ACTIVE } from './delivery-state';
import { periodOf } from './driver-jobs.service';
import {
  CompanyDocumentDto,
  CompanyDriversQueryDto,
  InviteDriverDto,
  PeriodQueryDto,
} from './dto/delivery.dto';

type InvitationRow = typeof deliveryDriverInvitations.$inferSelect;
type CompanyRow = typeof deliveryCompanies.$inferSelect;

const targetOf = (
  i: Pick<InvitationRow, 'email' | 'phone'>,
): NormalizedIdentifier =>
  i.phone
    ? { type: 'PHONE', value: i.phone }
    : { type: 'EMAIL', value: i.email! };

const presentInvitation = (i: InvitationRow) => ({
  id: i.id,
  target_masked: maskIdentifier(targetOf(i)),
  status:
    i.status === 'PENDING' && i.expiresAt < new Date() ? 'EXPIRED' : i.status,
  expires_at: i.expiresAt,
  accepted_at: i.acceptedAt,
  created_at: i.createdAt,
});

/** Delivery company administration: profile, documents, drivers, invitations, reports. */
@Injectable()
export class DeliveryCompanyService {
  private readonly ttlDays: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly crypto: CryptoService,
    private readonly files: FilesService,
    private readonly sender: MessageSender,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.ttlDays = config.get<number>('STAFF_INVITATION_TTL_DAYS', 7);
  }

  async companyOf(user: AuthUser): Promise<CompanyRow> {
    const [c] = await this.db
      .select()
      .from(deliveryCompanies)
      .where(eq(deliveryCompanies.adminUserId, user.id))
      .limit(1);
    if (!c) throw new AppException('DELIVERY_COMPANY_NOT_FOUND');
    return c;
  }

  private async verifiedCompany(user: AuthUser) {
    const c = await this.companyOf(user);
    if (c.status !== 'VERIFIED' || user.status !== 'ACTIVE')
      throw new AppException('DELIVERY_COMPANY_NOT_VERIFIED');
    return c;
  }

  async me(user: AuthUser) {
    const c = await this.companyOf(user);
    const docs = await this.db
      .select()
      .from(deliveryCompanyDocuments)
      .where(eq(deliveryCompanyDocuments.companyId, c.id))
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
      verified_at: c.verifiedAt,
      documents: docs.map((d) => ({
        id: d.id,
        doc_type: d.docType,
        file_id: d.fileId,
        review_status: d.reviewStatus,
        review_note: d.reviewNote,
        created_at: d.createdAt,
      })),
    };
  }

  async addDocument(user: AuthUser, dto: CompanyDocumentDto) {
    const c = await this.companyOf(user);
    await this.files.assertUsable(
      user.id,
      [dto.file_id],
      ['DELIVERY_COMPANY_DOC'],
    );
    const [row] = await this.db
      .insert(deliveryCompanyDocuments)
      .values({ companyId: c.id, docType: dto.doc_type, fileId: dto.file_id })
      .returning();
    return {
      id: row.id,
      doc_type: row.docType,
      file_id: row.fileId,
      review_status: row.reviewStatus,
      created_at: row.createdAt,
    };
  }

  // ------------------------------------------------------------- drivers

  async drivers(user: AuthUser, q: CompanyDriversQueryDto) {
    const c = await this.companyOf(user);
    const conditions: SQL[] = [eq(drivers.companyId, c.id)];
    if (q.available !== undefined)
      conditions.push(eq(drivers.isAvailable, q.available));
    const where = and(...conditions);
    const activeJobs = sql<number>`(SELECT count(*)::int FROM deliveries x WHERE x.driver_id = "drivers"."id" AND x.status IN ('ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY'))`;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ d: drivers, activeJobs })
        .from(drivers)
        .where(where)
        .orderBy(
          q.order === 'asc' ? drivers.createdAt : desc(drivers.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(drivers).where(where),
    ]);
    return Paginated.of(
      rows.map(({ d, activeJobs: n }) => ({
        id: d.id,
        first_name: d.firstName,
        last_name: d.lastName,
        vehicle_type: d.vehicleType,
        plate_number: d.plateNumber,
        status: d.status,
        is_available: d.isAvailable,
        active_jobs: n,
        last_location_at: d.lastLocationAt,
        joined_at: d.updatedAt,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  /** Removes a driver from the company (not while carrying a parcel). */
  async removeDriver(user: AuthUser, driverId: string, meta: RequestMeta) {
    const c = await this.companyOf(user);
    const [d] = await this.db
      .select()
      .from(drivers)
      .where(and(eq(drivers.id, driverId), eq(drivers.companyId, c.id)))
      .limit(1);
    if (!d) throw new AppException('DELIVERY_DRIVER_NOT_FOUND');
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.driverId, d.id),
          inArray(deliveries.status, DRIVER_ACTIVE),
        ),
      );
    if (n > 0) throw new AppException('DELIVERY_DRIVER_BUSY');
    await this.db
      .update(drivers)
      .set({ companyId: null, isAvailable: false })
      .where(eq(drivers.id, d.id));
    await this.audit.log({
      action: 'DELIVERY_DRIVER_REMOVED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'driver',
      resourceId: d.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { company_id: c.id },
    });
    return { id: d.id, company_id: null };
  }

  // --------------------------------------------------------- invitations

  async invite(user: AuthUser, dto: InviteDriverDto, meta: RequestMeta) {
    const c = await this.verifiedCompany(user);
    const email = dto.email ? normalizeEmail(dto.email) : null;
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (!email && !phone) throw new AppException('AUTH_IDENTIFIER_REQUIRED');
    const token = this.crypto.randomToken(32);
    const expiresAt = new Date(Date.now() + this.ttlDays * 86_400_000);
    const invitation = await this.db.transaction(async (tx) => {
      const sameTarget = [
        ...(email ? [eq(deliveryDriverInvitations.email, email)] : []),
        ...(phone ? [eq(deliveryDriverInvitations.phone, phone)] : []),
      ];
      await tx
        .update(deliveryDriverInvitations)
        .set({ status: 'REVOKED' })
        .where(
          and(
            eq(deliveryDriverInvitations.companyId, c.id),
            eq(deliveryDriverInvitations.status, 'PENDING'),
            or(...sameTarget),
          ),
        );
      const [row] = await tx
        .insert(deliveryDriverInvitations)
        .values({
          companyId: c.id,
          email,
          phone,
          tokenHash: this.crypto.hmac(token),
          expiresAt,
          invitedBy: user.id,
        })
        .returning();
      await this.audit.log(
        {
          action: 'DELIVERY_DRIVER_INVITED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'delivery_company',
          resourceId: c.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: { invitation_id: row.id },
        },
        tx,
      );
      return row;
    });
    const target = targetOf(invitation);
    await this.sender.send(
      target.type,
      target.value,
      'driver_invitation',
      user.preferredLanguage as Lang,
      {
        company: c.name,
        token,
        days: this.ttlDays,
      },
    );
    return presentInvitation(invitation);
  }

  async invitations(user: AuthUser, q: PaginationQueryDto) {
    const c = await this.companyOf(user);
    const where = eq(deliveryDriverInvitations.companyId, c.id);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(deliveryDriverInvitations)
        .where(where)
        .orderBy(
          q.order === 'asc'
            ? deliveryDriverInvitations.createdAt
            : desc(deliveryDriverInvitations.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db
        .select({ total: count() })
        .from(deliveryDriverInvitations)
        .where(where),
    ]);
    return Paginated.of(rows.map(presentInvitation), total, q.page, q.limit);
  }

  async revokeInvitation(user: AuthUser, id: string) {
    const c = await this.companyOf(user);
    const [row] = await this.db
      .update(deliveryDriverInvitations)
      .set({ status: 'REVOKED' })
      .where(
        and(
          eq(deliveryDriverInvitations.id, id),
          eq(deliveryDriverInvitations.companyId, c.id),
          eq(deliveryDriverInvitations.status, 'PENDING'),
        ),
      )
      .returning();
    if (!row) throw new AppException('DELIVERY_INVITATION_INVALID');
    return presentInvitation(row);
  }

  /**
   * A registered driver joins the inviting company. The token must have been
   * sent to the driver's own phone / email.
   */
  async acceptInvitation(user: AuthUser, token: string, meta: RequestMeta) {
    const [driver] = await this.db
      .select()
      .from(drivers)
      .where(eq(drivers.userId, user.id))
      .limit(1);
    if (!driver) throw new AppException('DRIVER_PROFILE_NOT_FOUND');
    const [u] = await this.db
      .select({ email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, user.id));
    const [inv] = await this.db
      .select()
      .from(deliveryDriverInvitations)
      .where(
        and(
          eq(deliveryDriverInvitations.tokenHash, this.crypto.hmac(token)),
          eq(deliveryDriverInvitations.status, 'PENDING'),
        ),
      )
      .limit(1);
    const matches =
      inv &&
      ((inv.phone && inv.phone === u.phone) ||
        (inv.email && inv.email === u.email));
    if (!inv || inv.expiresAt < new Date() || !matches)
      throw new AppException('DELIVERY_INVITATION_INVALID');
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.driverId, driver.id),
          inArray(deliveries.status, DRIVER_ACTIVE),
        ),
      );
    if (n > 0) throw new AppException('DELIVERY_DRIVER_BUSY');
    await this.db.transaction(async (tx) => {
      await tx
        .update(drivers)
        .set({ companyId: inv.companyId })
        .where(eq(drivers.id, driver.id));
      await tx
        .update(deliveryDriverInvitations)
        .set({
          status: 'ACCEPTED',
          acceptedByUserId: user.id,
          acceptedAt: new Date(),
        })
        .where(eq(deliveryDriverInvitations.id, inv.id));
      await this.audit.log(
        {
          action: 'DELIVERY_DRIVER_JOINED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'delivery_company',
          resourceId: inv.companyId,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: { driver_id: driver.id },
        },
        tx,
      );
    });
    const [c] = await this.db
      .select({
        id: deliveryCompanies.id,
        name: deliveryCompanies.name,
        status: deliveryCompanies.status,
      })
      .from(deliveryCompanies)
      .where(eq(deliveryCompanies.id, inv.companyId));
    return { driver_id: driver.id, company: c };
  }

  // ------------------------------------------------------------- reports

  /** Activity of the company's jobs in a period: volumes, success rate, money, per driver. */
  async reports(user: AuthUser, q: PeriodQueryDto) {
    const c = await this.companyOf(user);
    const { from, toExclusive } = periodOf(q);
    const inPeriod = and(
      eq(deliveries.companyId, c.id),
      gte(deliveries.assignedAt, from),
      lt(deliveries.assignedAt, toExclusive),
    );
    const byStatus = await this.db
      .select({
        status: deliveries.status,
        n: sql<number>`count(*)::int`,
        fees: sql<number>`coalesce(sum(${deliveries.deliveryFeeCentimes}), 0)::bigint`,
        payouts: sql<number>`coalesce(sum(${deliveries.driverPayoutCentimes}), 0)::bigint`,
        avgMinutes: sql<
          number | null
        >`avg(extract(epoch FROM (${deliveries.deliveredAt} - ${deliveries.assignedAt})) / 60)`,
      })
      .from(deliveries)
      .where(inPeriod)
      .groupBy(deliveries.status);
    const perDriver = await this.db
      .select({
        driverId: drivers.id,
        firstName: drivers.firstName,
        lastName: drivers.lastName,
        delivered: sql<number>`count(*) FILTER (WHERE ${deliveries.status} = 'DELIVERED')::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${deliveries.status} IN ('FAILED','RETURNED'))::int`,
        payouts: sql<number>`coalesce(sum(${deliveries.driverPayoutCentimes}) FILTER (WHERE ${deliveries.status} = 'DELIVERED'), 0)::bigint`,
      })
      .from(deliveries)
      .innerJoin(drivers, eq(drivers.id, deliveries.driverId))
      .where(inPeriod)
      .groupBy(drivers.id, drivers.firstName, drivers.lastName)
      .orderBy(desc(sql`count(*)`));

    const get = (s: string) => byStatus.find((r) => r.status === s);
    const delivered = get('DELIVERED');
    const failed = (get('FAILED')?.n ?? 0) + (get('RETURNED')?.n ?? 0);
    const finished = (delivered?.n ?? 0) + failed;
    return {
      from: from.toISOString().slice(0, 10),
      to: new Date(toExclusive.getTime() - 86_400_000)
        .toISOString()
        .slice(0, 10),
      by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
      delivered: delivered?.n ?? 0,
      failed,
      success_rate: finished
        ? Math.round(((delivered?.n ?? 0) / finished) * 1000) / 10
        : null,
      delivery_fees_centimes: Number(delivered?.fees ?? 0),
      driver_payouts_centimes: Number(delivered?.payouts ?? 0),
      average_delivery_minutes:
        delivered?.avgMinutes != null
          ? Math.round(Number(delivered.avgMinutes))
          : null,
      drivers: perDriver.map((d) => ({
        driver_id: d.driverId,
        name: `${d.firstName} ${d.lastName.charAt(0)}.`,
        delivered: d.delivered,
        failed: d.failed,
        payouts_centimes: Number(d.payouts),
      })),
      currency: 'DZD',
      records_only: true,
    };
  }
}
