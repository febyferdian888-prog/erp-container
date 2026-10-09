import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { terbilangRupiah } from "./terbilang";
import { companyDetailLines } from "./company-pdf";

/**
 * MDA quotation layout (see Panduan-Claude-Quotation-MDA.md). Same manual
 * pagination approach as lib/invoice-pdf.tsx and for the same reason: the
 * company header must repeat every page while the customer/meta block and
 * the closing (totals/terbilang/signatures) block each appear exactly once.
 * Red accent #C62828 per the locked design, distinct from invoice's red
 * #d82027 — both come from the same logo but the two source files specify
 * slightly different hex values and neither told us to reconcile them.
 */

const RED = "#c62828";
const INK = "#20252c";
const MUTED = "#616975";
const LINE = "#e4dede";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42.5; // ~15mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const HEADER_HEIGHT = 66;
const TABLE_HEAD_HEIGHT = 22;
const FOOTER_HEIGHT = 24;
const META_BLOCK_HEIGHT = 118;
const CLOSING_BLOCK_HEIGHT = 260;
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN * 2 - HEADER_HEIGHT - TABLE_HEAD_HEIGHT - FOOTER_HEIGHT;

const styles = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN, paddingHorizontal: MARGIN, fontSize: 9, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", alignItems: "center", borderBottomWidth: 2, borderBottomColor: RED, paddingBottom: 8, marginBottom: 10, height: HEADER_HEIGHT - 10 },
  logo: { width: 99, height: 40, objectFit: "contain", marginRight: 10 },
  companyCol: { flex: 1, paddingRight: 10 },
  companyHeadline: { fontSize: 9.5, fontWeight: 700, marginBottom: 2 },
  companyLine: { fontSize: 8, color: MUTED, marginTop: 1 },
  titleCol: { alignItems: "flex-end" },
  quotationTitle: { fontSize: 22, fontWeight: 700, color: RED },
  quotationNumber: { fontSize: 9, marginTop: 2 },

  tableHead: { flexDirection: "row", backgroundColor: RED, paddingVertical: 6, marginBottom: 2 },
  th: { color: "#ffffff", fontSize: 8, fontWeight: 700 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 },
  td: { fontSize: 8.5 },
  colNo: { width: "5%" },
  colPartOrItem: { width: "16%", paddingRight: 4 },
  colDescOrSpec: { width: "36%", paddingRight: 4 },
  colQty: { width: "5%", textAlign: "right" },
  colUnit: { width: "6%", textAlign: "center" },
  colPrice: { width: "15%", textAlign: "right" },
  colAmount: { width: "17%", textAlign: "right" },
  itemName: { fontWeight: 700, marginBottom: 1 },

  metaBlock: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  customerCol: { width: "58%" },
  label: { fontSize: 7.5, color: RED, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 },
  customerName: { fontSize: 11, fontWeight: 700 },
  customerLine: { fontSize: 9, marginTop: 2 },
  metaCol: { width: "38%", fontSize: 9, lineHeight: 1.6 },

  closing: { marginTop: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  notesCol: { width: "56%", fontSize: 9, lineHeight: 1.5 },
  totalsCol: { width: "40%" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalBox: { flexDirection: "row", justifyContent: "space-between", backgroundColor: RED, padding: 8, marginTop: 4 },
  totalLabel: { color: "#ffffff", fontWeight: 700, fontSize: 9.5 },
  totalValue: { color: "#ffffff", fontWeight: 700, fontSize: 11 },
  terbilang: { fontSize: 8.5, lineHeight: 1.5, marginTop: 6 },
  thanks: { fontSize: 8.5, lineHeight: 1.5, marginTop: 6 },

  signRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12, marginTop: 14 },
  signCol: { width: "46%" },
  signSpace: { height: 77 }, // ~27mm
  recipientBlock: { width: "80%" },
  recipientLine: { borderTopWidth: 1, borderTopColor: INK, marginTop: 14, marginBottom: 3 },
  recipientCaption: { fontSize: 8, color: MUTED },
  proposerLine: { fontSize: 9, lineHeight: 1.5 },

  footer: { position: "absolute", bottom: MARGIN - 14, left: MARGIN, right: MARGIN, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
});

function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

