/** Detects the real file type from magic bytes – the client-sent MIME type is ignored. */
export type AllowedMime = 'image/jpeg' | 'image/png' | 'application/pdf';

const SIGNATURES: { mime: AllowedMime; bytes: number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  {
    mime: 'image/png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
];

export function detectMime(data: Buffer): AllowedMime | null {
  return (
    SIGNATURES.find((s) => s.bytes.every((b, i) => data[i] === b))?.mime ?? null
  );
}

export const EXTENSION: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
