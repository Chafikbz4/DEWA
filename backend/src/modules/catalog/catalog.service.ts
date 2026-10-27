import { Inject, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE } from '../../database/database.module';
import { medicines, pharmacyStock } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import {
  MedicineSearchQueryDto,
  PutStockDto,
  StockQueryDto,
} from './dto/catalog.dto';

type MedicineRow = typeof medicines.$inferSelect;
const STOCK_STATUSES = ['IN_STOCK', 'LOW', 'OUT_OF_STOCK'] as const;

export const presentMedicine = (m: MedicineRow) => ({
  id: m.id,
  brand_name: m.brandName,
  name_ar: m.nameAr,
  inn_dci: m.innDci,
  form: m.form,
  dosage: m.dosage,
  pack_size: m.packSize,
  manufacturer: m.manufacturer,
  category: m.category,
  requires_prescription: m.requiresPrescription,
  reimbursable_flag: m.reimbursableFlag,
  regulatory_code: m.regulatoryCode,
});

const like = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export interface ImportReport {
  dry_run: boolean;
  processed: number;
  created: number;
  updated: number;
  errors: {
    line: number;
    field: string;
    message_key: string;
    value?: string;
  }[];
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Fuzzy search on brand name (fr), Arabic name and DCI; best matches first. */
  async search(q: MedicineSearchQueryDto) {
    const term = q.q.trim();
    const conditions: SQL[] = [eq(medicines.isActive, true)];
    conditions.push(
      or(
        ilike(medicines.brandName, like(term)),
        ilike(medicines.nameAr, like(term)),
        ilike(medicines.innDci, like(term)),
        sql`similarity(${medicines.brandName}, ${term}) > 0.3`,
        sql`similarity(coalesce(${medicines.innDci}, ''), ${term}) > 0.3`,
      ) as SQL,
    );
    if (q.category) conditions.push(eq(medicines.category, q.category));
    const where = and(...conditions);
    const score = sql<number>`greatest(similarity(${medicines.brandName}, ${term}), similarity(coalesce(${medicines.nameAr}, ''), ${term}), similarity(coalesce(${medicines.innDci}, ''), ${term}))`;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(medicines)
        .where(where)
        .orderBy(desc(score), asc(medicines.brandName))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(medicines).where(where),
    ]);
    return Paginated.of(rows.map(presentMedicine), total, q.page, q.limit);
  }

  async getMedicine(id: string) {
    const [m] = await this.db
      .select()
      .from(medicines)
      .where(eq(medicines.id, id))
      .limit(1);
    if (!m) throw new AppException('MEDICINE_NOT_FOUND');
    return presentMedicine(m);
  }

  // ------------------------------------------------------------------ stock

  async listStock(ph: PharmacyContext, q: StockQueryDto) {
    const conditions: SQL[] = [eq(pharmacyStock.pharmacyId, ph.id)];
    if (q.stock_status)
      conditions.push(eq(pharmacyStock.stockStatus, q.stock_status));
    if (q.q)
      conditions.push(
        or(
          ilike(medicines.brandName, like(q.q)),
          ilike(medicines.innDci, like(q.q)),
        ) as SQL,
      );
    const where = and(...conditions);
    const sortCol =
      q.sort === 'brand_name' ? medicines.brandName : pharmacyStock.updatedAt;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ s: pharmacyStock, m: medicines })
        .from(pharmacyStock)
        .innerJoin(medicines, eq(medicines.id, pharmacyStock.medicineId))
        .where(where)
        .orderBy(q.order === 'asc' ? asc(sortCol) : desc(sortCol))
        .limit(q.limit)
        .offset(q.offset),
      this.db
        .select({ total: count() })
        .from(pharmacyStock)
        .innerJoin(medicines, eq(medicines.id, pharmacyStock.medicineId))
        .where(where),
    ]);
    return Paginated.of(
      rows.map(({ s, m }) => ({
        medicine: presentMedicine(m),
        stock_status: s.stockStatus,
        quantity: s.quantity,
        unit_price_centimes: s.unitPriceCentimes,
        image_url: s.imageUrl,
        attributes: (s.attributes ?? {}) as Record<string, string>,
        updated_at: s.updatedAt,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  async putStock(ph: PharmacyContext, medicineId: string, dto: PutStockDto) {
    await this.getMedicine(medicineId);
    const attributes = this.normalizeAttributes(dto.attributes);
    const imageUrl = dto.image_url?.trim().slice(0, 90000) || null;
    const [s] = await this.db
      .insert(pharmacyStock)
      .values({
        pharmacyId: ph.id,
        medicineId,
        stockStatus: dto.stock_status,
        quantity: dto.quantity ?? null,
        unitPriceCentimes: dto.unit_price_centimes ?? null,
        imageUrl,
        attributes,
      })
      .onConflictDoUpdate({
        target: [pharmacyStock.pharmacyId, pharmacyStock.medicineId],
        set: {
          stockStatus: dto.stock_status,
          quantity: dto.quantity ?? null,
          unitPriceCentimes: dto.unit_price_centimes ?? null,
          imageUrl,
          attributes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return {
      medicine_id: medicineId,
      stock_status: s.stockStatus,
      quantity: s.quantity,
      unit_price_centimes: s.unitPriceCentimes,
      image_url: s.imageUrl,
      attributes: s.attributes,
      updated_at: s.updatedAt,
    };
  }

  private normalizeAttributes(
    value: Record<string, string> | undefined,
  ): Record<string, string> {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, val]) =>
            typeof key === 'string' &&
            key.trim() !== '' &&
            typeof val === 'string' &&
            val.trim() !== '',
        )
        .slice(0, 24)
        .map(([key, val]) => [
          key.trim().slice(0, 60),
          val.trim().slice(0, 200),
        ]),
    );
  }

  async deleteStock(ph: PharmacyContext, medicineId: string) {
    const res = await this.db
      .delete(pharmacyStock)
      .where(
        and(
          eq(pharmacyStock.pharmacyId, ph.id),
          eq(pharmacyStock.medicineId, medicineId),
        ),
      )
      .returning({ id: pharmacyStock.id });
    if (!res.length) throw new AppException('STOCK_NOT_FOUND');
    return { ok: true };
  }

  /**
   * CSV columns (header required): medicine_id OR regulatory_code, stock_status,
   * quantity (optional), unit_price_centimes (optional). `;` or `,` separated.
   * Every line is validated; with dry_run nothing is written. Invalid lines are
   * reported and skipped; valid lines are upserted in one transaction.
   */
  async importStock(
    user: AuthUser,
    ph: PharmacyContext,
    content: Buffer | undefined,
    dryRun: boolean,
    meta: RequestMeta,
  ): Promise<ImportReport> {
    if (!content?.length) throw new AppException('STOCK_IMPORT_INVALID_FILE');
    let records: Record<string, string>[];
    try {
      const text = content.toString('utf8').replace(/^﻿/, '');
      const delimiter =
        (text.split('\n')[0].match(/;/g)?.length ?? 0) >
        (text.split('\n')[0].match(/,/g)?.length ?? 0)
          ? ';'
          : ',';
      records = parse(text, {
        columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        delimiter,
      });
    } catch {
      throw new AppException('STOCK_IMPORT_INVALID_FILE');
    }
    if (!records.length || records.length > 5000)
      throw new AppException('STOCK_IMPORT_INVALID_FILE', { max_lines: 5000 });

    const report: ImportReport = {
      dry_run: dryRun,
      processed: records.length,
      created: 0,
      updated: 0,
      errors: [],
    };
    const ids = records.map((r) => r.medicine_id).filter(Boolean);
    const codes = records.map((r) => r.regulatory_code).filter(Boolean);
    const found = await this.db
      .select({ id: medicines.id, code: medicines.regulatoryCode })
      .from(medicines)
      .where(
        or(
          ids.length
            ? inArray(
                medicines.id,
                ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)),
              )
            : sql`false`,
          codes.length ? inArray(medicines.regulatoryCode, codes) : sql`false`,
        ),
      );
    const byId = new Set(found.map((f) => f.id));
    const byCode = new Map(
      found.filter((f) => f.code).map((f) => [f.code!, f.id]),
    );
    const existing = new Set(
      (
        await this.db
          .select({ m: pharmacyStock.medicineId })
          .from(pharmacyStock)
          .where(eq(pharmacyStock.pharmacyId, ph.id))
      ).map((r) => r.m),
    );

    const valid: (typeof pharmacyStock.$inferInsert)[] = [];
    records.forEach((r, i) => {
      const line = i + 2; // header is line 1
      const medicineId = r.medicine_id
        ? byId.has(r.medicine_id)
          ? r.medicine_id
          : undefined
        : r.regulatory_code
          ? byCode.get(r.regulatory_code)
          : undefined;
      if (!medicineId) {
        report.errors.push({
          line,
          field: r.medicine_id ? 'medicine_id' : 'regulatory_code',
          message_key: 'errors.MEDICINE_NOT_FOUND',
          value: r.medicine_id || r.regulatory_code,
        });
        return;
      }
      const status = (r.stock_status ?? '').toUpperCase();
      if (!(STOCK_STATUSES as readonly string[]).includes(status)) {
        report.errors.push({
          line,
          field: 'stock_status',
          message_key: 'validation.isEnum',
          value: r.stock_status,
        });
        return;
      }
      const quantity =
        r.quantity === undefined || r.quantity === ''
          ? null
          : Number(r.quantity);
      if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0)) {
        report.errors.push({
          line,
          field: 'quantity',
          message_key: 'validation.isInt',
          value: r.quantity,
        });
        return;
      }
      const price =
        r.unit_price_centimes === undefined || r.unit_price_centimes === ''
          ? null
          : Number(r.unit_price_centimes);
      if (price !== null && (!Number.isInteger(price) || price < 0)) {
        report.errors.push({
          line,
          field: 'unit_price_centimes',
          message_key: 'validation.isInt',
          value: r.unit_price_centimes,
        });
        return;
      }
      if (existing.has(medicineId)) report.updated++;
      else report.created++;
      existing.add(medicineId);
      valid.push({
        pharmacyId: ph.id,
        medicineId,
        stockStatus: status as (typeof STOCK_STATUSES)[number],
        quantity,
        unitPriceCentimes: price,
      });
    });

    if (!dryRun && valid.length) {
      await this.db.transaction(async (tx) => {
        for (const v of valid) {
          await tx
            .insert(pharmacyStock)
            .values(v)
            .onConflictDoUpdate({
              target: [pharmacyStock.pharmacyId, pharmacyStock.medicineId],
              set: {
                stockStatus: v.stockStatus,
                quantity: v.quantity,
                unitPriceCentimes: v.unitPriceCentimes,
                updatedAt: new Date(),
              },
            });
        }
      });
      await this.audit.log({
        action: 'PHARMACY_STOCK_IMPORTED',
        actorUserId: user.id,
        actorRole: user.role,
        resourceType: 'pharmacy',
        resourceId: ph.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: {
          created: report.created,
          updated: report.updated,
          errors: report.errors.length,
        },
      });
    }
    return report;
  }
}
