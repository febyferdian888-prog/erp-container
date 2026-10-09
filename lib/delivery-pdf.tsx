import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

/**
 * MDA surat jalan layout (see Panduan-Claude-Surat-Jalan-MDA.md): A4
 * portrait, monochrome (no color, no shaded table header — plain ruled
 * borders per the locked design), three signature blocks. Manual pagination
 * for the same reason as invoice/quotation: header/table-head repeat every
 * page, closing block (item count, notes, signatures) appears once at the end.
 */

const INK = "#000000";
const MUTED = "#3f3f3f";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42.5; // ~15mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const HEADER_HEIGHT = 66;
const TABLE_HEAD_HEIGHT = 20;
const FOOTER_HEIGHT = 22;
const META_BLOCK_HEIGHT = 96;
const CLOSING_BLOCK_HEIGHT = 260;
const CONTINUATION_NOTE_HEIGHT = 14;
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN * 2 - HEADER_HEIGHT - TABLE_HEAD_HEIGHT - FOOTER_HEIGHT;

const styles = StyleSheet.create({
  page: { paddingTop: MARGIN, paddingBottom: MARGIN, paddingHorizontal: MARGIN, fontSize: 9, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 8, marginBottom: 10, height: HEADER_HEIGHT - 10 },
  companyCol: { flex: 1, paddingRight: 10 },
  companyName: { fontSize: 10.5, fontWeight: 700, marginBottom: 2 },
  companyLine: { fontSize: 8.5, marginTop: 1 },
  titleCol: { alignItems: "flex-end" },
  docTitle: { fontSize: 20, fontWeight: 700 },
  docMeta: { fontSize: 9, marginTop: 2 },

  tableHead: { flexDirection: "row", borderWidth: 1, borderColor: INK, borderBottomWidth: 0 },
  th: { fontSize: 8.5, fontWeight: 700, padding: 5, borderRightWidth: 1, borderRightColor: INK },
  tr: { flexDirection: "row", borderWidth: 1, borderColor: INK, borderTopWidth: 0 },
  td: { fontSize: 9, padding: 5, borderRightWidth: 1, borderRightColor: INK },
  colNo: { width: "5%" },
  colPart: { width: "20%" },
  colDesc: { width: "35%" },
  colQty: { width: "10%", textAlign: "right" },
  colUnit: { width: "10%", textAlign: "center" },
  colRemark: { width: "20%", borderRightWidth: 0 },

  metaBlock: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  customerCol: { width: "56%" },
  label: { fontSize: 8.5, fontWeight: 700, marginBottom: 3 },
  customerName: { fontSize: 10.5, fontWeight: 700 },
  customerLine: { fontSize: 9, marginTop: 2 },
  fieldsCol: { width: "40%", fontSize: 9, lineHeight: 1.9 },

  continuationNote: { fontSize: 8, color: MUTED, marginTop: 4, textAlign: "right" },

  closing: { marginTop: 8 },
  count: { fontSize: 9.5, fontWeight: 700, marginBottom: 8 },
  notesBox: { flexDirection: "row", borderWidth: 1, borderColor: INK, fontSize: 9, lineHeight: 1.5 },
  notesCol: { width: "60%", padding: 8, borderRightWidth: 1, borderRightColor: INK },
  cautionCol: { width: "40%", padding: 8 },
  blankLine: { borderBottomWidth: 1, borderBottomColor: INK, height: 14, marginTop: 8 },

  receipt: { fontSize: 8.5, lineHeight: 1.4, marginTop: 10, marginBottom: 4 },
  signs: { flexDirection: "row", justifyContent: "space-between" },
  signCol: { width: "31%" },
  signSpace: { height: 65 }, // ~23mm
  signCaption: { fontSize: 9, lineHeight: 1.5 },

  footer: { position: "absolute", bottom: MARGIN - 14, left: MARGIN, right: MARGIN, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED, borderTopWidth: 1, borderTopColor: INK, paddingTop: 6 },
});

