import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import type {
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  ApiExtraModels,
  ApiProperty,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ERROR_CODES, ErrorCode, messageKeyFor } from '../errors/error-codes';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 42 }) total!: number;
  @ApiProperty({ example: 3 }) total_pages!: number;
}

export class ApiErrorDto {
  @ApiProperty({ example: 'AUTH_INVALID_CREDENTIALS' }) code!: string;
  @ApiProperty({ example: 'errors.AUTH_INVALID_CREDENTIALS' })
  message_key!: string;
  @ApiProperty({ example: 'Identifiant ou mot de passe incorrect.' })
  message!: string;
  @ApiProperty({ nullable: true, example: null }) details!: unknown;
}

export class MessageResultDto {
  @ApiProperty({ example: true }) ok!: boolean;
}

interface EnvelopeOptions {
  status?: HttpStatus;
  description?: string;
  isArray?: boolean;
  paginated?: boolean;
}

/** Documents a success response wrapped in the unified envelope. */
export function ApiEnvelope(
  model: Type<unknown> | null,
  opts: EnvelopeOptions = {},
) {
  const dataSchema = !model
    ? { type: 'object', nullable: true, example: null }
    : opts.isArray || opts.paginated
      ? { type: 'array', items: { $ref: getSchemaPath(model) } }
      : { $ref: getSchemaPath(model) };
  const meta: Record<string, SchemaObject | ReferenceObject> = {
    request_id: { type: 'string', example: '1f0c6a1e-...' },
  };
  if (opts.paginated)
    meta.pagination = { $ref: getSchemaPath(PaginationMetaDto) };

  return applyDecorators(
    ApiExtraModels(PaginationMetaDto, ...(model ? [model] : [])),
    ApiResponse({
      status: opts.status ?? HttpStatus.OK,
      description: opts.description ?? 'Success',
      schema: {
        type: 'object',
        required: ['success', 'data', 'error', 'meta'],
        properties: {
          success: { type: 'boolean', example: true },
          data: dataSchema,
          error: { type: 'object', nullable: true, example: null },
          meta: { type: 'object', properties: meta },
        },
      },
    }),
  );
}

/** Documents the error codes a route can return, grouped by HTTP status. */
export function ApiErrors(...codes: ErrorCode[]) {
  const all: ErrorCode[] = [
    ...new Set<ErrorCode>([
      'VALIDATION_FAILED',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      ...codes,
    ]),
  ];
  const byStatus = new Map<number, ErrorCode[]>();
  for (const c of all) {
    const s = ERROR_CODES[c];
    byStatus.set(s, [...(byStatus.get(s) ?? []), c]);
  }
  return applyDecorators(
    ApiExtraModels(ApiErrorDto),
    ...[...byStatus.entries()].map(([status, list]) =>
      ApiResponse({
        status,
        description: `Error codes: ${list.join(', ')}`,
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            data: { type: 'object', nullable: true, example: null },
            error: {
              allOf: [{ $ref: getSchemaPath(ApiErrorDto) }],
              example: {
                code: list[0],
                message_key: messageKeyFor(list[0]),
                message: '…',
                details: null,
              },
            },
            meta: { type: 'object', example: { request_id: '1f0c6a1e-...' } },
          },
        },
      }),
    ),
  );
}
