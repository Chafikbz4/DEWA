import { Logger, LogLevel } from '@nestjs/common';
import {
  JsonLogger,
  RedactingConsoleLogger,
} from './common/observability/json-logger';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const logger =
    process.env.LOG_FORMAT === 'json'
      ? new JsonLogger((process.env.LOG_LEVEL as LogLevel | undefined) ?? 'log')
      : new RedactingConsoleLogger();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger,
  });
  configureApp(app);
  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(
    `DEWA API listening on http://localhost:${port} (docs: /docs)`,
    'Bootstrap',
  );
}
bootstrap();
