import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { terbilangRupiah } from "./terbilang";
import { companyDetailLines } from "./company-pdf";

/**
 * MDA purchase-order layout (see Prompt-Master-Template-ERP-Claude.md §4
 * Purchase Order). Same manual-pagination approach as invoice/quotation.
 * The locked source PDF names two internal approvers (Procurement,
 * Direktur) as example data only — this system has one generic
 * Owner/Admin approval tier (see components/approval-panel.tsx), so the
 * "Diperiksa/Disetujui" blocks are filled from the real approval record
 * when one exists and left blank otherwise, never with fabricated names.
 */

const RED = "#c62828";
const INK = "#20252c";
const MUTED = "#616975";
const LINE = "#dddddd";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42.5; // ~15mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const HEADER_HEIGHT = 70;
const TABLE_HEAD_HEIGHT = 22;
const FOOTER_HEIGHT = 24;
const META_BLOCK_HEIGHT = 130;
const CLOSING_BLOCK_HEIGHT = 260;
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN * 2 - HEADER_HEIGHT - TABLE_HEAD_HEIGHT - FOOTER_HEIGHT;

const styles = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN, paddingHorizontal: MARGIN, fontSize: 9, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", alignItems: "center", borderBottomWidth: 2, borderBottomColor: RED, paddingBottom: 8, marginBottom: 10, height: HEADER_HEIGHT - 10 },
  logo: { width: 99, height: 40, objectFit: "contain", marginRight: 10 },
  companyCol: { flex: 1, paddingRight: 10 },
  companyLine: { fontSize: 8, color: MUTED, marginTop: 1 },
  titleCol: { alignItems: "flex-end" },
  poTitle: { fontSize: 20, fontWeight: 700, color: RED },
  poNumber: { fontSize: 9, marginTop: 2 },

  metaGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, fontSize: 9 },
  metaCol: { width: "31%" },
  metaLabel: { fontWeight: 700, marginBottom: 2 },

  partiesRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  vendorCol: { width: "58%" },
  shipCol: { width: "38%" },
  label: { fontSize: 7.5, color: RED, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 },
  partyName: { fontSize: 10.5, fontWeight: 700 },
  partyLine: { fontSize: 9, marginTop: 2 },

  tableHead: { flexDirection: "row", backgroundColor: RED, paddingVertical: 6, marginBottom: 2 },
  th: { color: "#ffffff", fontSize: 8, fontWeight: 700 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 6 },
  td: { fontSize: 8.5 },
  colNo: { width: "5%" },
  colDesc: { width: "30%", paddingRight: 4 },
  colBrand: { width: "12%", paddingRight: 4 },
  colQty: { width: "7%", textAlign: "right" },
  colUnit: { width: "6%", textAlign: "center" },
  colPrice: { width: "18%", textAlign: "right" },
  colAmount: { width: "22%", textAlign: "right" },

  closing: { marginTop: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  notesCol: { width: "56%", fontSize: 9, lineHeight: 1.5 },
  totalsCol: { width: "40%" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalBox: { flexDirection: "row", justifyContent: "space-between", backgroundColor: RED, padding: 8, marginTop: 4 },
  totalLabel: { color: "#ffffff", fontWeight: 700, fontSize: 9.5 },
  totalValue: { color: "#ffffff", fontWeight: 700, fontSize: 11 },
  terbilang: { fontSize: 8.5, lineHeight: 1.5, marginTop: 6 },

  signs: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12, marginTop: 16 },
  signCol: { width: "31%", fontSize: 9, lineHeight: 1.5 },
  signSpace: { height: 77 }, // ~27mm

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

function estimateRowHeight(item: PoPdfItem): number {
  const descColWidth = CONTENT_WIDTH * 0.3 - 4;
  const lines = estimateLines(item.description, descColWidth, 8.5);
  return 12 + lines * 10.5;
}

interface Chunk {
  items: PoPdfItem[];
  hasMeta: boolean;
  hasClosing: boolean;
}

function chunkItems(items: PoPdfItem[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: PoPdfItem[] = [];
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

export interface PoPdfItem {
  lineNumber: number;
  description: string;
  brand?: string | null;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  subtotal: number;
  notes?: string | null;
}

export interface PoPdfData {
  poNumber: string;
  revisionNumber: number;
  poDate: string;
  deliveryDate?: string | null;
  paymentTerms?: string | null;
  currency: string;
  ppnPercent: number;
  pphPercent: number;
  shipToAddress?: string | null;
  notes?: string | null;
  sourcePrNumber?: string | null;
  company: {
    name: string;
    description?: string | null;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
    logo?: string | null;
  };
  supplier: {
    name: string;
    address?: string | null;
    city?: string | null;
    pic?: string | null;
  };
  reviewedByName?: string | null; // Purchasing tier
  approvedByName?: string | null; // Owner/Direktur tier
  items: PoPdfItem[];
}

function Header({ data }: { data: PoPdfData }) {
  const headline = data.company.description || data.company.name;
  return (
    <View style={styles.header} fixed>
      {data.company.logo ? <Image style={styles.logo} src={data.company.logo} /> : null}
      <View style={styles.companyCol}>
        <Text style={{ fontWeight: 700, fontSize: 10.5, marginBottom: 2 }}>{data.company.name}</Text>
        {data.company.address ? <Text style={styles.companyLine}>{data.company.address}</Text> : null}
        {[data.company.city, data.company.province].filter(Boolean).join(", ") ? (
          <Text style={styles.companyLine}>{[data.company.city, data.company.province].filter(Boolean).join(", ")}{data.company.postalCode ? ` ${data.company.postalCode}` : ""}</Text>
        ) : null}
      </View>
      <View style={styles.titleCol}>
        <Text style={styles.poTitle}>PURCHASE ORDER</Text>
        <Text style={styles.poNumber}>{data.poNumber}{data.revisionNumber > 1 ? ` — Rev. ${data.revisionNumber}` : ""}</Text>
      </View>
    </View>
  );
}

function MetaBlock({ data }: { data: PoPdfData }) {
  return (
    <View>
      <View style={styles.metaGrid}>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>Tanggal PO</Text>
          <Text>{formatDateLong(data.poDate)}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>Termin pembayaran</Text>
          <Text>{data.paymentTerms || "-"}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.metaLabel}>Mata uang</Text>
          <Text>{data.currency}</Text>
        </View>
      </View>
      <View style={styles.partiesRow}>
        <View style={styles.vendorCol}>
          <Text style={styles.label}>VENDOR</Text>
          <Text style={styles.partyName}>{data.supplier.name}</Text>
          {data.supplier.address ? <Text style={styles.partyLine}>{data.supplier.address}</Text> : null}
          {data.supplier.city ? <Text style={styles.partyLine}>{data.supplier.city}</Text> : null}
          {data.supplier.pic ? <Text style={styles.partyLine}>PIC: {data.supplier.pic}</Text> : null}
        </View>
        <View style={styles.shipCol}>
          <Text style={styles.label}>ALAMAT PENGIRIMAN</Text>
          <Text style={styles.partyLine}>{data.company.name}</Text>
          <Text style={styles.partyLine}>{data.shipToAddress || data.company.address}</Text>
        </View>
      </View>
    </View>
  );
}

function TableHead() {
  return (
    <View style={styles.tableHead}>
      <Text style={[styles.th, styles.colNo]}>NO</Text>
      <Text style={[styles.th, styles.colDesc]}>URAIAN BARANG</Text>
      <Text style={[styles.th, styles.colBrand]}>MEREK</Text>
      <Text style={[styles.th, styles.colQty]}>QTY</Text>
      <Text style={[styles.th, styles.colUnit]}>SAT.</Text>
      <Text style={[styles.th, styles.colPrice]}>HARGA (RP)</Text>
      <Text style={[styles.th, styles.colAmount]}>JUMLAH (RP)</Text>
    </View>
  );
}

function ItemRow({ item }: { item: PoPdfItem }) {
  return (
    <View style={styles.tr} wrap={false}>
      <Text style={[styles.td, styles.colNo]}>{item.lineNumber}</Text>
      <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
      <Text style={[styles.td, styles.colBrand]}>{item.brand || "-"}</Text>
      <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
      <Text style={[styles.td, styles.colUnit]}>{item.unit || "-"}</Text>
      <Text style={[styles.td, styles.colPrice]}>{formatIDR(item.unitPrice)}</Text>
      <Text style={[styles.td, styles.colAmount]}>{formatIDR(item.subtotal)}</Text>
    </View>
  );
}

function ClosingBlock({ data }: { data: PoPdfData }) {
  const subtotal = data.items.reduce((s, i) => s + i.subtotal, 0);
  const ppnAmount = Math.round((subtotal * data.ppnPercent) / 100);
  const pphAmount = Math.round((subtotal * data.pphPercent) / 100);
  const total = subtotal + ppnAmount; // PPh is informational only — never subtracted from the PO total

  return (
    <View style={styles.closing} wrap={false}>
      <View style={styles.summaryRow}>
        <View style={styles.notesCol}>
          <Text style={styles.label}>KELENGKAPAN DOKUMEN PENAGIHAN</Text>
          <Text>1. Melampirkan invoice asli dilengkapi dengan meterai.</Text>
          <Text>2. Surat jalan asli.</Text>
          <Text>3. PO yang sudah ditandatangani.</Text>
          <Text>4. Faktur pajak sesuai tanggal invoice.</Text>
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
          <View style={styles.totalsRow}>
            <Text>PPh ({data.pphPercent}%)</Text>
            <Text>{data.pphPercent > 0 ? `-${formatIDR(pphAmount)}*` : "-"}</Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TOTAL PO</Text>
            <Text style={styles.totalValue}>{formatIDR(total)}</Text>
          </View>
        </View>
      </View>
      {data.pphPercent > 0 ? (
        <Text style={{ fontSize: 7, color: MUTED, marginBottom: 4 }}>* PPh informasional, dipotong vendor saat penagihan — tidak mengurangi Total PO.</Text>
      ) : null}

      <Text style={styles.terbilang}>
        <Text style={{ fontWeight: 700 }}>Terbilang total PO: </Text>
        {terbilangRupiah(total)}
      </Text>

      <View style={styles.signs}>
        <View style={styles.signCol}>
          <Text style={styles.label}>DISETUJUI VENDOR</Text>
          <Text>{data.supplier.name}</Text>
          <View style={styles.signSpace} />
          <Text>Nama:</Text>
          <Text>Jabatan:</Text>
          <Text>Tanggal:</Text>
        </View>
        <View style={styles.signCol}>
          <Text style={styles.label}>DIPERIKSA OLEH</Text>
          <Text>{data.company.name}</Text>
          <View style={styles.signSpace} />
          {data.reviewedByName ? (
            <>
              <Text style={{ fontWeight: 700 }}>{data.reviewedByName}</Text>
              <Text>Purchasing</Text>
            </>
          ) : (
            <Text>Nama:</Text>
          )}
          <Text>Tanggal:</Text>
        </View>
        <View style={styles.signCol}>
          <Text style={styles.label}>DISETUJUI OLEH</Text>
          <Text>{data.company.name}</Text>
          <View style={styles.signSpace} />
          {data.approvedByName ? (
            <>
              <Text style={{ fontWeight: 700 }}>{data.approvedByName}</Text>
              <Text>Owner</Text>
            </>
          ) : (
            <Text>Nama:</Text>
          )}
          <Text>Tanggal:</Text>
        </View>
      </View>
      {data.notes ? <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 10 }}>Catatan: {data.notes}</Text> : null}
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

export function PoPdfDocument({ data }: { data: PoPdfData }) {
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
          <Footer number={data.poNumber} pageNumber={i + 1} totalPages={chunks.length} />
        </Page>
      ))}
    </Document>
  );
}
