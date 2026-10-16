import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from '../errors/app.exception';

export interface ValidationIssue {
  /** Dotted path, e.g. "consents.0.type" */
  field: string;
  errors: { rule: string; message_key: string; message?: string }[];
}

const RULE_ALIASES: Record<string, string> = {
  isPhoneNumber: 'isPhone',
  isE164: 'isPhone',
};

function flatten(errors: ValidationError[], parent = ''): ValidationIssue[] {
  return errors.flatMap((err) => {
    const field = parent ? `${parent}.${err.property}` : err.property;
    const own: ValidationIssue[] = err.constraints
      ? [
          {
            field,
            errors: Object.keys(err.constraints).map((rule) => {
              const key = RULE_ALIASES[rule] ?? rule;
              return { rule: key, message_key: `validation.${key}` };
            }),
          },
        ]
      : [];
    return [...own, ...flatten(err.children ?? [], field)];
  });
}

export function buildValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: false,
    exceptionFactory: (errors) =>
      new AppException('VALIDATION_FAILED', flatten(errors)),
  });
}
