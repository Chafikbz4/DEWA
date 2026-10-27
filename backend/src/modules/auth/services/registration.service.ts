import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { RequestMeta } from '../../../common/auth/decorators';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { hashPassword } from '../../../common/crypto/password';
import { AppException } from '../../../common/errors/app.exception';
import { Lang } from '../../../common/i18n/i18n.service';
import {
  maskIdentifier,
  NormalizedIdentifier,
  normalizeEmail,
  normalizePhone,
} from '../../../common/utils/identifier';
import { Database, Tx, DRIZZLE } from '../../../database/database.module';
import {
  communes,
  deliveryCompanies,
  drivers,
  patientProfiles,
  pharmacies,
  pharmacyStaff,
  pharmacyStaffInvitations,
  Role,
  staffProfiles,
  users,
} from '../../../database/schema';
import { AuditAction, AuditService } from '../../audit/audit.service';
import { ConsentsService } from '../../users/consents.service';
import type { LoginResponseDto, OtpSentDto } from '../dto/auth.dto';
import {
  BaseRegisterDto,
  RegisterDeliveryCompanyDto,
  RegisterDriverDto,
  RegisterPatientDto,
  RegisterPharmacyDto,
  RegisterStaffDto,
} from '../dto/register.dto';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * All self-registration endpoints answer the same way whether or not the
 * email/phone is already used (202 + "code sent"), so accounts cannot be
 * enumerated. Pharmacy and patient accounts become active after OTP
 * verification; other staff accounts remain pending admin review.
 */
