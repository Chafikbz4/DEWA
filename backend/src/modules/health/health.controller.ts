import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { Public } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import { Database, DRIZZLE } from '../../database/database.module';

class HealthDto {
  @ApiProperty({ example: 'ok' }) status!: string;
  @ApiProperty({ example: 'up' }) database!: string;
  @ApiProperty({ example: '2026-10-16T10:00:00.000Z' }) time!: string;
}

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  @ApiOperation({ summary: 'Liveness + database connectivity' })
  @ApiEnvelope(HealthDto)
  @ApiErrors()
  async check(): Promise<HealthDto> {
    try {
      const { rows } = await this.db.execute<{ now: Date }>(
        sql`select now() as now`,
      );
      return {
        status: 'ok',
        database: 'up',
        time: new Date(rows[0].now).toISOString(),
      };
    } catch {
      throw new AppException('INTERNAL_ERROR', { database: 'down' });
    }
  }
}
