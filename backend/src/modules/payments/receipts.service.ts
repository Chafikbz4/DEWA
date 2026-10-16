import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
// pdfkit is CommonJS (`export =`) and the project has no esModuleInterop.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { AuthUser } from '../../common/auth/auth-user';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import {
  orderItems,
  orders,
  patientProfiles,
  payments,
  pharmacies,
  receipts,
} from '../../database/schema';

type OrderRow = typeof orders.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

export interface ReceiptSnapshot {
  receipt_number: string;
  issued_at: string;
  order_reference: string;
  pharmacy: {
    name: string;
    legal_name: string | null;
    tax_id_nif: string | null;
    commercial_register_rc: string | null;
    address: string;
  };
  customer: { name: string };
  lines: {
    name: string;
    quantity: number;
    unit_price_centimes: number;
    line_total_centimes: number;
  }[];
  medicines_subtotal_centimes: number;
  delivery_fee_centimes: number;
  service_fee_centimes: number;
  total_centimes: number;
  currency: string;
  payment: {
    provider: string;
    reference_masked: string | null;
    verified_at: string | null;
  };
}

const fmt = (centimes: number) =>
  `${(centimes / 100).toFixed(2).replace('.', ',')} DA`;

/** Receipts are generated automatically when a payment is CONFIRMED (frozen snapshot). */
@Injectable()
export class ReceiptsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async issue(tx: DbOrTx, order: OrderRow, payment: PaymentRow) {
    const [existing] = await tx
      .select({ id: receipts.id })
      .from(receipts)
      .where(eq(receipts.paymentId, payment.id))
      .limit(1);
    if (existing) return existing.id;
    const [{ seq }] = (
      await tx.execute<{ seq: string }>(
        sql`SELECT nextval('receipt_number_seq')::text AS seq`,
      )
    ).rows;
    const now = new Date();
    const [ph] = await tx
      .select()
      .from(pharmacies)
      .where(eq(pharmacies.id, order.pharmacyId));
    const [pp] = await tx
      .select()
      .from(patientProfiles)
      .where(eq(patientProfiles.userId, order.patientUserId));
    const lines = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    const number = `RCP-${now.getUTCFullYear()}-${seq.padStart(6, '0')}`;
    const snapshot: ReceiptSnapshot = {
      receipt_number: number,
      issued_at: now.toISOString(),
      order_reference: order.reference,
      pharmacy: {
        name: ph.nameFr,
        legal_name: ph.legalName,
        tax_id_nif: ph.taxIdNif,
        commercial_register_rc: ph.commercialRegisterRc,
        address: ph.addressLine,
      },
      customer: { name: pp ? `${pp.firstName} ${pp.lastName}` : '' },
      lines: lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unit_price_centimes: l.unitPriceCentimes,
        line_total_centimes: l.lineTotalCentimes,
      })),
      medicines_subtotal_centimes: order.itemsSubtotalCentimes,
      delivery_fee_centimes: order.deliveryFeeCentimes,
      service_fee_centimes: order.serviceFeeCentimes,
      total_centimes: order.totalCentimes,
      currency: order.currency,
      payment: {
        provider: payment.provider,
        reference_masked: CryptoService.mask(
          payment.providerReference ?? null,
          4,
        ),
        verified_at: payment.verifiedServerSideAt?.toISOString() ?? null,
      },
    };
    const [row] = await tx
      .insert(receipts)
      .values({
        orderId: order.id,
        paymentId: payment.id,
        receiptNumber: number,
        issuedAt: now,
        dataSnapshot: snapshot,
      })
      .returning({ id: receipts.id });
    return row.id;
  }

  async getForPatient(
    user: AuthUser,
    orderId: string,
  ): Promise<ReceiptSnapshot> {
    const [row] = await this.db
      .select({ r: receipts, patient: orders.patientUserId })
      .from(receipts)
      .innerJoin(orders, eq(orders.id, receipts.orderId))
      .where(eq(receipts.orderId, orderId))
      .limit(1);
    if (!row || row.patient !== user.id)
      throw new AppException('RECEIPT_NOT_FOUND');
    return row.r.dataSnapshot as ReceiptSnapshot;
  }

  /** French PDF (Latin glyphs; Arabic rendering needs an embedded Arabic font – see docs). */
  renderPdf(s: ReceiptSnapshot): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: { Title: s.receipt_number, Author: 'DEWA' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc
        .fontSize(18)
        .text('Reçu de paiement', { align: 'center' })
        .moveDown(0.5);
      doc
        .fontSize(10)
        .text(
          `N° ${s.receipt_number}   ·   ${new Date(s.issued_at).toLocaleString('fr-DZ', { timeZone: 'Africa/Algiers' })}`,
          { align: 'center' },
        );
      doc.moveDown();
      doc.fontSize(11).text(s.pharmacy.legal_name ?? s.pharmacy.name);
      doc.fontSize(9).text(s.pharmacy.address);
      if (s.pharmacy.tax_id_nif) doc.text(`NIF : ${s.pharmacy.tax_id_nif}`);
      if (s.pharmacy.commercial_register_rc)
        doc.text(`RC : ${s.pharmacy.commercial_register_rc}`);
      doc
        .moveDown()
        .fontSize(10)
        .text(`Client : ${s.customer.name}`)
        .text(`Commande : ${s.order_reference}`)
        .moveDown();

      doc.fontSize(10);
      for (const l of s.lines) {
        doc
          .text(`${l.quantity} × ${l.name}`, { continued: true })
          .text(fmt(l.line_total_centimes), { align: 'right' });
      }
      doc.moveDown(0.5);
      doc
        .text('Sous-total médicaments', { continued: true })
        .text(fmt(s.medicines_subtotal_centimes), { align: 'right' });
      doc
        .text('Frais de livraison', { continued: true })
        .text(fmt(s.delivery_fee_centimes), { align: 'right' });
      doc
        .text('Frais de service', { continued: true })
        .text(fmt(s.service_fee_centimes), { align: 'right' });
      doc
        .fontSize(12)
        .text('Total payé', { continued: true })
        .text(fmt(s.total_centimes), { align: 'right' });
      doc
        .moveDown()
        .fontSize(8)
        .text(
          `Paiement : ${s.payment.provider}${s.payment.reference_masked ? ` (réf. ${s.payment.reference_masked})` : ''}`,
        );
      doc.text(
        'Document généré par la plateforme DEWA. Ce reçu ne constitue pas une facture fiscale de la pharmacie.',
      );
      doc.end();
    });
  }
}