@Injectable()
export class RegistrationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly consents: ConsentsService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  registerPatient(dto: RegisterPatientDto, meta: RequestMeta) {
    return this.register(dto, 'PATIENT', meta, async (tx, userId) => {
      await tx
        .insert(patientProfiles)
        .values({ userId, firstName: dto.first_name, lastName: dto.last_name });
    });
  }

  async registerPharmacy(dto: RegisterPharmacyDto, meta: RequestMeta) {
    const p = dto.pharmacy;
    await this.assertCommuneInWilaya(p.commune_id, p.wilaya_id);
    const [taken] = await this.db
      .select({ id: pharmacies.id })
      .from(pharmacies)
      .where(eq(pharmacies.authorizationNumber, p.authorization_number))
      .limit(1);
    if (taken) throw new AppException('PHARMACY_AUTHORIZATION_NUMBER_TAKEN');

    return this.register(dto, 'PHARMACY_OWNER', meta, async (tx, userId) => {
      await tx
        .insert(staffProfiles)
        .values({ userId, firstName: dto.first_name, lastName: dto.last_name });
      const [pharmacy] = await tx
        .insert(pharmacies)
        .values({
          nameFr: p.name_fr,
          nameAr: p.name_ar,
          legalName: p.legal_name,
          authorizationNumber: p.authorization_number,
          taxIdNif: p.tax_id_nif,
          commercialRegisterRc: p.commercial_register_rc,
          wilayaId: p.wilaya_id,
          communeId: p.commune_id,
          addressLine: p.address_line,
          latitude: p.latitude,
          longitude: p.longitude,
          phone: p.phone ? normalizePhone(p.phone) : null,
          status: 'VERIFIED',
          verifiedAt: new Date(),
          acceptsRequests: true,
        })
        .returning({ id: pharmacies.id });
      await tx.insert(pharmacyStaff).values({
        pharmacyId: pharmacy.id,
        userId,
        staffRole: 'OWNER',
        pharmacistLicenseNumber: dto.pharmacist_license_number,
      });
    });
  }

  registerDeliveryCompany(dto: RegisterDeliveryCompanyDto, meta: RequestMeta) {
    const c = dto.company;
    return this.register(
      dto,
      'DELIVERY_COMPANY_ADMIN',
      meta,
      async (tx, userId) => {
        await tx.insert(staffProfiles).values({
          userId,
          firstName: dto.first_name,
          lastName: dto.last_name,
        });
        await tx.insert(deliveryCompanies).values({
          name: c.name,
          legalName: c.legal_name,
          taxId: c.tax_id,
          rcNumber: c.rc_number,
          phone: c.phone ? normalizePhone(c.phone) : null,
          email: c.email ? normalizeEmail(c.email) : null,
          adminUserId: userId,
          status: 'PENDING_VERIFICATION',
        });
      },
    );
  }

  registerDriver(dto: RegisterDriverDto, meta: RequestMeta) {
    return this.register(dto, 'DRIVER', meta, async (tx, userId) => {
      await tx.insert(drivers).values({
        userId,
        firstName: dto.first_name,
        lastName: dto.last_name,
        vehicleType: dto.vehicle_type,
        plateNumber: dto.plate_number,
        licenseNumberEncrypted: dto.license_number
          ? this.crypto.encrypt(dto.license_number)
          : null,
        status: 'PENDING_VERIFICATION',
      });
    });
  }

  // ------------------------------------------------------------------ core

  private async register(
    dto: BaseRegisterDto,
    role: Role,
    meta: RequestMeta,
    createExtras: (tx: Tx, userId: string) => Promise<void>,
  ): Promise<OtpSentDto> {
    this.consents.assertRegistrationConsents(dto.consents);
    const email = dto.email ? normalizeEmail(dto.email) : null;
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (!email && !phone) throw new AppException('AUTH_IDENTIFIER_REQUIRED');

    const target: NormalizedIdentifier = email
      ? { type: 'EMAIL', value: email }
      : { type: 'PHONE', value: phone! };
    const lang = dto.preferred_language as Lang;
    const passwordHash = await hashPassword(dto.password); // always hash: constant timing

    const byEmail = email
      ? await this.auth.findByIdentifier({ type: 'EMAIL', value: email })
      : undefined;
    const byPhone = phone
      ? await this.auth.findByIdentifier({ type: 'PHONE', value: phone })
      : undefined;
    const existing = byEmail ?? byPhone;
    const conflicting = byEmail && byPhone && byEmail.id !== byPhone.id;

    // An unverified, pending PATIENT may simply re-register (nobody proved
    // ownership of the identifier yet, so overwriting is safe).
    const reusable =
      existing &&
      !conflicting &&
      role === 'PATIENT' &&
      existing.role === 'PATIENT' &&
      existing.status === 'PENDING_VERIFICATION' &&
      !existing.emailVerifiedAt &&
      !existing.phoneVerifiedAt;

    if (existing && !reusable) {
      return this.genericResponse(target, lang, null, true);
    }

    let userId: string;
    try {
      userId = await this.db.transaction(async (tx) => {
        let id: string;
        if (reusable && existing) {
          id = existing.id;
          await tx
            .update(users)
            .set({ email, phone, passwordHash, preferredLanguage: lang })
            .where(eq(users.id, id));
          await tx
            .update(patientProfiles)
            .set({ firstName: dto.first_name, lastName: dto.last_name })
            .where(eq(patientProfiles.userId, id));
        } else {
          const [created] = await tx
            .insert(users)
            .values({
              role,
              email,
              phone,
              passwordHash,
              preferredLanguage: lang,
              status: 'PENDING_VERIFICATION',
            })
            .returning({ id: users.id });
          id = created.id;
          await createExtras(tx, id);
        }
        await this.consents.insertMany(tx, id, dto.consents, meta.ip);
        await this.audit.log(
          {
            action: AuditAction.AUTH_REGISTERED,
            actorUserId: id,
            actorRole: role,
            resourceType: 'user',
            resourceId: id,
            ip: meta.ip,
            userAgent: meta.userAgent,
            metadata: { role, re_registration: !!reusable },
          },
          tx,
        );
        return id;
      });
    } catch (err) {
      // Concurrent registration with the same identifier → same generic answer.
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        return this.genericResponse(target, lang, null, true);
      }
      throw err;
    }
    return this.genericResponse(target, lang, userId, false);
  }

  private async genericResponse(
    target: NormalizedIdentifier,
    lang: Lang,
    userId: string | null,
    accountExists: boolean,
  ): Promise<OtpSentDto> {
    const { expiresIn } = await this.otp.issue({
      target,
      purpose: 'REGISTER',
      userId,
      lang,
      notifyAccountExists: accountExists,
    });
    return {
      otp_sent: true,
      target_masked: maskIdentifier(target),
      expires_in: expiresIn,
    };
  }

  private async assertCommuneInWilaya(communeId: number, wilayaId: number) {
    const [row] = await this.db
      .select({ id: communes.id })
      .from(communes)
      .where(and(eq(communes.id, communeId), eq(communes.wilayaId, wilayaId)))
      .limit(1);
    if (!row) throw new AppException('GEO_INVALID_COMMUNE');
  }

  // ------------------------------------------------------- staff invitation

  private async findPendingInvitation(token: string) {
    const [inv] = await this.db
      .select({
        invitation: pharmacyStaffInvitations,
        pharmacyNameFr: pharmacies.nameFr,
        pharmacyNameAr: pharmacies.nameAr,
      })
      .from(pharmacyStaffInvitations)
      .innerJoin(
        pharmacies,
        eq(pharmacies.id, pharmacyStaffInvitations.pharmacyId),
      )
      .where(eq(pharmacyStaffInvitations.tokenHash, this.crypto.hmac(token)))
      .limit(1);
    if (!inv || inv.invitation.status !== 'PENDING')
      throw new AppException('INVITATION_INVALID');
    if (inv.invitation.expiresAt < new Date()) {
      await this.db
        .update(pharmacyStaffInvitations)
        .set({ status: 'EXPIRED' })
        .where(eq(pharmacyStaffInvitations.id, inv.invitation.id));
      throw new AppException('INVITATION_EXPIRED');
    }
    return inv;
  }

  async previewInvitation(token: string) {
    const { invitation, pharmacyNameFr, pharmacyNameAr } =
      await this.findPendingInvitation(token);
    const target: NormalizedIdentifier = invitation.phone
      ? { type: 'PHONE', value: invitation.phone }
      : { type: 'EMAIL', value: invitation.email! };
    return {
      pharmacy_name_fr: pharmacyNameFr,
      pharmacy_name_ar: pharmacyNameAr,
      staff_role: invitation.staffRole,
      target_masked: maskIdentifier(target),
      expires_at: invitation.expiresAt,
    };
  }

  /**
   * Creates the staff account from an invitation. The invitation token was
   * delivered to the invited phone/email, which proves possession of it.
   * Staff accounts stay PENDING_VERIFICATION until an admin approves them.
   */
  async registerStaff(
    dto: RegisterStaffDto,
    meta: RequestMeta,
  ): Promise<LoginResponseDto> {
    const { invitation } = await this.findPendingInvitation(
      dto.invitation_token,
    );
    if (
      invitation.staffRole === 'PHARMACIST' &&
      !dto.pharmacist_license_number
    ) {
      throw new AppException('VALIDATION_FAILED', [
        {
          field: 'pharmacist_license_number',
          errors: [
            { rule: 'isNotEmpty', message_key: 'validation.isNotEmpty' },
          ],
        },
      ]);
    }
    this.consents.assertRegistrationConsents(dto.consents);

    const identifier: NormalizedIdentifier = invitation.phone
      ? { type: 'PHONE', value: invitation.phone }
      : { type: 'EMAIL', value: invitation.email! };
    if (await this.auth.findByIdentifier(identifier))
      throw new AppException('IDENTIFIER_ALREADY_USED');

    const role: Role =
      invitation.staffRole === 'PHARMACIST'
        ? 'PHARMACIST'
        : 'PHARMACY_ASSISTANT';
    const passwordHash = await hashPassword(dto.password);

    return this.db.transaction(async (tx) => {
      const claimed = await tx
        .update(pharmacyStaffInvitations)
        .set({ status: 'ACCEPTED', acceptedAt: new Date() })
        .where(
          and(
            eq(pharmacyStaffInvitations.id, invitation.id),
            eq(pharmacyStaffInvitations.status, 'PENDING'),
          ),
        )
        .returning({ id: pharmacyStaffInvitations.id });
      if (!claimed.length) throw new AppException('INVITATION_INVALID');

      const now = new Date();
      const [user] = await tx
        .insert(users)
        .values({
          role,
          email: identifier.type === 'EMAIL' ? identifier.value : null,
          phone: identifier.type === 'PHONE' ? identifier.value : null,
          emailVerifiedAt: identifier.type === 'EMAIL' ? now : null,
          phoneVerifiedAt: identifier.type === 'PHONE' ? now : null,
          passwordHash,
          preferredLanguage: dto.preferred_language,
          status: 'PENDING_VERIFICATION',
        })
        .returning();
      await tx.insert(staffProfiles).values({
        userId: user.id,
        firstName: dto.first_name,
        lastName: dto.last_name,
      });
      await tx.insert(pharmacyStaff).values({
        pharmacyId: invitation.pharmacyId,
        userId: user.id,
        staffRole: invitation.staffRole,
        pharmacistLicenseNumber: dto.pharmacist_license_number,
        invitedBy: invitation.invitedBy,
      });
      await tx
        .update(pharmacyStaffInvitations)
        .set({ acceptedByUserId: user.id })
        .where(eq(pharmacyStaffInvitations.id, invitation.id));
      await this.consents.insertMany(tx, user.id, dto.consents, meta.ip);
      await this.audit.log(
        {
          action: AuditAction.STAFF_INVITATION_ACCEPTED,
          actorUserId: user.id,
          actorRole: role,
          resourceType: 'pharmacy',
          resourceId: invitation.pharmacyId,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: {
            invitation_id: invitation.id,
            staff_role: invitation.staffRole,
          },
        },
        tx,
      );
      return this.auth.completeLogin(user, meta, { tx });
    });
  }
}
