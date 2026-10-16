import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, count, desc, eq, inArray, sql, SQL } from 'drizzle-orm';
import { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { DomainEvent } from '../../common/events/domain-events';
import { Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  complaintMessages,
  complaints,
  deliveries,
  drivers,
  orders,
  pharmacies,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import {
  ComplaintMessageDto,
  ComplaintsQueryDto,
  CreateComplaintDto,
} from './dto/complaints.dto';

type ComplaintRow = typeof complaints.$inferSelect;
const CLOSED = ['RESOLVED', 'REJECTED'];

@Injectable()
export class ComplaintsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  presentSummary(c: ComplaintRow) {
    return {
      id: c.id,
      reference: c.reference,
      order_id: c.orderId,
      against_type: c.againstType,
      against_id: c.againstId,
      category: c.category,
      status: c.status,
      created_at: c.createdAt,
      resolved_at: c.resolvedAt,
    };
  }

  async present(c: ComplaintRow, opts: { includeResolution: boolean }) {
    const msgs = await this.db
      .select()
      .from(complaintMessages)
      .where(eq(complaintMessages.complaintId, c.id))
      .orderBy(asc(complaintMessages.createdAt));
    return {
      ...this.presentSummary(c),
      description: c.description,
      resolution_note: opts.includeResolution ? c.resolutionNote : null,
      messages: msgs.map((m) => ({
        id: m.id,
        sender_user_id: m.senderUserId,
        body: m.body,
        file_id: m.fileId,
        created_at: m.createdAt,
      })),
    };
  }

  async create(user: AuthUser, dto: CreateComplaintDto, meta: RequestMeta) {
    if (dto.against_type !== 'PLATFORM' && !dto.against_id) {
      throw new AppException('VALIDATION_FAILED', [
        {
          field: 'against_id',
          errors: [
            { rule: 'isNotEmpty', message_key: 'validation.isNotEmpty' },
          ],
        },
      ]);
    }
    if (dto.order_id) {
      // The reporter must be a party of the order (patient, pharmacy staff or driver).
      const [o] = await this.db
        .select({
          id: orders.id,
          patient: orders.patientUserId,
          pharmacyId: orders.pharmacyId,
          driverUser: drivers.userId,
        })
        .from(orders)
        .leftJoin(deliveries, eq(deliveries.orderId, orders.id))
        .leftJoin(drivers, eq(drivers.id, deliveries.driverId))
        .where(eq(orders.id, dto.order_id))
        .limit(1);
      if (!o || (o.patient !== user.id && o.driverUser !== user.id))
        throw new AppException('NOT_FOUND');
    }
    if (dto.against_type === 'PHARMACY') {
      const [p] = await this.db
        .select({ id: pharmacies.id })
        .from(pharmacies)
        .where(eq(pharmacies.id, dto.against_id!))
        .limit(1);
      if (!p) throw new AppException('PHARMACY_NOT_FOUND');
    }
    const year = new Date().getUTCFullYear();
    const c = await this.db.transaction(async (tx) => {
      const [{ seq }] = (
        await tx.execute<{ seq: string }>(
          sql`SELECT nextval('complaint_reference_seq')::text AS seq`,
        )
      ).rows;
      const [row] = await tx
        .insert(complaints)
        .values({
          reference: `CMP-${year}-${seq.padStart(6, '0')}`,
          orderId: dto.order_id,
          reporterUserId: user.id,
          againstType: dto.against_type,
          againstId: dto.against_id ?? null,
          category: dto.category,
          description: dto.description,
          status: 'OPEN',
        })
        .returning();
      await this.audit.log(
        {
          action: 'COMPLAINT_CREATED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'complaint',
          resourceId: row.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        tx,
      );
      return row;
    });
    this.events.emit(DomainEvent.COMPLAINT_UPDATED, {
      complaintId: c.id,
      status: c.status,
    });
    return this.present(c, { includeResolution: true });
  }

  private async list(where: SQL, q: ComplaintsQueryDto) {
    const conditions = [where];
    if (q.status?.length) conditions.push(inArray(complaints.status, q.status));
    const w = and(...conditions);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(complaints)
        .where(w)
        .orderBy(
          q.order === 'asc'
            ? asc(complaints.createdAt)
            : desc(complaints.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(complaints).where(w),
    ]);
    return Paginated.of(
      rows.map((c) => this.presentSummary(c)),
      total,
      q.page,
      q.limit,
    );
  }

  listMine(user: AuthUser, q: ComplaintsQueryDto) {
    return this.list(eq(complaints.reporterUserId, user.id), q);
  }

  listForPharmacy(ph: PharmacyContext, q: ComplaintsQueryDto) {
    return this.list(
      and(
        eq(complaints.againstType, 'PHARMACY'),
        eq(complaints.againstId, ph.id),
      ) as SQL,
      q,
    );
  }

  private async load(id: string) {
    const [c] = await this.db
      .select()
      .from(complaints)
      .where(eq(complaints.id, id))
      .limit(1);
    if (!c) throw new AppException('COMPLAINT_NOT_FOUND');
    return c;
  }

  async getMine(user: AuthUser, id: string) {
    const c = await this.load(id);
    if (c.reporterUserId !== user.id)
      throw new AppException('COMPLAINT_NOT_FOUND');
    return this.present(c, { includeResolution: true });
  }

  async getForPharmacy(ph: PharmacyContext, id: string) {
    const c = await this.load(id);
    if (c.againstType !== 'PHARMACY' || c.againstId !== ph.id)
      throw new AppException('COMPLAINT_NOT_FOUND');
    return this.present(c, { includeResolution: true });
  }

  async addMessage(
    user: AuthUser,
    c: ComplaintRow,
    dto: ComplaintMessageDto,
    meta: RequestMeta,
  ) {
    if (CLOSED.includes(c.status)) throw new AppException('COMPLAINT_CLOSED');
    if (dto.file_id)
      await this.files.assertUsable(
        user.id,
        [dto.file_id],
        ['MESSAGE_ATTACHMENT'],
      );
    await this.db.insert(complaintMessages).values({
      complaintId: c.id,
      senderUserId: user.id,
      body: dto.body,
      fileId: dto.file_id ?? null,
    });
    await this.audit.log({
      action: 'COMPLAINT_MESSAGE_ADDED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'complaint',
      resourceId: c.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    this.events.emit(DomainEvent.COMPLAINT_UPDATED, {
      complaintId: c.id,
      status: c.status,
    });
    return this.present(await this.load(c.id), { includeResolution: true });
  }

  async replyMine(
    user: AuthUser,
    id: string,
    dto: ComplaintMessageDto,
    meta: RequestMeta,
  ) {
    const c = await this.load(id);
    if (c.reporterUserId !== user.id)
      throw new AppException('COMPLAINT_NOT_FOUND');
    return this.addMessage(user, c, dto, meta);
  }

  async replyAsPharmacy(
    user: AuthUser,
    ph: PharmacyContext,
    id: string,
    dto: ComplaintMessageDto,
    meta: RequestMeta,
  ) {
    const c = await this.load(id);
    if (c.againstType !== 'PHARMACY' || c.againstId !== ph.id)
      throw new AppException('COMPLAINT_NOT_FOUND');
    return this.addMessage(user, c, dto, meta);
  }

  /** Used by the admin module. */
  loadAny(id: string) {
    return this.load(id);
  }
}
