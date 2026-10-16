import { Injectable } from '@nestjs/common';

export const OCR_PROVIDER = Symbol('OCR_PROVIDER');

export interface OcrSuggestion {
  name: string;
  quantity?: number;
  dosage?: string;
  /** 0..1 */
  confidence: number;
}

export interface OcrOutput {
  provider: string;
  rawText: string;
  suggestions: OcrSuggestion[];
}

/**
 * Prescription OCR. Output is ADVISORY ONLY: stored as request_items with
 * source=OCR and confirmed_by_pharmacist=false. It never changes a status.
 */
export interface IOcrProvider {
  readonly name: string;
  extract(content: Buffer, mimeType: string): Promise<OcrOutput>;
}

/** Deterministic mock for development and tests. */
@Injectable()
export class MockOcrProvider implements IOcrProvider {
  readonly name = 'MOCK';

  async extract(content: Buffer, mimeType: string): Promise<OcrOutput> {
    return {
      provider: this.name,
      rawText: `MOCK OCR (${mimeType}, ${content.length} bytes)\nParacetamol 1g – 1 cp x 3/j – 1 boite`,
      suggestions: [
        {
          name: 'Paracetamol 1g',
          quantity: 1,
          dosage: '1 cp x 3/j',
          confidence: 0.62,
        },
      ],
    };
  }
}