function formatDateLong(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function estimateLines(text: string, colWidthPt: number, fontSize: number): number {
  const avgCharWidth = fontSize * 0.52;
  const charsPerLine = Math.max(6, Math.floor((colWidthPt - 6) / avgCharWidth));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

function estimateRowHeight(item: QuotationPdfItem): number {
  const specColWidth = CONTENT_WIDTH * 0.36 - 4;
  const specText = item.specification || item.description;
  // Multi-line specification: count each source line separately (it wraps
  // as its own <Text>, one per line, matching the template's <br/> list).
  const specLines = specText
    .split("\n")
    .reduce((sum, line) => sum + estimateLines(line || " ", specColWidth, 8.5), 0);
  return 10 + Math.max(specLines, 1) * 10.5;
}

interface Chunk {
  items: QuotationPdfItem[];
  hasMeta: boolean;
  hasClosing: boolean;
}

function chunkItems(items: QuotationPdfItem[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: QuotationPdfItem[] = [];
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
  if (!closingFits) chunks.push({ items: [], hasMeta: false, hasClosing: true });
  return chunks;
}

export interface QuotationPdfItem {
  lineNumber: number;
  partNumber?: string | null;
  description: string;
  specification?: string | null;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  subtotal: number;
  notes?: string | null;
}

export interface QuotationPdfData {
  number: string;
  quotationDate: string;
  paymentTerms?: string | null;
  validityDays: number;
  ppnPercent: number;
  pphPercent: number;
  pic?: string | null;
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
    logo?: string | null;
    signatoryName?: string | null;
    signatoryTitle?: string | null;
  };
  customer: {
    name: string;
    address?: string | null;
    city?: string | null;
  };
  items: QuotationPdfItem[];
}

function Header({ data }: { data: QuotationPdfData }) {
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
        <Text style={styles.quotationTitle}>QUOTATION</Text>
        <Text style={styles.quotationNumber}>{data.number}</Text>
      </View>
    </View>
  );
}

function fabricationMode(items: QuotationPdfItem[]) {
  return items.some((i) => !!i.specification);
}

function TableHead({ fab }: { fab: boolean }) {
  return (
    <View style={styles.tableHead}>
      <Text style={[styles.th, styles.colNo]}>NO</Text>
      <Text style={[styles.th, styles.colPartOrItem]}>{fab ? "BARANG/JASA" : "PART NUMBER"}</Text>
      <Text style={[styles.th, styles.colDescOrSpec]}>{fab ? "SPESIFIKASI" : "URAIAN"}</Text>
      <Text style={[styles.th, styles.colQty]}>QTY</Text>
      <Text style={[styles.th, styles.colUnit]}>SAT.</Text>
      <Text style={[styles.th, styles.colPrice]}>HARGA (RP)</Text>
      <Text style={[styles.th, styles.colAmount]}>JUMLAH (RP)</Text>
    </View>
  );
}

function ItemRow({ item, fab }: { item: QuotationPdfItem; fab: boolean }) {
  return (
    <View style={styles.tr} wrap={false}>
      <Text style={[styles.td, styles.colNo]}>{item.lineNumber}</Text>
      <Text style={[styles.td, styles.colPartOrItem]}>{fab ? item.description : item.partNumber || "-"}</Text>
      <View style={[styles.colDescOrSpec]}>
        {fab ? (
          (item.specification || "").split("\n").map((line, i) => (
            <Text key={i} style={styles.td}>{line}</Text>
          ))
        ) : (
          <Text style={styles.td}>{item.description}</Text>
        )}
        {item.notes ? <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 2 }}>{item.notes}</Text> : null}
      </View>
      <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
      <Text style={[styles.td, styles.colUnit]}>{item.unit || "-"}</Text>
      <Text style={[styles.td, styles.colPrice]}>{formatIDR(item.unitPrice)}</Text>
      <Text style={[styles.td, styles.colAmount]}>{formatIDR(item.subtotal)}</Text>
    </View>
  );
}

