import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  notInArray,
  sql,
} from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { verifyPassword } from '../../common/crypto/password';
import { AppException } from '../../common/errors/app.exception';
import { UnitOfWork } from '../../common/events/unit-of-work';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  addresses,
  auditLogs,
  chifaSubmissions,
  complaints,
  consentRecords,
  deliveries,
  dependants,
  devices,
  files,
  notificationPreferences,
  notifications,
  orderItems,
  orderStatusHistory,
  orders,
  patientProfiles,
  payments,
  receipts,
  refunds,
  requestFiles,
  requestItems,
  requests,
  staffProfiles,
  users,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/services/token.service';
import { FilesService } from '../files/files.service';
import { RequestLifecycleService } from '../requests/request-lifecycle.service';

/** Never exported: secrets, hashes, storage internals. */
const HIDDEN =
  /(Hash|Encrypted|storageKey|encryptionKeyRef|tokenHash|secret)$/i;
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const clean = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([k]) => !HIDDEN.test(k))
      .map(([k, v]) => [snake(k), v]),
  );

const OPEN_REQUESTS = [
  'REQUEST_SUBMITTED',
  'AWAITING_PHARMACY_RESPONSE',
  'CLARIFICATION_REQUIRED',
  'OFFER_AVAILABLE',
] as const;
const FINISHED_ORDERS = [
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'FAILED',
] as const;

/**
 * Data subject rights: export of one's personal data (Law 18-07 / GDPR-style
 * access & portability) and account deletion by anonymisation, keeping the
 * order / payment / receipt records the law requires.
 */
