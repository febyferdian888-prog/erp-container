import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { companyDetailLines } from "./company-pdf";
import { terbilangRupiah } from "./terbilang";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1e293b" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  companyName: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  companyTagline: { fontSize: 7, color: "#64748b", marginTop: 2 },
  companyDetail: { fontSize: 7, color: "#64748b", marginTop: 1 },
  quotationTitle: { fontSize: 20, fontWeight: 700, color: "#0f172a", textAlign: "right" },
  infoBox: { marginTop: 8, alignItems: "flex-end" },
  infoRow: { flexDirection: "row", marginBottom: 2 },
  infoLabel: { width: 110, color: "#64748b", textAlign: "right", marginRight: 8 },
  infoValue: { width: 130, textAlign: "right", fontWeight: 700 },
  toBlock: { marginTop: 12, marginBottom: 16 },
  toLabel: { color: "#64748b", marginBottom: 3 },
  toName: { fontSize: 11, fontWeight: 700, color: "#0f172a" },
  toLine: { marginTop: 1 },
  table: { borderWidth: 1, borderColor: "#cbd5e1" },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    fontWeight: 700,
    paddingVertical: 5,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingVertical: 4,
  },
  cellNo: { width: "5%", paddingHorizontal: 4, textAlign: "center" },
  cellPart: { width: "15%", paddingHorizontal: 4 },
  cellDesc: { width: "28%", paddingHorizontal: 4 },
  cellQty: { width: "8%", paddingHorizontal: 4, textAlign: "right" },
  cellUom: { width: "8%", paddingHorizontal: 4, textAlign: "center" },
  cellPrice: { width: "14%", paddingHorizontal: 4, textAlign: "right" },
  cellAmount: { width: "14%", paddingHorizontal: 4, textAlign: "right" },
  cellRemark: { width: "8%", paddingHorizontal: 4 },
  totalsBlock: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  notesBox: { width: "48%" },
  totalsBox: { width: "42%" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalsRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: "#0f172a",
  },
  terbilang: { marginTop: 8, fontStyle: "italic", color: "#334155" },
  thanks: { marginTop: 20, fontSize: 9, color: "#334155" },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  signCol: { width: "45%" },
  signLine: { marginTop: 45, borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 3 },
});

function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

export interface QuotationPdfItem {
  lineNumber: number;
  partNumber?: string | null;
  description: string;
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
  };
  customer: {
    name: string;
    address?: string | null;
    city?: string | null;
  };
  items: QuotationPdfItem[];
}

export function QuotationPdfDocument({ data }: { data: QuotationPdfData }) {
  const subtotal = data.items.reduce((sum, item) => sum + item.subtotal, 0);
  const ppnAmount = (subtotal * data.ppnPercent) / 100;
  const pphAmount = (subtotal * data.pphPercent) / 100;
  const total = subtotal + ppnAmount - pphAmount;

  const dateLabel = new Date(data.quotationDate).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.companyName}>{data.company.name}</Text>
            {data.company.description ? (
              <Text style={styles.companyTagline}>{data.company.description.toUpperCase()}</Text>
            ) : null}
            {companyDetailLines(data.company).map((line, i) => (
              <Text key={i} style={styles.companyDetail}>{line}</Text>
            ))}
          </View>
          <View>
            <Text style={styles.quotationTitle}>QUOTATION</Text>
            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>DATE :</Text>
                <Text style={styles.infoValue}>{dateLabel}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>QUOTATION NUMBER :</Text>
                <Text style={styles.infoValue}>{data.number}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>TERM OF PAYMENT :</Text>
                <Text style={styles.infoValue}>{data.paymentTerms || "-"}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>VALIDATION QUOTATION :</Text>
                <Text style={styles.infoValue}>{data.validityDays} Days</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.toBlock}>
          <Text style={styles.toLabel}>TO :</Text>
          <Text style={styles.toName}>{data.customer.name}</Text>
          {data.customer.address ? <Text style={styles.toLine}>{data.customer.address}</Text> : null}
          {data.customer.city ? <Text style={styles.toLine}>{data.customer.city}</Text> : null}
          {data.pic ? <Text style={styles.toLine}>PIC : {data.pic}</Text> : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.cellNo}>NO</Text>
            <Text style={styles.cellPart}>PART NUMBER</Text>
            <Text style={styles.cellDesc}>DESCRIPTION</Text>
            <Text style={styles.cellQty}>QTY</Text>
            <Text style={styles.cellUom}>UOM</Text>
            <Text style={styles.cellPrice}>PRICE</Text>
            <Text style={styles.cellAmount}>AMOUNT</Text>
            <Text style={styles.cellRemark}>REMARK</Text>
          </View>
          {data.items.map((item) => (
            <View style={styles.tableRow} key={item.lineNumber} wrap={false}>
              <Text style={styles.cellNo}>{item.lineNumber}</Text>
              <Text style={styles.cellPart}>{item.partNumber || "-"}</Text>
              <Text style={styles.cellDesc}>{item.description}</Text>
              <Text style={styles.cellQty}>{item.quantity}</Text>
              <Text style={styles.cellUom}>{item.unit || "-"}</Text>
              <Text style={styles.cellPrice}>{formatIDR(item.unitPrice)}</Text>
              <Text style={styles.cellAmount}>{formatIDR(item.subtotal)}</Text>
              <Text style={styles.cellRemark}>{item.notes || ""}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.notesBox}>
            <Text style={{ fontWeight: 700, marginBottom: 3 }}>SPECIAL NOTES</Text>
            <Text>{data.notes || "-"}</Text>
          </View>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text>SUB TOTAL</Text>
              <Text>{formatIDR(subtotal)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text>PPN ({data.ppnPercent}%)</Text>
              <Text>{formatIDR(ppnAmount)}</Text>
            </View>
            {data.pphPercent > 0 && (
              <View style={styles.totalsRow}>
                <Text>PPH ({data.pphPercent}%)</Text>
                <Text>-{formatIDR(pphAmount)}</Text>
              </View>
            )}
            <View style={styles.totalsRowFinal}>
              <Text style={{ fontWeight: 700 }}>TOTAL</Text>
              <Text style={{ fontWeight: 700 }}>{formatIDR(total)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.terbilang}>{terbilangRupiah(total)}</Text>

        <Text style={styles.thanks}>
          Thank you for your attention and cooperation, we look forward to working with your
          company.
        </Text>

        <View style={styles.signRow}>
          <View style={styles.signCol}>
            <Text>ACCEPTED BY ;</Text>
            <View style={styles.signLine}>
              <Text>NAME :</Text>
              <Text style={{ marginTop: 3 }}>POSITION :</Text>
            </View>
          </View>
          <View style={styles.signCol}>
            <Text>CREATED BY ;</Text>
            <View style={styles.signLine}>
              <Text>NAME :</Text>
              <Text style={{ marginTop: 3 }}>POSITION :</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
