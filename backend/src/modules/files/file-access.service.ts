import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { AuditService } from '../audit/audit.service';
import {
  SensitiveAccessService,
  SensitiveResource,
} from '../audit/sensitive-access.service';
import { FileRow, FilesService } from './files.service';

export interface AccessDecision {
  /** Log the access in sensitive_access_logs with this resource. */
  sensitive?: {
    type: SensitiveResource;
    resourceId: string;
    justification?: string | null;
  };
  /** Short label stored in the audit log, e.g. "pharmacy-recipient". */
  via: string;
}

/** A rule returns a decision when it grants access, or null to let other rules decide. */
export type FileAccessRule = (
  user: AuthUser,
  file: FileRow,
) => Promise<AccessDecision | null>;

interface SignedPayload {
  f: string; // file id
  u: string; // user id the link was issued to
  e: number; // expiry (unix seconds)
}

/**
 * Files are never public. Access = (1) an authorization rule grants it, then
 * (2) a short-lived HMAC-signed link is issued; both steps are logged.
 * Domain modules register their rules at startup (requests, messaging, admin…).
 */
@Injectable()
export class FileAccessService {
  private readonly rules: FileAccessRule[] = [];
  private readonly ttl: number;
  private readonly baseUrl: string;

  constructor(
    private readonly files: FilesService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly sensitive: SensitiveAccessService,
    config: ConfigService,
  ) {
    this.ttl = config.get<number>('FILE_URL_TTL_SECONDS', 300);
    this.baseUrl = config
      .get<string>('PUBLIC_BASE_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    // Owners can always read their own uploads.
    this.registerRule(async (user, file) =>
      file.ownerUserId === user.id ? { via: 'owner' } : null,
    );
  }

  registerRule(rule: FileAccessRule) {
    this.rules.push(rule);
  }

  async authorize(
    user: AuthUser,
    fileId: string,
  ): Promise<{ file: FileRow; decision: AccessDecision }> {
    const file = await this.files.findActive(fileId);
    if (!file) throw new AppException('FILE_NOT_FOUND');
    for (const rule of this.rules) {
      const decision = await rule(user, file);
      if (decision) return { file, decision };
    }
    // Same answer as "does not exist": ids cannot be probed.
    throw new AppException('FILE_NOT_FOUND');
  }

  async issueAccessUrl(user: AuthUser, fileId: string, meta: RequestMeta) {
    const { file, decision } = await this.authorize(user, fileId);
    if (decision.sensitive) {
      await this.sensitive.record(
        user,
        decision.sensitive.type,
        decision.sensitive.resourceId,
        {
          justification: decision.sensitive.justification,
          ip: meta.ip,
          userAgent: meta.userAgent,
          detail: `file:${file.id}`,
        },
      );
    }
    await this.audit.log({
      action: 'FILE_ACCESS_URL_ISSUED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'file',
      resourceId: file.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { via: decision.via, purpose: file.purpose },
    });
    const expiresAt = Math.floor(Date.now() / 1000) + this.ttl;
    const payload = Buffer.from(
      JSON.stringify({
        f: file.id,
        u: user.id,
        e: expiresAt,
      } satisfies SignedPayload),
    ).toString('base64url');
    const token = `${payload}.${this.crypto.hmac(`file-url|${payload}`)}`;
    return {
      url: `${this.baseUrl}/files/download/${token}`,
      expires_at: new Date(expiresAt * 1000),
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
    };
  }

  /** Validates a signed link and returns the decrypted content. */
  async download(token: string, meta: RequestMeta) {
    const [payload, sig] = token.split('.');
    if (
      !payload ||
      !sig ||
      !this.crypto.hmacEquals(`file-url|${payload}`, sig)
    ) {
      throw new AppException('FILE_URL_INVALID');
    }
    let data: SignedPayload;
    try {
      data = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as SignedPayload;
    } catch {
      throw new AppException('FILE_URL_INVALID');
    }
    if (!data.e || data.e < Math.floor(Date.now() / 1000))
      throw new AppException('FILE_URL_INVALID');
    const file = await this.files.findActive(data.f);
    if (!file) throw new AppException('FILE_URL_INVALID');
    const content = await this.files.readDecrypted(file);
    await this.audit.log({
      action: 'FILE_DOWNLOADED',
      actorUserId: data.u,
      resourceType: 'file',
      resourceId: file.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { purpose: file.purpose },
    });
    return { file, content };
  }
}
