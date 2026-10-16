import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  NestInterceptor,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsEnum } from 'class-validator';
import { Response } from 'express';
import { catchError, Observable, throwError } from 'rxjs';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  AllowAccountStatus,
  CurrentUser,
  Public,
  ReqMeta,
  RequestMeta,
} from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import { filePurposeEnum } from '../../database/schema';
import { FileAccessService } from './file-access.service';
import {
  FilePurpose,
  FilesService,
  presentFile,
  UploadedBlob,
} from './files.service';

const MAX_FILES = Number(process.env.FILE_MAX_FILES ?? 5);
const MAX_BYTES = Number(process.env.FILE_MAX_SIZE_MB ?? 10) * 1024 * 1024;

class UploadDto {
  @ApiProperty({ enum: filePurposeEnum.enumValues, example: 'PRESCRIPTION' })
  @IsEnum(filePurposeEnum.enumValues)
  purpose!: FilePurpose;
}

class FileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: filePurposeEnum.enumValues }) purpose!: string;
  @ApiProperty({ example: 'ordonnance-page1.jpg', nullable: true })
  original_name!: string | null;
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'application/pdf'] })
  mime_type!: string;
  @ApiProperty({ example: 482133 }) size_bytes!: number;
  @ApiProperty({ example: 'e3b0c44298fc1c149afbf4c8996fb924…' })
  sha256!: string;
  @ApiProperty({ enum: ['PENDING', 'CLEAN', 'INFECTED'] })
  malware_scan_status!: string;
  @ApiProperty() created_at!: Date;
}

class AccessUrlDto {
  @ApiProperty({
    example: 'http://localhost:3000/files/download/eyJmIjoi….3f9a…',
  })
  url!: string;
  @ApiProperty() expires_at!: Date;
  @ApiProperty({ example: 'image/jpeg' }) mime_type!: string;
  @ApiProperty({ example: 482133 }) size_bytes!: number;
}

/** Maps multer errors to API error codes. */
@Injectable()
class UploadErrorsInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof PayloadTooLargeException) {
          return throwError(
            () =>
              new AppException('FILE_TOO_LARGE', null, {
                max: MAX_BYTES / 1024 / 1024,
              }),
          );
        }
        if (
          err instanceof Error &&
          /Too many files|Unexpected field/i.test(err.message)
        ) {
          return throwError(() => new AppException('FILE_TOO_MANY'));
        }
        return throwError(() => err);
      }),
    );
  }
}

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly access: FileAccessService,
  ) {}

  @Post('upload')
  @ApiBearerAuth()
  @AllowAccountStatus('PENDING_VERIFICATION')
  @UseInterceptors(
    UploadErrorsInterceptor,
    FilesInterceptor('files', MAX_FILES, {
      limits: { fileSize: MAX_BYTES, files: MAX_FILES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['purpose', 'files'],
      properties: {
        purpose: { type: 'string', enum: [...filePurposeEnum.enumValues] },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: `1–${MAX_FILES} files`,
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload files (JPEG / PNG / PDF)',
    description:
      'multipart/form-data with `purpose` and one or more `files`. Type is detected from the file content (magic bytes), ' +
      'not the extension. Max FILE_MAX_SIZE_MB (10) per file, FILE_MAX_FILES (5) per call. Files are malware-scanned and ' +
      'encrypted at rest. A single invalid file rejects the whole batch. Purposes per role: PATIENT → PRESCRIPTION, CHIFA_CARD, ' +
      'MESSAGE_ATTACHMENT, DEPENDANT_PROOF; PHARMACY_OWNER/PHARMACIST → PHARMACY_DOC, MESSAGE_ATTACHMENT; ASSISTANT → ' +
      'MESSAGE_ATTACHMENT; DELIVERY_COMPANY_ADMIN → DELIVERY_COMPANY_DOC; DRIVER → DRIVER_DOC, PROOF_OF_DELIVERY.',
  })
  @ApiEnvelope(FileDto, { isArray: true, status: 201 })
  @ApiErrors(
    'FILE_REQUIRED',
    'FILE_TOO_MANY',
    'FILE_TOO_LARGE',
    'FILE_TYPE_NOT_ALLOWED',
    'FILE_INFECTED',
    'FILE_PURPOSE_NOT_ALLOWED',
    'AUTH_TOKEN_MISSING',
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadDto,
    @UploadedFiles() uploaded: UploadedBlob[],
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.files.upload(user, dto.purpose, uploaded ?? [], meta);
  }

  @Get(':id')
  @ApiBearerAuth()
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({ summary: 'File metadata (if you may access it)' })
  @ApiEnvelope(FileDto)
  @ApiErrors('FILE_NOT_FOUND')
  async metadata(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const { file } = await this.access.authorize(user, id);
    return presentFile(file);
  }

  @Get(':id/access-url')
  @ApiBearerAuth()
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary: 'Get a short-lived signed download link',
    description:
      'Only for users authorized on this file (owner, recipient pharmacist/owner with patient consent, …). The link is valid ' +
      'FILE_URL_TTL_SECONDS (300 s). Every issuance is audited; prescription/CHIFA reads also go to sensitive_access_logs.',
  })
  @ApiEnvelope(AccessUrlDto)
  @ApiErrors('FILE_NOT_FOUND')
  accessUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.access.issueAccessUrl(user, id, meta);
  }

  @Public()
  @SkipThrottle({ auth_ip: true, auth_account: true })
  @Get('download/:token')
  @ApiOperation({
    summary: 'Download through a signed link (no Bearer needed)',
    description:
      'Returns the raw file (not the JSON envelope) with Cache-Control: no-store. Invalid/expired → 403 FILE_URL_INVALID (JSON).',
  })
  @ApiErrors('FILE_URL_INVALID')
  async download(
    @Param('token') token: string,
    @ReqMeta() meta: RequestMeta,
    @Res() res: Response,
  ) {
    const { file, content } = await this.access.download(token, meta);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', content.length);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.id}.${file.mimeType.split('/')[1]}"`,
    );
    res.end(content);
  }
}
