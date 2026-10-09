import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { terbilangRupiah } from "./terbilang";
import { companyDetailLines } from "./company-pdf";

/**
 * MDA invoice layout (see Panduan-Claude-Invoice-MDA.md). Pagination is
 * computed by hand — chunkItems() below — rather than relying on react-pdf's
 * automatic page-splitting, because the company header must repeat on every
 * page while the customer/meta block and the closing totals/signature block
 * must each appear exactly once (page 1 and the last page respectively), and
 * a single global `fixed` position can't express that page-1-only content
 * cleanly. Row heights are estimated from description length so long text
 * wraps onto extra estimated lines instead of being clipped or mid-row split.
 */

const RED = "#d82027";
const INK = "#20252c";
const MUTED = "#616975";
const LINE = "#dde1e6";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42.5; // ~15mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const HEADER_HEIGHT = 66;
const TABLE_HEAD_HEIGHT = 22;
const FOOTER_HEIGHT = 24;
const META_BLOCK_HEIGHT = 132;
const CLOSING_BLOCK_HEIGHT = 200;
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN * 2 - HEADER_HEIGHT - TABLE_HEAD_HEIGHT - FOOTER_HEIGHT;

const styles = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN, paddingHorizontal: MARGIN, fontSize: 9, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", alignItems: "center", borderBottomWidth: 2, borderBottomColor: RED, paddingBottom: 8, marginBottom: 10, height: HEADER_HEIGHT - 10 },
  logo: { width: 99, height: 40, objectFit: "contain", marginRight: 10 },
  companyCol: { flex: 1, paddingRight: 10 },
  companyHeadline: { fontSize: 9.5, fontWeight: 700, marginBottom: 2 },
  companyLine: { fontSize: 8, color: MUTED, marginTop: 1 },
  titleCol: { alignItems: "flex-end" },
  invoiceTitle: { fontSize: 22, fontWeight: 700 },
  invoiceNumber: { fontSize: 9, marginTop: 2 },

  tableHead: { flexDirection: "row", backgroundColor: INK, paddingVertical: 6, marginBottom: 2 },
  th: { color: "#ffffff", fontSize: 8, fontWeight: 700 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 },
  td: { fontSize: 8.5 },
  colNo: { width: "5%" },
  colPart: { width: "20%", paddingRight: 4 },
  colDesc: { width: "30%", paddingRight: 4 },
  colQty: { width: "7%", textAlign: "right" },
  colUnit: { width: "8%", textAlign: "center" },
  colPrice: { width: "15%", textAlign: "right" },
  colAmount: { width: "15%", textAlign: "right" },

  metaBlock: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  customerCol: { width: "58%" },
  label: { fontSize: 7.5, color: MUTED, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 },
  customerName: { fontSize: 11, fontWeight: 700 },
  customerLine: { fontSize: 9, marginTop: 2 },
  metaCol: { width: "38%" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  metaKey: { fontSize: 8.5, color: MUTED },
  metaVal: { fontSize: 8.5, fontWeight: 700, textAlign: "right" },
  ref: { fontSize: 8.5, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 8, marginBottom: 8, lineHeight: 1.5 },

  closing: { marginTop: 4 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsRule: { borderTopWidth: 1, borderTopColor: LINE, marginTop: 2, paddingTop: 5 },
  totalBox: { flexDirection: "row", justifyContent: "space-between", backgroundColor: RED, padding: 8, marginTop: 6 },
  totalLabel: { color: "#ffffff", fontWeight: 700, fontSize: 10 },
  totalValue: { color: "#ffffff", fontWeight: 700, fontSize: 12 },
  terbilang: { fontSize: 8.5, fontStyle: "italic", color: INK, marginTop: 8 },

  paymentRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12 },
  paymentCol: { width: "58%" },
  accountNo: { fontSize: 13, fontWeight: 700, marginTop: 2 },
  paymentNote: { fontSize: 7, color: MUTED, marginTop: 6, lineHeight: 1.4 },
  signCol: { width: "38%" },
  signName: { fontWeight: 700, marginTop: 56, fontSize: 9 },
  signTitle: { fontSize: 8.5, color: MUTED, marginTop: 1 },

  footer: { position: "absolute", bottom: MARGIN - 14, left: MARGIN, right: MARGIN, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
});

function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

