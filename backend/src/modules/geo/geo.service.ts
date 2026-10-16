import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AppException } from '../../common/errors/app.exception';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import { communes, wilayas } from '../../database/schema';

@Injectable()
export class GeoService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Throws GEO_INVALID_COMMUNE unless the commune belongs to the wilaya. Returns names. */
  async assertCommuneInWilaya(
    communeId: number,
    wilayaId: number,
    tx: DbOrTx = this.db,
  ) {
    const [row] = await tx
      .select({
        communeFr: communes.nameFr,
        communeAr: communes.nameAr,
        wilayaFr: wilayas.nameFr,
        wilayaAr: wilayas.nameAr,
      })
      .from(communes)
      .innerJoin(wilayas, eq(wilayas.id, communes.wilayaId))
      .where(and(eq(communes.id, communeId), eq(communes.wilayaId, wilayaId)))
      .limit(1);
    if (!row) throw new AppException('GEO_INVALID_COMMUNE');
    return row;
  }
}
