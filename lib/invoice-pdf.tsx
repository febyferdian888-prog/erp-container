import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { terbilangRupiah } from "./terbilang";
import { companyDetailLines } from "./company-pdf";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1e293b" },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    padding: 16,
    marginBottom: 16,
  },
  companyName: { fontSize: 13, fontWeight: 700 },
  companyTagline: { fontSize: 7, color: "#cbd5e1", marginTop: 2 },
  companyDetail: { fontSize: 7, color: "#cbd5e1", marginTop: 1 },
  invoiceTitle: { fontSize: 22, fontWeight: 700, textAlign: "right" },
  invoiceNumber: { fontSize: 9, textAlign: "right", marginTop: 2, color: "#cbd5e1" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  metaBox: { width: "48%" },
  metaLabel: { color: "#64748b", marginBottom: 3, fontWeight: 700 },
  metaLine: { marginTop: 1 },
  metaRight: { alignItems: "flex-end" },
  metaKV: { flexDirection: "row", marginBottom: 2 },
  metaKey: { width: 80, color: "#64748b" },
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
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  subtotalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
  },
  dueBox: {
    marginTop: 6,
    backgroundColor: "#0f172a",
    padding: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dueLabel: { color: "#ffffff", fontWeight: 700 },
  dueValue: { color: "#ffffff", fontWeight: 700, fontSize: 11 },
  paidLine: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  terbilang: { marginTop: 8, fontStyle: "italic", color: "#334155" },
  bankBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    padding: 10,
    width: "55%",
  },
  bankTitle: { fontWeight: 700, marginBottom: 4 },
  notes: { marginTop: 16, fontSize: 8, color: "#64748b" },
});

function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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
  dueDate?: string | null;
  paymentTerms?: string | null;
  status: string;
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
  };
  customer: {
    name: string;
    address?: string | null;
    city?: string | null;
  };
  items: InvoicePdfItem[];
}

export function InvoicePdfDocument({ data }: { data: InvoicePdfData }) {
  const balanceDue = data.grandTotal - data.paidAmount;

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
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>BILL TO</Text>
            <Text style={{ fontWeight: 700, fontSize: 11 }}>{data.customer.name}</Text>
            {data.customer.address ? <Text style={styles.metaLine}>{data.customer.address}</Text> : null}
            {data.customer.city ? <Text style={styles.metaLine}>{data.customer.city}</Text> : null}
          </View>
          <View style={[styles.metaBox, styles.metaRight]}>
            <View style={styles.metaKV}>
              <Text style={styles.metaKey}>Invoice Date</Text>
              <Text style={styles.metaVal}>{formatDate(data.invoiceDate)}</Text>
            </View>
            <View style={styles.metaKV}>
              <Text style={styles.metaKey}>Due Date</Text>
              <Text style={styles.metaVal}>{data.dueDate ? formatDate(data.dueDate) : "-"}</Text>
            </View>
            <View style={styles.metaKV}>
              <Text style={styles.metaKey}>Terms</Text>
              <Text style={styles.metaVal}>{data.paymentTerms || "-"}</Text>
            </View>
            <View style={styles.metaKV}>
              <Text style={styles.metaKey}>Status</Text>
              <Text style={styles.metaVal}>{data.status.replace("_", " ").toUpperCase()}</Text>
            </View>
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
              <Text style={styles.cellDesc}>
                {item.partNumber ? `[${item.partNumber}] ` : ""}
                {item.description}
              </Text>
              <Text style={styles.cellQty}>{item.quantity}</Text>
              <Text style={styles.cellUnit}>{item.unit || "-"}</Text>
              <Text style={styles.cellPrice}>{formatIDR(item.unitPrice)}</Text>
              <Text style={styles.cellAmount}>{formatIDR(item.subtotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text>Subtotal</Text>
              <Text>{formatIDR(data.totalAmount)}</Text>
            </View>
            <View style={styles.subtotalLine}>
              <Text>PPN ({data.ppnPercent}%)</Text>
              <Text>{formatIDR(data.taxAmount)}</Text>
            </View>
            {(data.pphAmount ?? 0) > 0 && (
              <View style={styles.paidLine}>
                <Text>PPh 23 dipotong</Text>
                <Text>-{formatIDR(data.pphAmount ?? 0)}</Text>
              </View>
            )}
            {data.paidAmount - (data.pphAmount ?? 0) > 0 && (
              <View style={styles.paidLine}>
                <Text>Paid</Text>
                <Text>-{formatIDR(data.paidAmount - (data.pphAmount ?? 0))}</Text>
              </View>
            )}
            <View style={styles.dueBox}>
              <Text style={styles.dueLabel}>
                {data.paidAmount > 0 ? "BALANCE DUE" : "TOTAL DUE"}
              </Text>
              <Text style={styles.dueValue}>{formatIDR(balanceDue)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.terbilang}>{terbilangRupiah(balanceDue)}</Text>

        {data.company.bankName && data.company.bankAccount ? (
          <View style={styles.bankBox}>
            <Text style={styles.bankTitle}>Payment Details</Text>
            <Text>Bank: {data.company.bankName}</Text>
            <Text>Account: {data.company.bankAccount}</Text>
            <Text>Account Name: {data.company.name}</Text>
          </View>
        ) : null}

        {data.notes ? <Text style={styles.notes}>Notes: {data.notes}</Text> : null}
      </Page>
    </Document>
  );
}
