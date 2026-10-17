/* Exports the final OpenAPI document and a Postman v2.1 collection (importable
 * in Insomnia too) generated from it.
 *   docs/openapi.json
 *   docs/postman/dewa.postman_collection.json
 *   docs/postman/dewa.postman_environment.json
 * Usage: npm run docs:openapi   (no database query is made)
 */
import { config } from 'dotenv';
config({ path: [process.env.ENV_FILE ?? '.env.local', '.env'], quiet: true });
process.env.JOBS_ENABLED = 'false';

import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/bootstrap';

type Schema = {
  $ref?: string;
  type?: string;
  example?: unknown;
  enum?: unknown[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  allOf?: Schema[];
  default?: unknown;
  format?: string;
};
type Doc = {
  paths: Record<
    string,
    Record<
      string,
      {
        tags?: string[];
        summary?: string;
        description?: string;
        requestBody?: { content?: Record<string, { schema?: Schema }> };
        parameters?: {
          name: string;
          in: string;
          required?: boolean;
          schema?: Schema;
        }[];
      }
    >
  >;
  components?: { schemas?: Record<string, Schema> };
};

function example(doc: Doc, s: Schema | undefined, depth = 0): unknown {
  if (!s || depth > 6) return undefined;
  if (s.$ref)
    return example(
      doc,
      doc.components?.schemas?.[s.$ref.split('/').pop()!],
      depth + 1,
    );
  if (s.example !== undefined) return s.example;
  if (s.allOf)
    return Object.assign(
      {},
      ...s.allOf.map((x) => example(doc, x, depth + 1) as object),
    );
  if (s.enum?.length) return s.enum[0];
  if (s.default !== undefined) return s.default;
  switch (s.type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(s.properties ?? {})) {
        if (s.required && !s.required.includes(k) && depth > 0) continue;
        out[k] = example(doc, v, depth + 1);
      }
      return out;
    }
    case 'array':
      return [example(doc, s.items, depth + 1)].filter((x) => x !== undefined);
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'string':
      return s.format === 'uuid'
        ? '00000000-0000-0000-0000-000000000000'
        : s.format === 'date-time'
          ? new Date(0).toISOString()
          : '';
    default:
      return s.properties
        ? example(doc, { ...s, type: 'object' }, depth)
        : undefined;
  }
}

function toPostman(doc: Doc) {
  const folders = new Map<string, unknown[]>();
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      const folder = op.tags?.[0] ?? 'Other';
      const segments = path
        .replace(/^\//, '')
        .split('/')
        .map((p) => p.replace(/^\{(.+)\}$/, ':$1'));
      const json = op.requestBody?.content?.['application/json']?.schema;
      const multipart = op.requestBody?.content?.['multipart/form-data'];
      const headers = [
        { key: 'Accept-Language', value: '{{lang}}' },
        ...(method === 'post' && /\/pay$|\/accept$/.test(path)
          ? [{ key: 'Idempotency-Key', value: '{{$guid}}' }]
          : []),
        ...(json ? [{ key: 'Content-Type', value: 'application/json' }] : []),
      ];
      const query = (op.parameters ?? [])
        .filter((p) => p.in === 'query')
        .map((p) => ({
          key: p.name,
          value: String(example(doc, p.schema) ?? ''),
          disabled: !p.required,
        }));
      const vars = (op.parameters ?? [])
        .filter((p) => p.in === 'path')
        .map((p) => ({ key: p.name, value: '' }));
      const item = {
        name: `${method.toUpperCase()} ${path}${op.summary ? ` – ${op.summary}` : ''}`,
        request: {
          method: method.toUpperCase(),
          header: headers,
          description: op.description,
          url: {
            raw: `{{base_url}}${path.replace(/\{(\w+)\}/g, ':$1')}`,
            host: ['{{base_url}}'],
            path: segments,
            query,
            variable: vars,
          },
          ...(json
            ? {
                body: {
                  mode: 'raw',
                  raw: JSON.stringify(example(doc, json) ?? {}, null, 2),
                  options: { raw: { language: 'json' } },
                },
              }
            : {}),
          ...(multipart
            ? {
                body: {
                  mode: 'formdata',
                  formdata: [{ key: 'file', type: 'file', src: [] }],
                },
              }
            : {}),
        },
      };
      folders.set(folder, [...(folders.get(folder) ?? []), item]);
    }
  }
  return {
    info: {
      name: 'DEWA API',
      schema:
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description:
        'Generated from docs/openapi.json – see docs/frontend-handoff/README.md',
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{access_token}}', type: 'string' }],
    },
    item: [...folders.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, item]) => ({ name, item })),
  };
}

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
    bodyParser: false,
    abortOnError: false,
  });
  const doc = buildOpenApiDocument(app) as unknown as Doc;
  const out = resolve(process.cwd(), 'docs');
  mkdirSync(resolve(out, 'postman'), { recursive: true });
  writeFileSync(
    resolve(out, 'openapi.json'),
    `${JSON.stringify(doc, null, 2)}\n`,
  );
  writeFileSync(
    resolve(out, 'postman/dewa.postman_collection.json'),
    `${JSON.stringify(toPostman(doc), null, 2)}\n`,
  );
  writeFileSync(
    resolve(out, 'postman/dewa.postman_environment.json'),
    `${JSON.stringify(
      {
        name: 'DEWA local',
        values: [
          { key: 'base_url', value: 'http://localhost:3000', enabled: true },
          { key: 'lang', value: 'fr', enabled: true },
          { key: 'access_token', value: '', enabled: true },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const ops = Object.values(doc.paths).reduce(
    (n, o) => n + Object.keys(o).length,
    0,
  );
  console.log(
    `✓ docs/openapi.json (${Object.keys(doc.paths).length} paths, ${ops} operations) + Postman collection`,
  );
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
