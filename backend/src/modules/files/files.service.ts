import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { Database, DRIZZLE } from '../../database/database.module';
import { files, Role } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { detectMime } from './file-type';
import { IMalwareScanner, MALWARE_SCANNER } from './scanning/malware-scanner';
import {
  IStorageProvider,
  STORAGE_PROVIDER,
} from './storage/storage.providers';

export type FilePurpose = (typeof files.$inferSelect)['purpose'];
export type FileRow = typeof files.$inferSelect;

/** Which purposes each role may upload. */
export const UPLOAD_PURPOSES: Record<Role, FilePurpose[]> = {
  PATIENT: [
    'PRESCRIPTION',
    'CHIFA_CARD',
    'MESSAGE_ATTACHMENT',
    'DEPENDANT_PROOF',
  ],
  PHARMACY_OWNER: ['PHARMACY_DOC', 'MESSAGE_ATTACHMENT'],
  PHARMACIST: ['PHARMACY_DOC', 'MESSAGE_ATTACHMENT'],
  PHARMACY_ASSISTANT: ['MESSAGE_ATTACHMENT'],
  DELIVERY_COMPANY_ADMIN: ['DELIVERY_COMPANY_DOC'],
  DRIVER: ['DRIVER_DOC', 'PROOF_OF_DELIVERY'],
  ADMIN: [],
  SUPER_ADMIN: [],
};

/** Health documents get a retention deadline at upload time. */
const SENSITIVE_PURPOSES: FilePurpose[] = ['PRESCRIPTION', 'CHIFA_CARD'];

export interface UploadedBlob {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export const presentFile = (f: FileRow) => ({
  id: f.id,
  purpose: f.purpose,
  original_name: f.originalName,
  mime_type: f.mimeType,
  size_bytes: f.sizeBytes,
  sha256: f.sha256,
  malware_scan_status: f.malwareScanStatus,
  created_at: f.createdAt,
});

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly maxBytes: number;
  private readonly maxFiles: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    @Inject(MALWARE_SCANNER) private readonly scanner: IMalwareScanner,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    config: ConfigService,
  ) {
    this.maxBytes = config.get<number>('FILE_MAX_SIZE_MB', 10) * 1024 * 1024;
    this.maxFiles = config.get<number>('FILE_MAX_FILES', 5);
  }

  get limits() {
    return { maxBytes: this.maxBytes, maxFiles: this.maxFiles };
  }

  /**
   * Validates EVERY file first (count, size, magic bytes, malware), then
   * encrypts and stores them. A single bad file rejects the whole batch.
   */
  async upload(
    user: AuthUser,
    purpose: FilePurpose,
    blobs: UploadedBlob[],
    meta: RequestMeta,
  ) {
    if (!UPLOAD_PURPOSES[user.role].includes(purpose))
      throw new AppException('FILE_PURPOSE_NOT_ALLOWED');
    if (!blobs?.length) throw new AppException('FILE_REQUIRED');
    if (blobs.length > this.maxFiles) throw new AppException('FILE_TOO_MANY');

    const prepared = [];
    for (const blob of blobs) {
      if (blob.size > this.maxBytes || blob.buffer.length > this.maxBytes) {
        throw new AppException(
          'FILE_TOO_LARGE',
          { file: blob.originalname },
          { max: this.maxBytes / 1024 / 1024 },
        );
      }
      const mime = detectMime(blob.buffer);
      if (!mime)
        throw new AppException('FILE_TYPE_NOT_ALLOWED', {
          file: blob.originalname,
        });
      if ((await this.scanner.scan(blob.buffer)) === 'INFECTED') {
        await this.audit.log({
          action: 'FILE_REJECTED_MALWARE',
          actorUserId: user.id,
          actorRole: user.role,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: { purpose },
        });
        throw new AppException('FILE_INFECTED', { file: blob.originalname });
      }
      prepared.push({
        blob,
        mime,
        sha256: createHash('sha256').update(blob.buffer).digest('hex'),
      });
    }

    const retentionDays = await this.settings.get(
      'sensitive_data_retention_days',
    );
    const now = new Date();
    const rows: FileRow[] = [];
    for (const p of prepared) {
      const id = randomUUID();
      const key = `${purpose.toLowerCase()}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
      const encrypted = this.crypto.encryptBuffer(p.blob.buffer);
      await this.storage.put(key, encrypted.data);
      const [row] = await this.db
        .insert(files)
        .values({
          id,
          ownerUserId: user.id,
          purpose,
          storageKey: key,
          originalName: sanitizeName(p.blob.originalname),
          mimeType: p.mime,
          sizeBytes: p.blob.buffer.length,
          sha256: p.sha256,
          isEncrypted: true,
          encryptionKeyRef: encrypted.keyId,
          malwareScanStatus: 'CLEAN',
          retentionUntil: SENSITIVE_PURPOSES.includes(purpose)
            ? new Date(now.getTime() + retentionDays * 86_400_000)
            : null,
        })
        .returning();
      rows.push(row);
    }
    await this.audit.log({
      action: 'FILE_UPLOADED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'file',
      resourceId: rows.length === 1 ? rows[0].id : null,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        purpose,
        count: rows.length,
        file_ids: rows.map((r) => r.id),
      },
    });
    return rows.map(presentFile);
  }

  async findActive(id: string) {
    const [row] = await this.db
      .select()
      .from(files)
      .where(and(eq(files.id, id), isNull(files.deletedAt)))
      .limit(1);
    return row;
  }

  /**
   * Files a user may attach to something: owned, right purpose, scanned clean.
   * Throws FILE_INVALID_FOR_USE otherwise (never reveals other users' files).
   */
  async assertUsable(
    userId: string,
    fileIds: string[],
    purposes: FilePurpose[],
  ) {
    const rows = [];
    for (const id of fileIds) {
      const f = await this.findActive(id);
      if (
        !f ||
        f.ownerUserId !== userId ||
        !purposes.includes(f.purpose) ||
        f.malwareScanStatus !== 'CLEAN'
      ) {
        throw new AppException('FILE_INVALID_FOR_USE', { file_id: id });
      }
      rows.push(f);
    }
    return rows;
  }

  async readDecrypted(file: FileRow): Promise<Buffer> {
    const data = await this.storage.get(file.storageKey);
    return file.isEncrypted
      ? this.crypto.decryptBuffer(data, file.encryptionKeyRef ?? 'v1')
      : data;
  }

  /** Physically removes the object and marks the row deleted (retention / owner delete). */
  async purge(file: FileRow) {
    try {
      await this.storage.delete(file.storageKey);
    } catch (err) {
      this.logger.warn(
        `Storage delete failed for ${file.id}: ${(err as Error).message}`,
      );
    }
    await this.db
      .update(files)
      .set({ deletedAt: new Date() })
      .where(eq(files.id, file.id));
  }
}

function sanitizeName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  return (
    base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').slice(0, 255) || 'file'
  );
}
