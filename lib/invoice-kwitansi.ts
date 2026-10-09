import type { PrismaClient, Prisma } from "@prisma/client";
import { renderToBuffer } from "@react-pdf/renderer";
import { KwitansiPdfDocument, KwitansiPdfData } from "./kwitansi-pdf";

type Db = PrismaClient | Prisma.TransactionClient;

// The kwitansi that travels with the invoice as part of the billing pack. It is a
// pre-issued receipt for the cash the customer will transfer (grand total less any
// PPh they withhold); it does not record a payment — that only happens when finance
// approves a payment report.
export function kwitansiNumberFor(invoiceNumber: string) {
  return /INV/i.test(invoiceNumber) ? invoiceNumber.replace(/INV/i, "KWT") : `KWT-${invoiceNumber}`;
}

export async function renderInvoiceKwitansi(db: Db, invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { company: true, customer: true },
  });
  if (!invoice) return null;

  const number = kwitansiNumberFor(invoice.invoiceNumber);
  const data: KwitansiPdfData = {
    paymentNumber: number,
    paymentDate: invoice.invoiceDate.toISOString(),
    amount: Number(invoice.grandTotal) - Number(invoice.pphAmount),
    method: "transfer",
    description: `Pembayaran invoice ${invoice.invoiceNumber}`,
    invoiceReferences: [invoice.invoiceNumber],
    company: {
      name: invoice.company.name,
      description: invoice.company.description,
      address: invoice.company.address,
      city: invoice.company.city,
      province: invoice.company.province,
      postalCode: invoice.company.postalCode,
      phone: invoice.company.phone,
      email: invoice.company.email,
      npwp: invoice.company.npwp,
      bankName: invoice.company.bankName,
      bankAccount: invoice.company.bankAccount,
      logo: invoice.company.logo,
      signatoryName: invoice.company.signatoryName,
      signatoryTitle: invoice.company.signatoryTitle,
    },
    customerName: invoice.customer.name,
    customerAddress: invoice.customer.address,
  };

  const buffer = await renderToBuffer(KwitansiPdfDocument({ data }));
  return { buffer, number };
}
