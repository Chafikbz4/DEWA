import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/**
 * Object storage. Callers always pass ALREADY ENCRYPTED bytes; providers never
 * see plaintext and never expose public URLs.
 */
export interface IStorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Development: files under STORAGE_LOCAL_DIR (git-ignored). */
@Injectable()
export class LocalDiskStorageProvider implements IStorageProvider {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('STORAGE_LOCAL_DIR', './storage'));
  }

  private pathFor(key: string) {
    const full = resolve(this.root, key);
    // Keys are server-generated, but never allow escaping the root.
    if (!full.startsWith(this.root + sep))
      throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer) {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { mode: 0o600 });
  }

  get(key: string) {
    return readFile(this.pathFor(key));
  }

  async delete(key: string) {
    await rm(this.pathFor(key), { force: true });
  }
}

/** Production: any S3-compatible store (AWS S3, MinIO, Scaleway, OVH…). Bucket must be private. */
@Injectable()
export class S3StorageProvider implements IStorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      region: config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint: config.get<string>('S3_ENDPOINT') || undefined,
      forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE', true),
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  async put(key: string, data: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: 'application/octet-stream',
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async get(key: string) {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

export const storageProviderFactory = {
  provide: STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): IStorageProvider =>
    config.get('STORAGE_DRIVER') === 's3'
      ? new S3StorageProvider(config)
      : new LocalDiskStorageProvider(config),
};
