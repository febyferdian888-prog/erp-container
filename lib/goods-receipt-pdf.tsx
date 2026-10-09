import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { companyDetailLines } from "./company-pdf";

// Functional Berita Acara Penerimaan Barang document — no locked source design
// exists for this document type (unlike invoice/quotation/kwitansi/delivery/PO),
// so this uses a plain, legible A4 layout consistent with the app's other PDFs.
const RED = "#c62828";
const INK = "#20252c";
const MUTED = "#60656d";
const LINE = "#d8d8d8";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", alignItems: "center", borderBottomWidth: 2, borderBottomColor: RED, paddingBottom: 8, marginBottom: 10 },
  logo: { width: 90, height: 36, objectFit: "contain", marginRight: 10 },
  companyCol: { flex: 1 },
  companyLine: { fontSize: 8, color: MUTED, marginTop: 1 },
  title: { fontSize: 16, fontWeight: 700, color: RED, textAlign: "right" },
  number: { fontSize: 10, fontWeight: 700, textAlign: "right", marginTop: 4 },

  metaGrid: { flexDirection: "row", marginTop: 12, marginBottom: 12 },
  metaCol: { flex: 1 },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 90, fontSize: 9, color: MUTED },
  metaValue: { flex: 1, fontSize: 9, fontWeight: 700 },

  table: { marginTop: 6 },
  tHead: { flexDirection: "row", backgroundColor: "#f4f4f5", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 },
  tRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5 },
  cNo: { width: 24, fontSize: 8.5, textAlign: "center" },
  cDesc: { flex: 1, fontSize: 8.5, paddingRight: 4 },
  cQty: { width: 55, fontSize: 8.5, textAlign: "right" },
  cUnit: { width: 40, fontSize: 8.5, textAlign: "center" },
  cCond: { width: 55, fontSize: 8.5, textAlign: "center" },
  cNotes: { width: 100, fontSize: 8.5 },
  thText: { fontSize: 8, fontWeight: 700, color: MUTED, textTransform: "uppercase" },

  badgeGood: { color: "#1b7a3d" },
  badgeDefect: { color: "#c62828" },
  badgePartial: { color: "#b8860b" },

  qcBox: { marginTop: 14, borderWidth: 1, borderColor: LINE, padding: 10 },
  qcTitle: { fontSize: 9, fontWeight: 700, color: MUTED, textTransform: "uppercase", marginBottom: 4 },
  qcText: { fontSize: 9, lineHeight: 1.4 },

  claimBox: { marginTop: 10, borderWidth: 1, borderColor: RED, padding: 10, backgroundColor: "#fff5f5" },
  claimTitle: { fontSize: 9, fontWeight: 700, color: RED, textTransform: "uppercase", marginBottom: 4 },

  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 28 },
  signCol: { width: "30%" },
  signLabel: { fontSize: 8.5, color: MUTED, textTransform: "uppercase", marginBottom: 40 },
  signName: { fontWeight: 700, fontSize: 9.5 },
  signRole: { fontSize: 8.5, color: MUTED },
});

function formatDate(d?: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

const CONDITION_LABEL: Record<string, string> = { good: "Good", defect: "Defect", partial: "Partial" };
const CONDITION_STYLE: Record<string, ReturnType<typeof StyleSheet.create>[string]> = {
  good: styles.badgeGood,
  defect: styles.badgeDefect,
  partial: styles.badgePartial,
};

export interface GoodsReceiptPdfData {
  receiptNumber: string;
  receiptDate: string;
  status: string;
  notes?: string | null;
  inspectedByName?: string | null;
  inspectedAt?: string | null;
  poNumber: string;
  warehouseName?: string | null;
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
  };
  items: Array<{
    description: string;
    quantity: number;
    unit?: string | null;
    condition: string;
    notes?: string | null;
  }>;
  claim?: { claimNumber: string; status: string; reason?: string | null } | null;
}

export function GoodsReceiptPdfDocument({ data }: { data: GoodsReceiptPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {data.company.logo ? <Image style={styles.logo} src={data.company.logo} /> : null}
          <View style={styles.companyCol}>
            <Text style={{ fontWeight: 700, fontSize: 11 }}>{data.company.name}</Text>
            {companyDetailLines(data.company).slice(0, 2).map((line, i) => (
              <Text key={i} style={styles.companyLine}>{line}</Text>
            ))}
          </View>
          <View>
            <Text style={styles.title}>BERITA ACARA PENERIMAAN BARANG</Text>
            <Text style={styles.number}>No. {data.receiptNumber}</Text>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaCol}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Tanggal Terima</Text>
              <Text style={styles.metaValue}>{formatDate(data.receiptDate)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>No. PO</Text>
              <Text style={styles.metaValue}>{data.poNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Gudang</Text>
              <Text style={styles.metaValue}>{data.warehouseName || "-"}</Text>
            </View>
          </View>
          <View style={styles.metaCol}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Vendor</Text>
              <Text style={styles.metaValue}>{data.supplier.name}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Status QC</Text>
              <Text style={styles.metaValue}>{data.status.toUpperCase()}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Diperiksa oleh</Text>
              <Text style={styles.metaValue}>{data.inspectedByName || "-"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tHead}>
            <Text style={[styles.cNo, styles.thText]}>No</Text>
            <Text style={[styles.cDesc, styles.thText]}>Deskripsi</Text>
            <Text style={[styles.cQty, styles.thText]}>Qty Diterima</Text>
            <Text style={[styles.cUnit, styles.thText]}>Satuan</Text>
            <Text style={[styles.cCond, styles.thText]}>Kondisi</Text>
            <Text style={[styles.cNotes, styles.thText]}>Catatan</Text>
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={styles.tRow}>
              <Text style={styles.cNo}>{i + 1}</Text>
              <Text style={styles.cDesc}>{item.description}</Text>
              <Text style={styles.cQty}>{item.quantity.toLocaleString("id-ID")}</Text>
              <Text style={styles.cUnit}>{item.unit || "-"}</Text>
              <Text style={[styles.cCond, CONDITION_STYLE[item.condition] || {}]}>
                {CONDITION_LABEL[item.condition] || item.condition}
              </Text>
              <Text style={styles.cNotes}>{item.notes || "-"}</Text>
            </View>
          ))}
        </View>

        {data.notes ? (
          <View style={styles.qcBox}>
            <Text style={styles.qcTitle}>Catatan Penerimaan</Text>
            <Text style={styles.qcText}>{data.notes}</Text>
          </View>
        ) : null}

        {data.claim ? (
          <View style={styles.claimBox}>
            <Text style={styles.claimTitle}>Klaim Vendor {data.claim.claimNumber} — {data.claim.status.toUpperCase()}</Text>
            <Text style={styles.qcText}>{data.claim.reason || "Ditemukan item dengan kondisi defect/partial pada penerimaan ini."}</Text>
          </View>
        ) : null}

        <View style={styles.signRow}>
          <View style={styles.signCol}>
            <Text style={styles.signLabel}>Diterima oleh</Text>
            <Text style={styles.signRole}>Gudang / Penerima</Text>
          </View>
          <View style={styles.signCol}>
            <Text style={styles.signLabel}>Diperiksa oleh (QC)</Text>
            {data.inspectedByName ? <Text style={styles.signName}>{data.inspectedByName}</Text> : null}
            <Text style={styles.signRole}>QC Inspector</Text>
          </View>
          <View style={styles.signCol}>
            <Text style={styles.signLabel}>Mengetahui</Text>
            <Text style={styles.signRole}>Purchasing</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