function formatDateLong(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function estimateLines(text: string, colWidthPt: number, fontSize: number): number {
  const avgCharWidth = fontSize * 0.52;
  const charsPerLine = Math.max(6, Math.floor((colWidthPt - 6) / avgCharWidth));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

function estimateRowHeight(item: DeliveryPdfItem): number {
  const descColWidth = CONTENT_WIDTH * 0.35 - 10;
  const lines = estimateLines(item.description, descColWidth, 9);
  return 10 + lines * 11;
}

interface Chunk {
  items: DeliveryPdfItem[];
  hasMeta: boolean;
  hasClosing: boolean;
  isLast: boolean;
}

function chunkItems(items: DeliveryPdfItem[]): Chunk[] {
  const raw: { items: DeliveryPdfItem[]; hasMeta: boolean; hasClosing: boolean }[] = [];
  let current: DeliveryPdfItem[] = [];
  let usedHeight = 0;
  let isFirstPage = true;
  const pageBudget = () => USABLE_HEIGHT - (isFirstPage ? META_BLOCK_HEIGHT : 0) - CONTINUATION_NOTE_HEIGHT;

  for (const item of items) {
    const rowHeight = estimateRowHeight(item);
    if (current.length > 0 && usedHeight + rowHeight > pageBudget()) {
      raw.push({ items: current, hasMeta: isFirstPage, hasClosing: false });
      current = [];
      usedHeight = 0;
      isFirstPage = false;
    }
    current.push(item);
    usedHeight += rowHeight;
  }

  const lastBudget = pageBudget();
  const closingFits = usedHeight + CLOSING_BLOCK_HEIGHT <= lastBudget;
  raw.push({ items: current, hasMeta: isFirstPage, hasClosing: closingFits });
  if (!closingFits) raw.push({ items: [], hasMeta: false, hasClosing: true });

  return raw.map((c, i) => ({ ...c, isLast: i === raw.length - 1 }));
}

export interface DeliveryPdfItem {
  lineNumber: number;
  partNumber?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
}

export interface DeliveryPdfData {
  deliveryNumber: string;
  deliveryDate: string;
  poReference?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  shippingAddress?: string | null;
  shipmentByName?: string | null;
  acknowledgedByName?: string | null;
  receivedByName?: string | null;
  notes?: string | null;
  company: {
    name: string;
    address?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
  };
  customer: { name: string; address?: string | null; city?: string | null };
  items: DeliveryPdfItem[];
}

function Header({ data }: { data: DeliveryPdfData }) {
  const locality = [data.company.city, data.company.province].filter(Boolean).join(", ") + (data.company.postalCode ? ` ${data.company.postalCode}` : "");
  return (
    <View style={styles.header} fixed>
      <View style={styles.companyCol}>
        <Text style={styles.companyName}>{data.company.name}</Text>
        {data.company.address ? <Text style={styles.companyLine}>{data.company.address}</Text> : null}
        {locality.trim() ? <Text style={styles.companyLine}>{locality.trim()}</Text> : null}
      </View>
      <View style={styles.titleCol}>
        <Text style={styles.docTitle}>SURAT JALAN</Text>
        <Text style={styles.docMeta}>{data.deliveryNumber}</Text>
        <Text style={styles.docMeta}>{formatDateLong(data.deliveryDate)}</Text>
      </View>
    </View>
  );
}

function TableHead() {
  return (
    <View style={styles.tableHead}>
      <Text style={[styles.th, styles.colNo]}>No.</Text>
      <Text style={[styles.th, styles.colPart]}>Part Number</Text>
      <Text style={[styles.th, styles.colDesc]}>Uraian Barang</Text>
      <Text style={[styles.th, styles.colQty]}>Qty</Text>
      <Text style={[styles.th, styles.colUnit]}>Sat.</Text>
      <Text style={[styles.th, styles.colRemark]}>Remark</Text>
    </View>
  );
}

function ItemRow({ item }: { item: DeliveryPdfItem }) {
  return (
    <View style={styles.tr} wrap={false}>
      <Text style={[styles.td, styles.colNo]}>{item.lineNumber}</Text>
      <Text style={[styles.td, styles.colPart]}>{item.partNumber || "-"}</Text>
      <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
      <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
      <Text style={[styles.td, styles.colUnit]}>{item.unit || "-"}</Text>
      <Text style={[styles.td, styles.colRemark]}>{item.notes || ""}</Text>
    </View>
  );
}

function MetaBlock({ data }: { data: DeliveryPdfData }) {
  return (
    <View style={styles.metaBlock}>
      <View style={styles.customerCol}>
        <Text style={styles.label}>DIKIRIM KEPADA</Text>
        <Text style={styles.customerName}>{data.customer.name}</Text>
        <Text style={styles.customerLine}>{data.shippingAddress || data.customer.address}</Text>
        {!data.shippingAddress && data.customer.city ? <Text style={styles.customerLine}>{data.customer.city}</Text> : null}
      </View>
      <View style={styles.fieldsCol}>
        <Text>No. PO / referensi: {data.poReference || "-"}</Text>
        <Text>No. kendaraan: {data.vehicleNumber || "-"}</Text>
        <Text>Nama sopir: {data.driverName || "-"}</Text>
      </View>
    </View>
  );
}

// Unit-aware line count: "Jumlah baris barang" per the panduan is distinct
// from summed quantity, and different units are never added together.
function lineCountByUnit(items: DeliveryPdfItem[]): string {
  const byUnit = new Map<string, number>();
  for (const item of items) {
    const unit = item.unit || "-";
    byUnit.set(unit, (byUnit.get(unit) || 0) + 1);
  }
  return Array.from(byUnit.entries()).map(([unit, count]) => `${count} baris (${unit})`).join(", ");
}

function ClosingBlock({ data }: { data: DeliveryPdfData }) {
  return (
    <View style={styles.closing} wrap={false}>
      <Text style={styles.count}>Jumlah baris barang: {data.items.length} — {lineCountByUnit(data.items)}</Text>
      <View style={styles.notesBox}>
        <View style={styles.notesCol}>
          <Text style={{ fontWeight: 700 }}>CATATAN PENGIRIMAN / SELISIH / KONDISI</Text>
          <View style={styles.blankLine} />
          <View style={styles.blankLine} />
        </View>
        <View style={styles.cautionCol}>
          <Text style={{ fontWeight: 700 }}>PERHATIAN</Text>
          <Text>1. Surat jalan adalah bukti pengiriman barang.</Text>
          <Text>2. Surat jalan bukan bukti penjualan.</Text>
          <Text>3. Invoice diterbitkan terpisah sebagai bukti penjualan.</Text>
        </View>
      </View>
      <Text style={styles.receipt}>
        Penerimaan dikonfirmasi sesuai jumlah dan kondisi aktual. Selisih atau kerusakan dicatat pada kolom catatan di atas. Tanda tangan dan cap perusahaan penerima:
      </Text>
      <View style={styles.signs}>
        <View style={styles.signCol}>
          <Text style={{ fontWeight: 700, fontSize: 9 }}>Penerima / Pembeli</Text>
          <View style={styles.signSpace} />
          <Text style={styles.signCaption}>Nama: {data.receivedByName || "..............................."}</Text>
          <Text style={styles.signCaption}>Tanggal:</Text>
        </View>
        <View style={styles.signCol}>
          <Text style={{ fontWeight: 700, fontSize: 9 }}>Bagian Pengiriman</Text>
          <View style={styles.signSpace} />
          {data.shipmentByName ? <Text style={[styles.signCaption, { fontWeight: 700 }]}>{data.shipmentByName}</Text> : null}
          <Text style={styles.signCaption}>Tanggal:</Text>
        </View>
        <View style={styles.signCol}>
          <Text style={{ fontWeight: 700, fontSize: 9 }}>Mengetahui</Text>
          <View style={styles.signSpace} />
          {data.acknowledgedByName ? <Text style={[styles.signCaption, { fontWeight: 700 }]}>{data.acknowledgedByName}</Text> : null}
          <Text style={styles.signCaption}>Tanggal:</Text>
        </View>
      </View>
    </View>
  );
}

function Footer({ number, pageNumber, totalPages }: { number: string; pageNumber: number; totalPages: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{number}</Text>
      <Text>Halaman {pageNumber} dari {totalPages}</Text>
    </View>
  );
}

export function DeliveryPdfDocument({ data }: { data: DeliveryPdfData }) {
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
              {!chunk.isLast ? <Text style={styles.continuationNote}>bersambung ke halaman berikutnya</Text> : null}
            </>
          ) : null}
          {chunk.hasClosing ? <ClosingBlock data={data} /> : null}
          <Footer number={data.deliveryNumber} pageNumber={i + 1} totalPages={chunks.length} />
        </Page>
      ))}
    </Document>
  );
}