function MetaBlock({ data }: { data: QuotationPdfData }) {
  return (
    <View style={styles.metaBlock}>
      <View style={styles.customerCol}>
        <Text style={styles.label}>DITAWARKAN KEPADA</Text>
        <Text style={styles.customerName}>{data.customer.name}</Text>
        {data.pic ? <Text style={styles.customerLine}>PIC: {data.pic}</Text> : null}
        {data.customer.address ? <Text style={styles.customerLine}>{data.customer.address}</Text> : null}
        {data.customer.city ? <Text style={styles.customerLine}>{data.customer.city}</Text> : null}
      </View>
      <View style={styles.metaCol}>
        <Text>Tanggal: <Text style={{ fontWeight: 700 }}>{formatDateLong(data.quotationDate)}</Text></Text>
        <Text>Pembayaran: <Text style={{ fontWeight: 700 }}>{data.paymentTerms || "-"}</Text></Text>
        <Text>Masa berlaku: <Text style={{ fontWeight: 700 }}>{data.validityDays} hari</Text></Text>
      </View>
    </View>
  );
}

function ClosingBlock({ data }: { data: QuotationPdfData }) {
  const subtotal = data.items.reduce((s, i) => s + i.subtotal, 0);
  const ppnAmount = Math.round((subtotal * data.ppnPercent) / 100);
  const pphAmount = Math.round((subtotal * data.pphPercent) / 100);
  const total = subtotal + ppnAmount - pphAmount;

  return (
    <View style={styles.closing} wrap={false}>
      <View style={styles.summaryRow}>
        <View style={styles.notesCol}>
          {data.notes ? (
            <>
              <Text style={styles.label}>SYARAT & CATATAN PENAWARAN</Text>
              <Text>{data.notes}</Text>
            </>
          ) : null}
        </View>
        <View style={styles.totalsCol}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{formatIDR(subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>PPN ({data.ppnPercent}%)</Text>
            <Text>{formatIDR(ppnAmount)}</Text>
          </View>
          {data.pphPercent > 0 && (
            <View style={styles.totalsRow}>
              <Text>PPh ({data.pphPercent}%)</Text>
              <Text>-{formatIDR(pphAmount)}</Text>
            </View>
          )}
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TOTAL PENAWARAN</Text>
            <Text style={styles.totalValue}>{formatIDR(total)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.terbilang}>
        <Text style={{ fontWeight: 700 }}>Terbilang: </Text>
        {terbilangRupiah(total)}
      </Text>
      <Text style={styles.thanks}>
        Terima kasih atas perhatian dan kerja samanya. Kami menantikan kesempatan bekerja sama dengan perusahaan Anda.
      </Text>

      <View style={styles.signRow}>
        <View style={styles.signCol}>
          <Text style={styles.label}>DISETUJUI OLEH</Text>
          <View style={styles.signSpace} />
          <View style={styles.recipientBlock}>
            <Text style={styles.recipientCaption}>Nama</Text>
            <View style={styles.recipientLine} />
            <Text style={styles.recipientCaption}>Jabatan</Text>
            <Text style={{ marginTop: 8, fontSize: 9 }}>Tanggal:</Text>
          </View>
        </View>
        <View style={styles.signCol}>
          <Text style={styles.label}>DIAJUKAN OLEH</Text>
          <View style={styles.signSpace} />
          {data.company.signatoryName ? (
            <Text style={styles.proposerLine}>
              <Text style={{ fontWeight: 700 }}>{data.company.signatoryName}</Text>
              {data.company.signatoryTitle ? `\n${data.company.signatoryTitle}` : ""}
              {`\n${data.company.name}`}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Footer({ number, pageNumber, totalPages }: { number: string; pageNumber: number; totalPages: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{number}</Text>
      <Text>Halaman {pageNumber}/{totalPages}</Text>
    </View>
  );
}

export function QuotationPdfDocument({ data }: { data: QuotationPdfData }) {
  const chunks = chunkItems(data.items);
  const fab = fabricationMode(data.items);

  return (
    <Document>
      {chunks.map((chunk, i) => (
        <Page key={i} size="A4" style={styles.page}>
          <Header data={data} />
          {chunk.items.length > 0 ? (
            <>
              {chunk.hasMeta ? <MetaBlock data={data} /> : null}
              <TableHead fab={fab} />
              {chunk.items.map((item) => (
                <ItemRow key={item.lineNumber} item={item} fab={fab} />
              ))}
            </>
          ) : null}
          {chunk.hasClosing ? <ClosingBlock data={data} /> : null}
          <Footer number={data.number} pageNumber={i + 1} totalPages={chunks.length} />
        </Page>
      ))}
    </Document>
  );
}
