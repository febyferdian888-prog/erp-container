import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { companyDetailLines } from "./company-pdf";
import { terbilangRupiah } from "./terbilang";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  outerBorder: {
    borderWidth: 2,
    borderColor: "#0f172a",
    padding: 24,
    minHeight: 380,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  companyName: { fontSize: 13, fontWeight: 700 },
  companyTagline: { fontSize: 7, color: "#64748b", marginTop: 2 },
  companyDetail: { fontSize: 7, color: "#64748b", marginTop: 1 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 24, fontWeight: 700, letterSpacing: 2 },
  numberBox: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#0f172a",
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  numberText: { fontSize: 10, fontWeight: 700 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#94a3b8", marginTop: 16, marginBottom: 20 },
  fieldRow: { flexDirection: "row", marginBottom: 14, alignItems: "flex-end" },
  fieldLabel: { width: 130, fontSize: 10, color: "#475569" },
  fieldColon: { width: 10 },
  fieldValueLine: { flex: 1, borderBottomWidth: 1, borderBottomColor: "#94a3b8", paddingBottom: 2 },
  fieldValueText: { fontWeight: 700, fontSize: 11 },
  amountRow: { flexDirection: "row", marginTop: 8, marginBottom: 20, alignItems: "center" },
  amountLabel: { width: 130, fontSize: 10, color: "#475569" },
  amountBox: {
    borderWidth: 1.5,
    borderColor: "#0f172a",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#f1f5f9",
  },
  amountText: { fontSize: 16, fontWeight: 700 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
  dateBlock: { width: "45%" },
  signBlock: { width: "45%", textAlign: "center" },
  signSpace: { height: 50 },
  signLine: { borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 3 },
});

function formatIDR(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

export interface KwitansiPdfData {
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  method: string;
  description?: string | null;
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
  customerName: string;
}

export function KwitansiPdfDocument({ data }: { data: KwitansiPdfData }) {
  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.outerBorder}>
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
            <View style={styles.titleBlock}>
              <Text style={styles.title}>KWITANSI</Text>
              <View style={styles.numberBox}>
                <Text style={styles.numberText}>No. {data.paymentNumber}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Sudah terima dari</Text>
            <Text style={styles.fieldColon}>:</Text>
            <View style={styles.fieldValueLine}>
              <Text style={styles.fieldValueText}>{data.customerName}</Text>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Uang sejumlah</Text>
            <Text style={styles.fieldColon}>:</Text>
            <View style={styles.fieldValueLine}>
              <Text style={{ fontStyle: "italic" }}>{terbilangRupiah(data.amount)}</Text>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Untuk pembayaran</Text>
            <Text style={styles.fieldColon}>:</Text>
            <View style={styles.fieldValueLine}>
              <Text>{data.description || "-"}</Text>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Cara pembayaran</Text>
            <Text style={styles.fieldColon}>:</Text>
            <View style={styles.fieldValueLine}>
              <Text style={{ textTransform: "capitalize" }}>{data.method}</Text>
            </View>
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Jumlah</Text>
            <View style={styles.amountBox}>
              <Text style={styles.amountText}>{formatIDR(data.amount)}</Text>
            </View>
          </View>

          <View style={styles.footerRow}>
            <View style={styles.dateBlock}>
              <Text>
                {data.company.city || ""}, {formatDate(data.paymentDate)}
              </Text>
            </View>
            <View style={styles.signBlock}>
              <Text>Yang menerima,</Text>
              <View style={styles.signSpace} />
              <View style={styles.signLine}>
                <Text>({data.company.name})</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
