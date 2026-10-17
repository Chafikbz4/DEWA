import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, NextFunction, Request, Response, urlencoded } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/http/response-envelope.interceptor';
import { SanitizePipe } from './common/http/sanitize.pipe';
import { buildValidationPipe } from './common/http/validation';
import { I18nService } from './common/i18n/i18n.service';
import { metrics } from './common/observability/metrics';
import { SecretFieldsInterceptor } from './common/observability/secret-fields.interceptor';
import { Logger } from '@nestjs/common';

const accessLog = new Logger('HTTP');

/** Shared by main.ts and the e2e tests so both run the exact same stack. */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const express = app as NestExpressApplication;

  if (config.get<boolean>('TRUST_PROXY')) express.set('trust proxy', 1);
  express.disable('x-powered-by');

  app.use(helmet());
  // rawBody is kept for webhook signature verification (HMAC over the exact bytes).
  app.use(
    json({
      limit: '100kb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        if (req.url?.startsWith('/payments/webhook/'))
          req.rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(urlencoded({ extended: false, limit: '100kb' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    req.requestId =
      typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
        ? incoming
        : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    // Access log + metrics: route template (no ids, no query string), never bodies.
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const route = (req.route as { path?: string } | undefined)?.path
        ? `${req.baseUrl}${(req.route as { path: string }).path}`
        : 'unmatched';
      metrics.observeHttp(req.method, route, res.statusCode, seconds);
      if (req.path !== '/health/live' && req.path !== '/metrics')
        accessLog.log(
          JSON.stringify({
            method: req.method,
            route,
            status: res.statusCode,
            duration_ms: Math.round(seconds * 1000),
            request_id: req.requestId,
            user_id: (req.user as { id?: string } | undefined)?.id ?? null,
          }),
        );
    });
    next();
  });

  const origins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept-Language',
      'X-Request-Id',
      'X-Device-Id',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.useGlobalPipes(new SanitizePipe(), buildValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(app.get(I18nService)));
  // Order: envelope (outer) → secret-field stripping (inner, sees the raw controller result).
  app.useGlobalInterceptors(
    new ResponseEnvelopeInterceptor(),
    new SecretFieldsInterceptor(),
  );
  app.enableShutdownHooks();

  if (config.get<boolean>('SWAGGER_ENABLED')) {
    const doc = buildOpenApiDocument(app);
    SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs-json' });
  }
  return app;
}

/** OpenAPI document (also exported to docs/openapi.json by scripts/export-openapi.ts). */
export function buildOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('DEWA API')
      .setDescription(
        'Bilingual (ar/fr) healthcare marketplace API. Every response uses the envelope ' +
          '`{ success, data, error: { code, message_key, message, details }, meta: { request_id, pagination } }`. ' +
          'Send `Accept-Language: ar` or `fr` to localise `error.message`. Full guides: /docs/api/*.md in the repo.',
      )
      .setVersion('0.2.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addGlobalParameters({
        name: 'Accept-Language',
        in: 'header',
        required: false,
        schema: { type: 'string', enum: ['fr', 'ar'], default: 'fr' },
      })
      .build(),
  );
}
