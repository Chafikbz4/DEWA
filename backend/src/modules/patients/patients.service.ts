import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, ne } from 'drizzle-orm';
import { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { normalizePhone } from '../../common/utils/identifier';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import {
  addresses,
  communes,
  dependants,
  patientProfiles,
  users,
  wilayas,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { GeoService } from '../geo/geo.service';
import { SettingsService } from '../settings/settings.service';
import {
  AddressDto,
  CreateAddressDto,
  CreateDependantDto,
  DependantDto,
  PatientProfileDto,
  UpdateAddressDto,
  UpdateDependantDto,
  UpdatePatientProfileDto,
} from './dto/patients.dto';

type DependantRow = typeof dependants.$inferSelect;

@Injectable()
export class PatientsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly crypto: CryptoService,
    private readonly geo: GeoService,
    private readonly files: FilesService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- profile

  async getProfile(user: AuthUser): Promise<PatientProfileDto> {
    const [row] = await this.db
      .select({ p: patientProfiles, u: users })
      .from(patientProfiles)
      .innerJoin(users, eq(users.id, patientProfiles.userId))
      .where(eq(patientProfiles.userId, user.id))
      .limit(1);
    if (!row) throw new AppException('USER_NOT_FOUND');
    let nin: string | null = null;
    if (row.p.nationalIdEncrypted) {
      try {
        nin = CryptoService.mask(
          this.crypto.decrypt(row.p.nationalIdEncrypted),
        );
      } catch {
        nin = '****';
      }
    }
    return {
      user_id: row.u.id,
      first_name: row.p.firstName,
      last_name: row.p.lastName,
      date_of_birth: row.p.dateOfBirth,
      gender: row.p.gender,
      national_id_masked: nin,
      email: row.u.email,
      phone: row.u.phone,
      preferred_language: row.u.preferredLanguage,
      updated_at: row.p.updatedAt,
    };
  }

  async updateProfile(
    user: AuthUser,
    dto: UpdatePatientProfileDto,
    meta: RequestMeta,
  ) {
    if (dto.date_of_birth && new Date(dto.date_of_birth) >= new Date()) {
      throw new AppException('VALIDATION_FAILED', [
        {
          field: 'date_of_birth',
          errors: [{ rule: 'max', message_key: 'validation.max' }],
        },
      ]);
    }
    await this.db.transaction(async (tx) => {
      const profile: Partial<typeof patientProfiles.$inferInsert> = {};
      if (dto.first_name !== undefined) profile.firstName = dto.first_name;
      if (dto.last_name !== undefined) profile.lastName = dto.last_name;
      if (dto.date_of_birth !== undefined)
        profile.dateOfBirth = dto.date_of_birth;
      if (dto.gender !== undefined) profile.gender = dto.gender;
      if (dto.national_id !== undefined)
        profile.nationalIdEncrypted = this.crypto.encrypt(dto.national_id);
      if (Object.keys(profile).length) {
        await tx
          .update(patientProfiles)
          .set(profile)
          .where(eq(patientProfiles.userId, user.id));
      }
      if (dto.preferred_language) {
        await tx
          .update(users)
          .set({ preferredLanguage: dto.preferred_language })
          .where(eq(users.id, user.id));
      }
      await this.audit.log(
        {
          action: 'PATIENT_PROFILE_UPDATED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'patient_profile',
          resourceId: user.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          // Field names only – never values.
          metadata: { fields: Object.keys(dto) },
        },
        tx,
      );
    });
    return this.getProfile(user);
  }

  // -------------------------------------------------------------- addresses

  private addressQuery(tx: DbOrTx = this.db) {
    return tx
      .select({ a: addresses, c: communes, w: wilayas })
      .from(addresses)
      .innerJoin(communes, eq(communes.id, addresses.communeId))
      .innerJoin(wilayas, eq(wilayas.id, addresses.wilayaId));
  }

  private presentAddress(row: {
    a: typeof addresses.$inferSelect;
    c: typeof communes.$inferSelect;
    w: typeof wilayas.$inferSelect;
  }): AddressDto {
    const { a, c, w } = row;
    return {
      id: a.id,
      label: a.label,
      wilaya_id: a.wilayaId,
      wilaya_name_fr: w.nameFr,
      wilaya_name_ar: w.nameAr,
      commune_id: a.communeId,
      commune_name_fr: c.nameFr,
      commune_name_ar: c.nameAr,
      street_line: a.streetLine,
      building_details: a.buildingDetails,
      latitude: a.latitude,
      longitude: a.longitude,
      phone_contact: a.phoneContact,
      delivery_notes: a.deliveryNotes,
      is_default: a.isDefault,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
    };
  }

  async listAddresses(user: AuthUser, q: PaginationQueryDto) {
    const where = and(
      eq(addresses.userId, user.id),
      isNull(addresses.deletedAt),
    );
    const [rows, [{ total }]] = await Promise.all([
      this.addressQuery()
        .where(where)
        .orderBy(
          desc(addresses.isDefault),
          q.order === 'asc'
            ? asc(addresses.createdAt)
            : desc(addresses.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(addresses).where(where),
    ]);
    return Paginated.of(
      rows.map((r) => this.presentAddress(r)),
      total,
      q.page,
      q.limit,
    );
  }

  /** Owned, non-deleted address (used by requests too). */
  async getAddress(
    userId: string,
    id: string,
    tx: DbOrTx = this.db,
  ): Promise<AddressDto> {
    const [row] = await this.addressQuery(tx)
      .where(
        and(
          eq(addresses.id, id),
          eq(addresses.userId, userId),
          isNull(addresses.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new AppException('ADDRESS_NOT_FOUND');
    return this.presentAddress(row);
  }

  async createAddress(user: AuthUser, dto: CreateAddressDto) {
    await this.geo.assertCommuneInWilaya(dto.commune_id, dto.wilaya_id);
    return this.db.transaction(async (tx) => {
      const [{ existing }] = await tx
        .select({ existing: count() })
        .from(addresses)
        .where(and(eq(addresses.userId, user.id), isNull(addresses.deletedAt)));
      const makeDefault = existing === 0 || dto.is_default === true;
      if (makeDefault) await this.clearDefault(user.id, tx);
      const [row] = await tx
        .insert(addresses)
        .values({
          userId: user.id,
          label: dto.label,
          wilayaId: dto.wilaya_id,
          communeId: dto.commune_id,
          streetLine: dto.street_line,
          buildingDetails: dto.building_details,
          latitude: dto.latitude,
          longitude: dto.longitude,
          phoneContact: dto.phone_contact
            ? normalizePhone(dto.phone_contact)
            : null,
          deliveryNotes: dto.delivery_notes,
          isDefault: makeDefault,
        })
        .returning({ id: addresses.id });
      return this.getAddress(user.id, row.id, tx);
    });
  }

  async updateAddress(user: AuthUser, id: string, dto: UpdateAddressDto) {
    const current = await this.getAddress(user.id, id);
    const wilayaId = dto.wilaya_id ?? current.wilaya_id;
    const communeId = dto.commune_id ?? current.commune_id;
    if (dto.wilaya_id !== undefined || dto.commune_id !== undefined) {
      await this.geo.assertCommuneInWilaya(communeId, wilayaId);
    }
    return this.db.transaction(async (tx) => {
      if (dto.is_default === true) await this.clearDefault(user.id, tx);
      await tx
        .update(addresses)
        .set({
          label: dto.label,
          wilayaId,
          communeId,
          streetLine: dto.street_line,
          buildingDetails: dto.building_details,
          latitude: dto.latitude,
          longitude: dto.longitude,
          phoneContact: dto.phone_contact
            ? normalizePhone(dto.phone_contact)
            : undefined,
          deliveryNotes: dto.delivery_notes,
          // Un-setting the default is not allowed (exactly one default).
          isDefault: dto.is_default === true ? true : undefined,
        })
        .where(eq(addresses.id, id));
      return this.getAddress(user.id, id, tx);
    });
  }

  async setDefaultAddress(user: AuthUser, id: string) {
    await this.getAddress(user.id, id);
    return this.db.transaction(async (tx) => {
      await this.clearDefault(user.id, tx);
      await tx
        .update(addresses)
        .set({ isDefault: true })
        .where(eq(addresses.id, id));
      return this.getAddress(user.id, id, tx);
    });
  }

  async deleteAddress(user: AuthUser, id: string) {
    const current = await this.getAddress(user.id, id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(addresses)
        .set({ deletedAt: new Date(), isDefault: false })
        .where(eq(addresses.id, id));
      if (current.is_default) {
        // Promote the most recent remaining address.
        const [next] = await tx
          .select({ id: addresses.id })
          .from(addresses)
          .where(
            and(
              eq(addresses.userId, user.id),
              isNull(addresses.deletedAt),
              ne(addresses.id, id),
            ),
          )
          .orderBy(desc(addresses.createdAt))
          .limit(1);
        if (next)
          await tx
            .update(addresses)
            .set({ isDefault: true })
            .where(eq(addresses.id, next.id));
      }
    });
    return { ok: true };
  }

  private async clearDefault(userId: string, tx: DbOrTx) {
    await tx
      .update(addresses)
      .set({ isDefault: false })
      .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));
  }

  // ------------------------------------------------------------- dependants

  private async canRequestFor(
    d: Pick<DependantRow, 'relationship' | 'authorizationStatus'>,
  ) {
    const allowed = (await this.settings.get(
      'dependant_allowed_relationships',
    )) as string[];
    const needsVerification = await this.settings.get(
      'dependant_requires_verification',
    );
    if (!allowed.includes(d.relationship)) return false;
    if (d.authorizationStatus === 'REJECTED') return false;
    if (needsVerification && d.authorizationStatus !== 'VERIFIED') return false;
    return true;
  }

  private async presentDependant(d: DependantRow): Promise<DependantDto> {
    return {
      id: d.id,
      first_name: d.firstName,
      last_name: d.lastName,
      date_of_birth: d.dateOfBirth,
      relationship: d.relationship,
      authorization_status: d.authorizationStatus,
      proof_file_id: d.proofFileId,
      can_request_for: await this.canRequestFor(d),
      created_at: d.createdAt,
    };
  }

  async listDependants(user: AuthUser, q: PaginationQueryDto) {
    const where = and(
      eq(dependants.patientUserId, user.id),
      isNull(dependants.deletedAt),
    );
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(dependants)
        .where(where)
        .orderBy(
          q.order === 'asc'
            ? asc(dependants.createdAt)
            : desc(dependants.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(dependants).where(where),
    ]);
    return Paginated.of(
      await Promise.all(rows.map((d) => this.presentDependant(d))),
      total,
      q.page,
      q.limit,
    );
  }

  async findDependant(userId: string, id: string) {
    const [d] = await this.db
      .select()
      .from(dependants)
      .where(
        and(
          eq(dependants.id, id),
          eq(dependants.patientUserId, userId),
          isNull(dependants.deletedAt),
        ),
      )
      .limit(1);
    if (!d) throw new AppException('DEPENDANT_NOT_FOUND');
    return d;
  }

  async getDependant(user: AuthUser, id: string) {
    return this.presentDependant(await this.findDependant(user.id, id));
  }

  /** Used by requests: throws unless the patient may currently order for this dependant. */
  async assertCanRequestFor(userId: string, dependantId: string) {
    const d = await this.findDependant(userId, dependantId);
    const allowed = (await this.settings.get(
      'dependant_allowed_relationships',
    )) as string[];
    if (
      !allowed.includes(d.relationship) ||
      d.authorizationStatus === 'REJECTED'
    ) {
      throw new AppException('DEPENDANT_RELATIONSHIP_NOT_ALLOWED');
    }
    if (
      (await this.settings.get('dependant_requires_verification')) &&
      d.authorizationStatus !== 'VERIFIED'
    ) {
      throw new AppException('DEPENDANT_NOT_VERIFIED');
    }
    return d;
  }

  async createDependant(user: AuthUser, dto: CreateDependantDto) {
    if (dto.proof_file_id)
      await this.files.assertUsable(
        user.id,
        [dto.proof_file_id],
        ['DEPENDANT_PROOF'],
      );
    const [d] = await this.db
      .insert(dependants)
      .values({
        patientUserId: user.id,
        firstName: dto.first_name,
        lastName: dto.last_name,
        dateOfBirth: dto.date_of_birth,
        relationship: dto.relationship,
        proofFileId: dto.proof_file_id,
        authorizationStatus: 'DECLARED',
      })
      .returning();
    return this.presentDependant(d);
  }

  async updateDependant(user: AuthUser, id: string, dto: UpdateDependantDto) {
    const current = await this.findDependant(user.id, id);
    if (dto.proof_file_id)
      await this.files.assertUsable(
        user.id,
        [dto.proof_file_id],
        ['DEPENDANT_PROOF'],
      );
    const identityChanged =
      (dto.first_name !== undefined && dto.first_name !== current.firstName) ||
      (dto.last_name !== undefined && dto.last_name !== current.lastName) ||
      (dto.date_of_birth !== undefined &&
        dto.date_of_birth !== current.dateOfBirth) ||
      (dto.relationship !== undefined &&
        dto.relationship !== current.relationship) ||
      (dto.proof_file_id !== undefined &&
        dto.proof_file_id !== current.proofFileId);
    const [d] = await this.db
      .update(dependants)
      .set({
        firstName: dto.first_name,
        lastName: dto.last_name,
        dateOfBirth: dto.date_of_birth,
        relationship: dto.relationship,
        proofFileId: dto.proof_file_id,
        // Any change to the declared identity needs a new review.
        authorizationStatus: identityChanged ? 'DECLARED' : undefined,
      })
      .where(eq(dependants.id, id))
      .returning();
    return this.presentDependant(d);
  }

  async deleteDependant(user: AuthUser, id: string) {
    await this.findDependant(user.id, id);
    await this.db
      .update(dependants)
      .set({ deletedAt: new Date() })
      .where(eq(dependants.id, id));
    return { ok: true };
  }
}