@Injectable()
export class PrivacyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly uow: UnitOfWork,
    private readonly crypto: CryptoService,
    private readonly files: FilesService,
    private readonly tokens: TokenService,
    private readonly lifecycle: RequestLifecycleService,
    private readonly audit: AuditService,
  ) {}

  // ----------------------------------------------------------------- export

  async export(user: AuthUser, meta: RequestMeta) {
    const [recent] = await this.db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.actorUserId, user.id),
          eq(auditLogs.action, 'PERSONAL_DATA_EXPORTED'),
          gte(auditLogs.createdAt, new Date(Date.now() - 10 * 60_000)),
        ),
      )
      .limit(1);
    if (recent)
      throw new AppException('DATA_EXPORT_TOO_FREQUENT', {
        retry_after_minutes: 10,
      });

    const [account] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    const [patient] = await this.db
      .select()
      .from(patientProfiles)
      .where(eq(patientProfiles.userId, user.id));
    const [staff] = await this.db
      .select()
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, user.id));
    const data: Record<string, unknown> = {
      generated_at: new Date().toISOString(),
      format_version: 1,
      account: clean(account),
      profile: patient
        ? {
            ...clean(patient),
            national_id: patient.nationalIdEncrypted
              ? this.crypto.decrypt(patient.nationalIdEncrypted)
              : null,
          }
        : staff
          ? clean(staff)
          : null,
      consents: (
        await this.db
          .select()
          .from(consentRecords)
          .where(eq(consentRecords.userId, user.id))
          .orderBy(asc(consentRecords.createdAt))
      ).map(clean),
      devices: (
        await this.db.select().from(devices).where(eq(devices.userId, user.id))
      ).map((d) => ({
        ...clean(d),
        push_token: d.pushToken ? 'present' : null,
      })),
      notification_preferences: (
        await this.db
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.userId, user.id))
      ).map(clean),
      files: (
        await this.db
          .select()
          .from(files)
          .where(and(eq(files.ownerUserId, user.id), isNull(files.deletedAt)))
      ).map(clean),
    };

    if (user.role === 'PATIENT') {
      const reqs = await this.db
        .select()
        .from(requests)
        .where(eq(requests.patientUserId, user.id))
        .orderBy(desc(requests.createdAt));
      const reqIds = reqs.map((r) => r.id);
      const ords = await this.db
        .select()
        .from(orders)
        .where(eq(orders.patientUserId, user.id))
        .orderBy(desc(orders.createdAt));
      const ordIds = ords.map((o) => o.id);
      const byIds = async <T>(
        ids: string[],
        q: (ids: string[]) => Promise<T[]>,
      ): Promise<T[]> => (ids.length ? q(ids) : Promise.resolve([]));
      const items = await byIds(reqIds, (ids) =>
        this.db
          .select()
          .from(requestItems)
          .where(inArray(requestItems.requestId, ids)),
      );
      const rfiles = await byIds(reqIds, (ids) =>
        this.db
          .select()
          .from(requestFiles)
          .where(inArray(requestFiles.requestId, ids)),
      );
      const chifa = await byIds(reqIds, (ids) =>
        this.db
          .select()
          .from(chifaSubmissions)
          .where(inArray(chifaSubmissions.requestId, ids)),
      );
      const oitems = await byIds(ordIds, (ids) =>
        this.db
          .select()
          .from(orderItems)
          .where(inArray(orderItems.orderId, ids)),
      );
      const history = await byIds(ordIds, (ids) =>
        this.db
          .select()
          .from(orderStatusHistory)
          .where(inArray(orderStatusHistory.orderId, ids)),
      );
      const pays = await byIds(ordIds, (ids) =>
        this.db.select().from(payments).where(inArray(payments.orderId, ids)),
      );
      const refs = await byIds(ordIds, (ids) =>
        this.db.select().from(refunds).where(inArray(refunds.orderId, ids)),
      );
      const recs = await byIds(ordIds, (ids) =>
        this.db.select().from(receipts).where(inArray(receipts.orderId, ids)),
      );
      Object.assign(data, {
        addresses: (
          await this.db
            .select()
            .from(addresses)
            .where(
              and(eq(addresses.userId, user.id), isNull(addresses.deletedAt)),
            )
        ).map(clean),
        dependants: (
          await this.db
            .select()
            .from(dependants)
            .where(
              and(
                eq(dependants.patientUserId, user.id),
                isNull(dependants.deletedAt),
              ),
            )
        ).map(clean),
        requests: reqs.map((r) => ({
          ...clean(r),
          items: items.filter((i) => i.requestId === r.id).map(clean),
          file_ids: rfiles
            .filter((f) => f.requestId === r.id)
            .map((f) => f.fileId),
          chifa: chifa
            .filter((c) => c.requestId === r.id)
            .map((c) => ({
              ...clean(c),
              insurance_number: c.insuranceNumberEncrypted
                ? this.crypto.decrypt(c.insuranceNumberEncrypted)
                : null,
            })),
        })),
        orders: ords.map((o) => ({
          ...clean(o),
          items: oitems.filter((i) => i.orderId === o.id).map(clean),
          history: history.filter((h) => h.orderId === o.id).map(clean),
          payments: pays.filter((p) => p.orderId === o.id).map(clean),
          refunds: refs.filter((r) => r.orderId === o.id).map(clean),
          receipts: recs.filter((r) => r.orderId === o.id).map(clean),
        })),
        complaints: (
          await this.db
            .select()
            .from(complaints)
            .where(eq(complaints.reporterUserId, user.id))
        ).map(clean),
      });
    }

    await this.audit.log({
      action: 'PERSONAL_DATA_EXPORTED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'user',
      resourceId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return Buffer.from(JSON.stringify(data, null, 2), 'utf8');
  }

  // ----------------------------------------------------------------- delete

  /**
   * Patient account deletion = anonymisation. Refused while an order is in
   * progress. Open requests are cancelled; prescriptions, Chifa data,
   * addresses, dependants, devices and notifications are erased; orders,
   * payments, refunds and receipts are kept (legal / accounting records)
   * but detached from contact details.
   */
  async deleteAccount(user: AuthUser, password: string, meta: RequestMeta) {
    const [account] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    if (!account || !(await verifyPassword(account.passwordHash, password)))
      throw new AppException('AUTH_INVALID_CREDENTIALS');
    const active = await this.db
      .select({ id: orders.id, reference: orders.reference })
      .from(orders)
      .where(
        and(
          eq(orders.patientUserId, user.id),
          notInArray(orders.status, [...FINISHED_ORDERS]),
        ),
      );
    if (active.length)
      throw new AppException('ACCOUNT_DELETION_BLOCKED', {
        active_orders: active.map((o) => o.reference),
      });

    // Open requests are cancelled through the lifecycle (pharmacies are told).
    const open = await this.db
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.patientUserId, user.id),
          inArray(requests.status, [...OPEN_REQUESTS]),
        ),
      );
    for (const r of open)
      await this.uow.run((ctx) =>
        this.lifecycle.transition(
          ctx,
          r,
          'CANCELLED',
          { userId: user.id, role: user.role, reason: 'account_deleted' },
          { cancelledAt: new Date(), cancelReason: 'account_deleted' },
        ),
      );

    const owned = await this.db
      .select()
      .from(files)
      .where(and(eq(files.ownerUserId, user.id), isNull(files.deletedAt)));
    for (const f of owned) await this.files.purge(f);

    const now = new Date();
    await this.db.transaction(async (tx) => {
      const reqIds = (
        await tx
          .select({ id: requests.id })
          .from(requests)
          .where(eq(requests.patientUserId, user.id))
      ).map((r) => r.id);
      if (reqIds.length) {
        await tx
          .update(chifaSubmissions)
          .set({ insuranceNumberEncrypted: null, holderName: null })
          .where(inArray(chifaSubmissions.requestId, reqIds));
        await tx
          .update(requests)
          .set({ patientNote: null, deliveryAddressSnapshot: null })
          .where(inArray(requests.id, reqIds));
      }
      // Orders stay (legal record) without contact details.
      await tx
        .update(orders)
        .set({
          deliveryAddressSnapshot: sql`CASE WHEN ${orders.deliveryAddressSnapshot} IS NULL THEN NULL ELSE ${orders.deliveryAddressSnapshot} - 'phone_contact' - 'street_line' - 'building_details' - 'delivery_notes' END`,
        })
        .where(eq(orders.patientUserId, user.id));
      await tx.execute(sql`
        UPDATE ${deliveries} SET dropoff_snapshot = dropoff_snapshot - 'phone' - 'address' - 'notes' || '{"first_name": ""}'::jsonb
        WHERE order_id IN (SELECT id FROM orders WHERE patient_user_id = ${user.id})`);
      await tx
        .update(addresses)
        .set({
          streetLine: '-',
          buildingDetails: null,
          phoneContact: null,
          deliveryNotes: null,
          label: null,
          latitude: null,
          longitude: null,
          deletedAt: now,
        })
        .where(eq(addresses.userId, user.id));
      await tx
        .update(dependants)
        .set({
          firstName: '-',
          lastName: '-',
          dateOfBirth: null,
          proofFileId: null,
          deletedAt: now,
        })
        .where(eq(dependants.patientUserId, user.id));
      await tx
        .update(patientProfiles)
        .set({
          firstName: 'Utilisateur',
          lastName: 'supprimé',
          dateOfBirth: null,
          gender: null,
          nationalIdEncrypted: null,
        })
        .where(eq(patientProfiles.userId, user.id));
      await tx
        .update(devices)
        .set({ pushToken: null, revokedAt: now })
        .where(eq(devices.userId, user.id));
      await tx.delete(notifications).where(eq(notifications.userId, user.id));
      await tx
        .delete(notificationPreferences)
        .where(eq(notificationPreferences.userId, user.id));
      await tx
        .update(users)
        // A non-routable placeholder keeps the email-or-phone constraint; '!' is not an argon2 hash, so login is impossible.
        .set({
          email: `deleted+${user.id}@deleted.invalid`,
          phone: null,
          passwordHash: '!',
          mfaEnabled: false,
          mfaSecretEncrypted: null,
          status: 'DELETED',
          deletedAt: now,
        })
        .where(eq(users.id, user.id));
      await this.tokens.revokeAllForUser(user.id, 'account_deleted', {}, tx);
      await this.audit.log(
        {
          action: 'ACCOUNT_DELETED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'user',
          resourceId: user.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: {
            files_purged: owned.length,
            requests_cancelled: open.length,
          },
        },
        tx,
      );
    });
    return {
      deleted: true,
      kept_records: [
        'orders',
        'payments',
        'refunds',
        'receipts',
        'consent_records',
        'audit_logs',
      ],
    };
  }
}
