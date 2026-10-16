import { Inject, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { and, asc, count, eq, ilike, inArray, or, SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE } from '../../database/database.module';
import { medicineCategoryEnum, medicines } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ImportReport, presentMedicine } from '../catalog/catalog.service';

type MedicineRow = typeof medicines.$inferSelect;
type Category = (typeof medicineCategoryEnum.enumValues)[number];
const CATEGORIES = medicineCategoryEnum.enumValues as readonly string[];
const MAX_LINES = 10_000;

export interface MedicineInput {
  brand_name: string;
  name_ar?: string | null;
  inn_dci?: string | null;
  form?: string | null;
  dosage?: string | null;
  pack_size?: string | null;
  manufacturer?: string | null;
  category: Category;
  requires_prescription?: boolean;
  reimbursable_flag?: boolean;
  regulatory_code?: string | null;
}

const toRow = (d: Partial<MedicineInput>) => ({
  ...(d.brand_name !== undefined ? { brandName: d.brand_name } : {}),
  ...(d.name_ar !== undefined ? { nameAr: d.name_ar } : {}),
  ...(d.inn_dci !== undefined ? { innDci: d.inn_dci } : {}),
  ...(d.form !== undefined ? { form: d.form } : {}),
  ...(d.dosage !== undefined ? { dosage: d.dosage } : {}),
  ...(d.pack_size !== undefined ? { packSize: d.pack_size } : {}),
  ...(d.manufacturer !== undefined ? { manufacturer: d.manufacturer } : {}),
  ...(d.category !== undefined ? { category: d.category } : {}),
  ...(d.requires_prescription !== undefined
    ? { requiresPrescription: d.requires_prescription }
    : {}),
  ...(d.reimbursable_flag !== undefined
    ? { reimbursableFlag: d.reimbursable_flag }
    : {}),
  ...(d.regulatory_code !== undefined
    ? { regulatoryCode: d.regulatory_code }
    : {}),
});

const adminView = (m: MedicineRow) => ({
  ...presentMedicine(m),
  is_active: m.isActive,
  created_at: m.createdAt,
  updated_at: m.updatedAt,
});

