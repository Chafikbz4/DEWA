import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  development = 'development',
  test = 'test',
  production = 'production',
}

const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);
const toBool = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : String(value) === 'true';

/** Every env var the app reads. The app refuses to boot if this fails. */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.development;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @Matches(/^postgres(ql)?:\/\//)
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  @Matches(/^postgres(ql)?:\/\//)
  DATABASE_URL_UNPOOLED?: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(100)
  DATABASE_POOL_MAX = 10;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  /** Comma-separated allowlist, e.g. "http://localhost:5173,https://app.dewa.dz" */
  @IsString()
  CORS_ORIGINS = 'http://localhost:3000,http://localhost:5173';

  @Transform(toBool)
  @IsBoolean()
  TRUST_PROXY = false;

  // ---- Secrets ----
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @Transform(toInt)
  @IsInt()
  @Min(60)
  @Max(3600)
  JWT_ACCESS_TTL_SECONDS = 900;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(180)
  REFRESH_TOKEN_TTL_DAYS = 30;

  /** base64-encoded 32-byte key for AES-256-GCM field encryption. */
  @IsString()
  @Matches(/^[A-Za-z0-9+/]{43}=$/, {
    message: 'ENCRYPTION_KEY must be 32 random bytes, base64-encoded',
  })
  ENCRYPTION_KEY!: string;

  /** Secret pepper for HMAC hashing of OTPs, refresh & invitation tokens. */
  @IsString()
  @MinLength(32)
  HASH_PEPPER!: string;

  // ---- OTP ----
  @Transform(toInt)
  @IsInt()
  @Min(60)
  @Max(1800)
  OTP_TTL_SECONDS = 300;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(10)
  OTP_MAX_ATTEMPTS = 5;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(600)
  OTP_RESEND_COOLDOWN_SECONDS = 60;

  // ---- Lockout ----
  @Transform(toInt)
  @IsInt()
  @Min(3)
  @Max(20)
  LOGIN_MAX_FAILED_ATTEMPTS = 5;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(1440)
  LOGIN_LOCKOUT_MINUTES = 15;

  // ---- Rate limiting ----
  @Transform(toInt)
  @IsInt()
  @Min(1)
  RATE_LIMIT_GLOBAL_PER_MINUTE = 120;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  RATE_LIMIT_AUTH_IP_PER_MINUTE = 20;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  RATE_LIMIT_AUTH_ACCOUNT_PER_15_MIN = 10;

  // ---- Providers ----
  @IsEnum(['console'])
  SMS_PROVIDER = 'console' as const;

  @IsEnum(['console'])
  EMAIL_PROVIDER = 'console' as const;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(30)
  STAFF_INVITATION_TTL_DAYS = 7;

  /** Version strings the client must send when accepting consents. */
  @IsString()
  CONSENT_TERMS_VERSION = '2026-10';

  @IsString()
  CONSENT_PRIVACY_VERSION = '2026-10';

  @Transform(toBool)
  @IsBoolean()
  SWAGGER_ENABLED = true;
}

export function validateEnv(config: Record<string, unknown>) {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length) {
    const lines = errors.map(
      (e) =>
        `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  if (env.NODE_ENV === NodeEnv.production) {
    // Mock providers would print OTPs to stdout – never allowed in production.
    if (env.SMS_PROVIDER === 'console' || env.EMAIL_PROVIDER === 'console') {
      throw new Error(
        'Console SMS/email providers are not allowed in production. Configure a real provider.',
      );
    }
  }
  return env;
}
