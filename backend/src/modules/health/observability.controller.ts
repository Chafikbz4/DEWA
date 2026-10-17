import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { metrics } from '../../common/observability/metrics';
import { ApiErrors } from '../../common/swagger/api-responses';
import { Database, DRIZZLE } from '../../database/database.module';
import { JobQueueService } from '../jobs/job-queue.service';

/**
 * Probes and metrics:
 * - GET /health/live – process is up (no dependency), for liveness probes;
 * - GET /ready – database reachable and migrations applied, queue backend known;
 * - GET /metrics – Prometheus text; requires `Authorization: Bearer $METRICS_TOKEN`
 *   (disabled when METRICS_TOKEN is not set).
 */
@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller()
export class ObservabilityController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly jobs: JobQueueService,
  ) {}

  @Get('health/live')
  @ApiOperation({ summary: 'Liveness (no dependency checked)' })
  @ApiErrors()
  live() {
    return { status: 'ok', uptime_seconds: Math.round(process.uptime()) };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness: database reachable and schema migrated',
  })
  @ApiErrors('INTERNAL_ERROR')
  async ready() {
    try {
      const { rows } = await this.db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
      );
      return {
        status: 'ready',
        database: 'up',
        migrations_applied: rows[0].n,
        job_queue: this.jobs.backend,
        time: new Date().toISOString(),
      };
    } catch {
      throw new AppException('INTERNAL_ERROR', { ready: false });
    }
  }

  @Get('metrics')
  @ApiExcludeEndpoint()
  metrics(
    @Headers('authorization') auth: string | undefined,
    @Res() res: Response,
  ) {
    const token = this.config.get<string>('METRICS_TOKEN');
    const given = Buffer.from(auth?.replace(/^Bearer\s+/i, '') ?? '');
    const expected = Buffer.from(token ?? '');
    if (
      !token ||
      given.length !== expected.length ||
      !timingSafeEqual(given, expected)
    )
      throw new AppException('ROUTE_NOT_FOUND');
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(metrics.render());
  }
}