/** Medicine catalogue management (CRUD + CSV import with a line-by-line report). */
@Injectable()
export class AdminCatalogService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(q: {
    page: number;
    limit: number;
    offset: number;
    search?: string;
    category?: string;
    active?: boolean;
  }) {
    const c: SQL[] = [];
    if (q.search) {
      const s = `%${q.search.replace(/[%_\\]/g, (x) => `\\${x}`)}%`;
      c.push(
        or(
          ilike(medicines.brandName, s),
          ilike(medicines.innDci, s),
          ilike(medicines.regulatoryCode, s),
        )!,
      );
    }
    if (q.category) c.push(eq(medicines.category, q.category as Category));
    if (q.active !== undefined) c.push(eq(medicines.isActive, q.active));
    const where = c.length ? and(...c) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(medicines)
        .where(where)
        .orderBy(asc(medicines.brandName))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(medicines).where(where),
    ]);
    return Paginated.of(rows.map(adminView), total, q.page, q.limit);
  }

  private async assertCodeFree(
    code: string | null | undefined,
    exceptId?: string,
  ) {
    if (!code) return;
    const [m] = await this.db
      .select({ id: medicines.id })
      .from(medicines)
      .where(eq(medicines.regulatoryCode, code))
      .limit(1);
    if (m && m.id !== exceptId)
      throw new AppException('MEDICINE_CODE_TAKEN', { regulatory_code: code });
  }

  async create(admin: AuthUser, dto: MedicineInput, meta: RequestMeta) {
    await this.assertCodeFree(dto.regulatory_code);
    const [m] = await this.db
      .insert(medicines)
      .values({
        ...toRow(dto),
        brandName: dto.brand_name,
        category: dto.category,
      })
      .returning();
    await this.audit.log({
      action: 'MEDICINE_CREATED',
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'medicine',
      resourceId: m.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return adminView(m);
  }

  async update(
    admin: AuthUser,
    id: string,
    dto: Partial<MedicineInput> & { is_active?: boolean },
    meta: RequestMeta,
  ) {
    const [before] = await this.db
      .select()
      .from(medicines)
      .where(eq(medicines.id, id))
      .limit(1);
    if (!before) throw new AppException('MEDICINE_NOT_FOUND');
    await this.assertCodeFree(dto.regulatory_code, id);
    const [m] = await this.db
      .update(medicines)
      .set({
        ...toRow(dto),
        ...(dto.is_active !== undefined ? { isActive: dto.is_active } : {}),
      })
      .where(eq(medicines.id, id))
      .returning();
    await this.audit.log({
      action: 'MEDICINE_UPDATED',
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'medicine',
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { before: adminView(before), after: adminView(m) },
    });
    return adminView(m);
  }

  /** Soft delete: deactivated medicines disappear from search but stay referenced by history. */
  deactivate(admin: AuthUser, id: string, meta: RequestMeta) {
    return this.update(admin, id, { is_active: false }, meta);
  }

  /**
   * CSV import (comma or semicolon). Columns: brand_name*, category*, name_ar,
   * inn_dci, form, dosage, pack_size, manufacturer, requires_prescription,
   * reimbursable_flag, regulatory_code. Rows with a known regulatory_code are
   * updated, others created. Invalid lines are reported and skipped.
   */
  async importCsv(
    admin: AuthUser,
    content: Buffer | undefined,
    dryRun: boolean,
    meta: RequestMeta,
  ): Promise<ImportReport> {
    if (!content?.length) throw new AppException('CATALOG_IMPORT_INVALID_FILE');
    let records: Record<string, string>[];
    try {
      const text = content.toString('utf8').replace(/^﻿/, '');
      const first = text.split('\n')[0];
      const delimiter =
        (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)
          ? ';'
          : ',';
      records = parse(text, {
        columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        delimiter,
      });
    } catch {
      throw new AppException('CATALOG_IMPORT_INVALID_FILE');
    }
    if (!records.length || records.length > MAX_LINES)
      throw new AppException('CATALOG_IMPORT_INVALID_FILE', {
        max_lines: MAX_LINES,
      });

    const report: ImportReport = {
      dry_run: dryRun,
      processed: records.length,
      created: 0,
      updated: 0,
      errors: [],
    };
    const bool = (v: string | undefined, def: boolean) =>
      v === undefined || v === ''
        ? def
        : ['1', 'true', 'yes', 'oui'].includes(v.toLowerCase())
          ? true
          : ['0', 'false', 'no', 'non'].includes(v.toLowerCase())
            ? false
            : null;
    const str = (v: string | undefined, max: number) =>
      v ? v.slice(0, max) : null;

    const valid: { line: number; row: MedicineInput }[] = [];
    const seenCodes = new Set<string>();
    records.forEach((r, i) => {
      const line = i + 2;
      const err = (field: string, message_key: string, value?: string) =>
        report.errors.push({ line, field, message_key, value });
      if (!r.brand_name) return err('brand_name', 'errors.VALIDATION_FAILED');
      const category = (r.category ?? '').toUpperCase();
      if (!CATEGORIES.includes(category))
        return err('category', 'errors.VALIDATION_FAILED', r.category);
      const rx = bool(r.requires_prescription, category !== 'OTC');
      const reimb = bool(r.reimbursable_flag, false);
      if (rx === null)
        return err(
          'requires_prescription',
          'errors.VALIDATION_FAILED',
          r.requires_prescription,
        );
      if (reimb === null)
        return err(
          'reimbursable_flag',
          'errors.VALIDATION_FAILED',
          r.reimbursable_flag,
        );
      const code = str(r.regulatory_code, 100);
      if (code && seenCodes.has(code))
        return err('regulatory_code', 'errors.MEDICINE_CODE_TAKEN', code);
      if (code) seenCodes.add(code);
      valid.push({
        line,
        row: {
          brand_name: r.brand_name.slice(0, 200),
          category: category as Category,
          name_ar: str(r.name_ar, 200),
          inn_dci: str(r.inn_dci, 200),
          form: str(r.form, 100),
          dosage: str(r.dosage, 100),
          pack_size: str(r.pack_size, 100),
          manufacturer: str(r.manufacturer, 200),
          requires_prescription: rx,
          reimbursable_flag: reimb,
          regulatory_code: code,
        },
      });
    });

    const codes = valid
      .map((v) => v.row.regulatory_code)
      .filter((c): c is string => !!c);
    const existing = new Map<string, string>();
    for (let i = 0; i < codes.length; i += 1000) {
      const rows = await this.db
        .select({ id: medicines.id, code: medicines.regulatoryCode })
        .from(medicines)
        .where(inArray(medicines.regulatoryCode, codes.slice(i, i + 1000)));
      rows.forEach((r) => existing.set(r.code!, r.id));
    }
    for (const v of valid) {
      if (v.row.regulatory_code && existing.has(v.row.regulatory_code))
        report.updated++;
      else report.created++;
    }
    if (dryRun || !valid.length) return report;

    await this.db.transaction(async (tx) => {
      for (const v of valid) {
        const id = v.row.regulatory_code
          ? existing.get(v.row.regulatory_code)
          : undefined;
        if (id)
          await tx
            .update(medicines)
            .set({ ...toRow(v.row), isActive: true })
            .where(eq(medicines.id, id));
        else
          await tx.insert(medicines).values({
            ...toRow(v.row),
            brandName: v.row.brand_name,
            category: v.row.category,
          });
      }
      await this.audit.log(
        {
          action: 'MEDICINES_IMPORTED',
          actorUserId: admin.id,
          actorRole: admin.role,
          resourceType: 'medicine',
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: {
            processed: report.processed,
            created: report.created,
            updated: report.updated,
            errors: report.errors.length,
          },
        },
        tx,
      );
    });
    return report;
  }
}
