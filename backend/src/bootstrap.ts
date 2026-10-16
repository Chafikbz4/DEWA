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

/** Shared by main.ts and the e2e tests so both run the exact same stack. */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const express = app as NestExpressApplication;

  if (config.get<boolean>('TRUST_PROXY')) express.set('trust proxy', 1);
  express.disable('x-powered-by');

  app.use(helmet());
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: false, limit: '100kb' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    req.requestId =
      typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
        ? incoming
        : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
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
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.useGlobalPipes(new SanitizePipe(), buildValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(app.get(I18nService)));
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.enableShutdownHooks();

  if (config.get<boolean>('SWAGGER_ENABLED')) {
    const doc = SwaggerModule.createDocument(
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
    SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs-json' });
  }
  return app;
}
