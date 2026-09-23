import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { terbilangRupiah } from "./terbilang";
import { companyDetailLines } from "./company-pdf";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1e293b" },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#7c2d12",
    color: "#ffffff",
    padding: 16,
    marginBottom: 16,
  },
  companyName: { fontSize: 13, fontWeight: 700 },
  companyTagline: { fontSize: 7, color: "#fed7aa", marginTop: 2 },
  companyDetail: { fontSize: 7, color: "#fed7aa", marginTop: 1 },
  poTitle: { fontSize: 22, fontWeight: 700, textAlign: "right" },
  poNumber: { fontSize: 9, textAlign: "right", marginTop: 2, color: "#fed7aa" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  metaBox: { width: "48%" },
  metaLabel: { color: "#64748b", marginBottom: 3, fontWeight: 700 },
  metaLine: { marginTop: 1 },
  metaRight: { alignItems: "flex-end" },
  metaKV: { flexDirection: "row", marginBottom: 2 },
  metaKey: { width: 90, color: "#64748b" },
  metaVal: { fontWeight: 700 },
  table: { borderWidth: 1, borderColor: "#cbd5e1" },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    fontWeight: 700,
    paddingVertical: 5,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingVertical: 4,
  },
  cellNo: { width: "6%", paddingHorizontal: 4, textAlign: "center" },
  cellDesc: { width: "44%", paddingHorizontal: 4 },
  cellQty: { width: "10%", paddingHorizontal: 4, textAlign: "right" },
  cellUnit: { width: "10%", paddingHorizontal: 4, textAlign: "center" },
  cellPrice: { width: "15%", paddingHorizontal: 4, textAlign: "right" },
  cellAmount: { width: "15%", paddingHorizontal: 4, textAlign: "right" },
  totalsBlock: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  totalsBox: { width: "45%" },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
  },
  totalLabel: { fontWeight: 700, fontSize: 11 },
  totalValue: { fontWeight: 700, fontSize: 11 },
  terbilang: { marginTop: 8, fontStyle: "italic", color: "#334155" },
  notes: { marginTop: 16, fontSize: 8, color: "#64748b" },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 48 },
  signBox: { width: "45%", textAlign: "center" },
  signLabel: { color: "#64748b" },
  signLine: { marginTop: 48, borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 4 },
});

function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export interface PoPdfItem {
  lineNumber: number;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  subtotal: number;
  notes?: string | null;
}

export interface PoPdfData {
  poNumber: string;
  poDate: string;
  deliveryDate?: string | null;
  paymentTerms?: string | null;
  status: string;
  notes?: string | null;
  sourcePrNumber?: string | null;
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
  supplier: {
    name: string;
    address?: string | null;
    city?: string | null;
    phone?: string | null;
  };
  items: PoPdfItem[];
}

export function PoPdfDocument({ data }: { data: PoPdfData }) {
  const total = data.items.reduce((sum, i) => sum + i.subtotal, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar}>
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
            <Text style={styles.poTitle}>PURCHASE ORDER</Text>
            <Text style={styles.poNumber}>{data.poNumber}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>TO (VENDOR)</Text>
            <Text style={{ fontWeight: 700, fontSize: 11 }}>{data.supplier.name}</Text>
            {data.supplier.address ? <Text style={styles.metaLine}>{data.supplier.address}</Text> : null}
            {data.supplier.city ? <Text style={styles.metaLine}>{data.supplier.city}</Text> : null}
            {data.supplier.phone ? <Text style={styles.metaLine}>Phone: {data.supplier.phone}</Text> : null}
          </View>
          <View style={[styles.metaBox, styles.metaRight]}>
            <View style={styles.metaKV}>
              <Text style={styles.metaKey}>PO Date</Text>
              <Text style={styles.metaVal}>{formatDate(data.poDate)}</Text>
            </View>
            <View style={styles.metaKV}>
              <Text style={styles.metaKey}>Delivery Date</Text>
              <Text style={styles.metaVal}>{data.deliveryDate ? formatDate(data.deliveryDate) : "-"}</Text>
            </View>
            <View style={styles.metaKV}>
              <Text style={styles.metaKey}>Payment Terms</Text>
              <Text style={styles.metaVal}>{data.paymentTerms || "-"}</Text>
            </View>
            <View style={styles.metaKV}>
              <Text style={styles.metaKey}>Status</Text>
              <Text style={styles.metaVal}>{data.status.replace(/_/g, " ").toUpperCase()}</Text>
            </View>
            {data.sourcePrNumber ? (
              <View style={styles.metaKV}>
                <Text style={styles.metaKey}>Source PR</Text>
                <Text style={styles.metaVal}>{data.sourcePrNumber}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.cellNo}>NO</Text>
            <Text style={styles.cellDesc}>DESCRIPTION</Text>
            <Text style={styles.cellQty}>QTY</Text>
            <Text style={styles.cellUnit}>UNIT</Text>
            <Text style={styles.cellPrice}>PRICE</Text>
            <Text style={styles.cellAmount}>AMOUNT</Text>
          </View>
          {data.items.map((item) => (
            <View style={styles.tableRow} key={item.lineNumber} wrap={false}>
              <Text style={styles.cellNo}>{item.lineNumber}</Text>
              <Text style={styles.cellDesc}>{item.description}</Text>
              <Text style={styles.cellQty}>{item.quantity}</Text>
              <Text style={styles.cellUnit}>{item.unit || "-"}</Text>
              <Text style={styles.cellPrice}>{formatIDR(item.unitPrice)}</Text>
              <Text style={styles.cellAmount}>{formatIDR(item.subtotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsBox}>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValue}>{formatIDR(total)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.terbilang}>{terbilangRupiah(total)}</Text>

        {data.notes ? <Text style={styles.notes}>Notes: {data.notes}</Text> : null}

        <View style={styles.signRow}>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>Ordered by,</Text>
            <Text style={styles.signLine}>{data.company.name}</Text>
          </View>
          <View style={styles.signBox}>
            <Text style={styles.signLabel}>Accepted by,</Text>
            <Text style={styles.signLine}>{data.supplier.name}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