function formatDateLong(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

// Rough width-based line estimate so long descriptions/part numbers wrap
// onto extra estimated lines instead of being clipped or splitting a row
// across pages.
function estimateLines(text: string, colWidthPt: number, fontSize: number): number {
  const avgCharWidth = fontSize * 0.52;
  const charsPerLine = Math.max(6, Math.floor((colWidthPt - 6) / avgCharWidth));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

function estimateRowHeight(item: InvoicePdfItem): number {
  const descColWidth = CONTENT_WIDTH * 0.3 - 4;
  const partColWidth = CONTENT_WIDTH * 0.2 - 4;
  const descLines = estimateLines(item.description, descColWidth, 8.5);
  const partLines = item.partNumber ? estimateLines(item.partNumber, partColWidth, 8.5) : 1;
  const lines = Math.max(descLines, partLines, 1);
  return 10 + lines * 10.5; // vertical padding + line height per wrapped line
}

interface Chunk {
  items: InvoicePdfItem[];
  hasMeta: boolean;
  hasClosing: boolean;
}

function chunkItems(items: InvoicePdfItem[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: InvoicePdfItem[] = [];
  let usedHeight = 0;
  let isFirstPage = true;

  const pageBudget = () => USABLE_HEIGHT - (isFirstPage ? META_BLOCK_HEIGHT : 0);

  for (const item of items) {
    const rowHeight = estimateRowHeight(item);
    if (current.length > 0 && usedHeight + rowHeight > pageBudget()) {
      chunks.push({ items: current, hasMeta: isFirstPage, hasClosing: false });
      current = [];
      usedHeight = 0;
      isFirstPage = false;
    }
    current.push(item);
    usedHeight += rowHeight;
  }

  const lastBudget = pageBudget();
  const closingFits = usedHeight + CLOSING_BLOCK_HEIGHT <= lastBudget;
  chunks.push({ items: current, hasMeta: isFirstPage, hasClosing: closingFits });
  if (!closingFits) {
    chunks.push({ items: [], hasMeta: false, hasClosing: true });
  }

  return chunks;
}

export interface InvoicePdfItem {
  lineNumber: number;
  partNumber?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  subtotal: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceDate: string;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  poNumber?: string | null;
  deliveryNumbers?: string[];
  ppnPercent: number;
  totalAmount: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
  pphAmount?: number;
  notes?: string | null;
  company: {
    name: string;
    description?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    phone?: string | null;
    email?: string | null;
    npwp?: string | null;
    bankName?: string | null;
    bankAccount?: string | null;
    logo?: string | null;
    signatoryName?: string | null;
    signatoryTitle?: string | null;
  };
  customer: {
    name: string;
    address?: string | null;
    city?: string | null;
    picName?: string | null;
  };
  items: InvoicePdfItem[];
}

function Header({ data }: { data: InvoicePdfData }) {
  const headline = data.company.description || data.company.name;
  return (
    <View style={styles.header} fixed>
      {data.company.logo ? <Image style={styles.logo} src={data.company.logo} /> : null}
      <View style={styles.companyCol}>
        <Text style={styles.companyHeadline}>{headline.toUpperCase()}</Text>
        {companyDetailLines(data.company).map((line, i) => (
          <Text key={i} style={styles.companyLine}>{line}</Text>
        ))}
      </View>
      <View style={styles.titleCol}>
        <Text style={styles.invoiceTitle}>INVOICE</Text>
        <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
      </View>
    </View>
  );
}

function TableHead() {
  return (
    <View style={styles.tableHead}>
      <Text style={[styles.th, styles.colNo]}>NO</Text>
      <Text style={[styles.th, styles.colPart]}>PART NUMBER</Text>
      <Text style={[styles.th, styles.colDesc]}>URAIAN</Text>
      <Text style={[styles.th, styles.colQty]}>QTY</Text>
      <Text style={[styles.th, styles.colUnit]}>SAT.</Text>
      <Text style={[styles.th, styles.colPrice]}>HARGA</Text>
      <Text style={[styles.th, styles.colAmount]}>JUMLAH</Text>
    </View>
  );
}

function ItemRow({ item }: { item: InvoicePdfItem }) {
  return (
    <View style={styles.tr} wrap={false}>
      <Text style={[styles.td, styles.colNo]}>{item.lineNumber}</Text>
      <Text style={[styles.td, styles.colPart]}>{item.partNumber || "-"}</Text>
      <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
      <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
      <Text style={[styles.td, styles.colUnit]}>{item.unit || "-"}</Text>
      <Text style={[styles.td, styles.colPrice]}>{formatIDR(item.unitPrice)}</Text>
      <Text style={[styles.td, styles.colAmount]}>{formatIDR(item.subtotal)}</Text>
    </View>
  );
}

function MetaBlock({ data }: { data: InvoicePdfData }) {
  const refLines: string[] = [];
  if (data.poNumber) refLines.push(`Referensi PO: ${data.poNumber}`);
  if (data.deliveryNumbers && data.deliveryNumbers.length > 0) refLines.push(`Surat jalan: ${data.deliveryNumbers.join(", ")}`);

  return (
    <View>
      <View style={styles.metaBlock}>
        <View style={styles.customerCol}>
          <Text style={styles.label}>DITAGIHKAN KEPADA</Text>
          <Text style={styles.customerName}>{data.customer.name}</Text>
          {data.customer.picName ? <Text style={styles.customerLine}>PIC: {data.customer.picName}</Text> : null}
          {data.customer.address ? <Text style={styles.customerLine}>{data.customer.address}</Text> : null}
          {data.customer.city ? <Text style={styles.customerLine}>{data.customer.city}</Text> : null}
        </View>
        <View style={styles.metaCol}>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Tanggal invoice</Text>
            <Text style={styles.metaVal}>{formatDateLong(data.invoiceDate)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Termin</Text>
            <Text style={styles.metaVal}>{data.paymentTerms || "-"}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Metode bayar</Text>
            <Text style={styles.metaVal}>{data.paymentMethod || "Transfer bank"}</Text>
          </View>
        </View>
      </View>
      {refLines.length > 0 ? <Text style={styles.ref}>{refLines.join("\n")}</Text> : null}
    </View>
  );
}

function ClosingBlock({ data }: { data: InvoicePdfData }) {
  const balanceDue = data.grandTotal - data.paidAmount;
  const cashPaid = data.paidAmount - (data.pphAmount ?? 0);

  return (
    <View style={styles.closing} wrap={false}>
      <View>
        <View style={styles.totalsRow}>
          <Text>Subtotal</Text>
          <Text>{formatIDR(data.totalAmount)}</Text>
        </View>
        <View style={[styles.totalsRow, styles.totalsRule]}>
          <Text>PPN ({data.ppnPercent}%)</Text>
          <Text>{formatIDR(data.taxAmount)}</Text>
        </View>
        {(data.pphAmount ?? 0) > 0 && (
          <View style={styles.totalsRow}>
            <Text>PPh 23 dipotong</Text>
            <Text>-{formatIDR(data.pphAmount ?? 0)}</Text>
          </View>
        )}
        {cashPaid > 0 && (
          <View style={styles.totalsRow}>
            <Text>Dibayar</Text>
            <Text>-{formatIDR(cashPaid)}</Text>
          </View>
        )}
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>{data.paidAmount > 0 ? "SISA TAGIHAN" : "TOTAL INVOICE"}</Text>
          <Text style={styles.totalValue}>{formatIDR(Math.max(0, balanceDue))}</Text>
        </View>
      </View>
      <Text style={styles.terbilang}>Terbilang: {terbilangRupiah(Math.max(0, balanceDue))}</Text>

      <View style={styles.paymentRow}>
        <View style={styles.paymentCol}>
          {data.company.bankName && data.company.bankAccount ? (
            <>
              <Text style={styles.label}>INFORMASI PEMBAYARAN</Text>
              <Text style={{ fontWeight: 700 }}>Bank {data.company.bankName}</Text>
              <Text style={styles.accountNo}>{data.company.bankAccount}</Text>
              <Text>a.n. {data.company.name}</Text>
              <Text style={styles.paymentNote}>
                Cantumkan nomor invoice pada berita transfer. Mohon kirim bukti transfer untuk pencocokan pembayaran.
                Pembayaran diakui setelah dana efektif diterima.
              </Text>
            </>
          ) : null}
        </View>
        <View style={styles.signCol}>
          <Text>{[data.company.city, formatDateLong(data.invoiceDate)].filter(Boolean).join(", ")}</Text>
          <Text>Hormat kami,</Text>
          {data.company.signatoryName ? (
            <>
              <Text style={styles.signName}>{data.company.signatoryName}</Text>
              {data.company.signatoryTitle ? <Text style={styles.signTitle}>{data.company.signatoryTitle}</Text> : null}
            </>
          ) : null}
        </View>
      </View>
      {data.notes ? <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 12 }}>Catatan: {data.notes}</Text> : null}
    </View>
  );
}

function Footer({ invoiceNumber, pageNumber, totalPages }: { invoiceNumber: string; pageNumber: number; totalPages: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{invoiceNumber}</Text>
      <Text>
        Halaman {pageNumber}/{totalPages}
      </Text>
    </View>
  );
}

export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  const chunks = chunkItems(data.items);

  return (
    <Document>
      {chunks.map((chunk, i) => (
        <Page key={i} size="A4" style={styles.page}>
          <Header data={data} />
          {chunk.items.length > 0 ? (
            <>
              {chunk.hasMeta ? <MetaBlock data={data} /> : null}
              <TableHead />
              {chunk.items.map((item) => (
                <ItemRow key={item.lineNumber} item={item} />
              ))}
            </>
          ) : null}
          {chunk.hasClosing ? <ClosingBlock data={data} /> : null}
          <Footer invoiceNumber={data.invoiceNumber} pageNumber={i + 1} totalPages={chunks.length} />
        </Page>
      ))}
    </Document>
  );
}
