import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { companyDetailLines } from "./company-pdf";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#1e293b" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  companyName: { fontSize: 13, fontWeight: 700, color: "#0f172a" },
  companyTagline: { fontSize: 7, color: "#64748b", marginTop: 2 },
  companyDetail: { fontSize: 7, color: "#64748b", marginTop: 1 },
  docTitle: { fontSize: 18, fontWeight: 700, textAlign: "right", color: "#166534" },
  docNumber: { fontSize: 10, textAlign: "right", marginTop: 2, fontWeight: 700 },
  divider: { borderBottomWidth: 2, borderBottomColor: "#166534", marginTop: 8, marginBottom: 14 },
  infoGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  infoCol: { width: "48%" },
  infoLabel: { color: "#64748b", fontWeight: 700, marginBottom: 3 },
  infoName: { fontSize: 11, fontWeight: 700 },
  infoLine: { marginTop: 1 },
  shipBox: { borderWidth: 1, borderColor: "#cbd5e1", padding: 8, marginTop: 6 },
  shipRow: { flexDirection: "row", marginBottom: 2 },
  shipKey: { width: 90, color: "#64748b" },
  shipVal: { fontWeight: 700 },
  table: { borderWidth: 1, borderColor: "#cbd5e1", marginTop: 4 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#166534",
    color: "#ffffff",
    fontWeight: 700,
    paddingVertical: 5,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingVertical: 5,
    minHeight: 20,
  },
  cellNo: { width: "6%", paddingHorizontal: 4, textAlign: "center" },
  cellPart: { width: "16%", paddingHorizontal: 4 },
  cellDesc: { width: "48%", paddingHorizontal: 4 },
  cellQty: { width: "12%", paddingHorizontal: 4, textAlign: "right" },
  cellUnit: { width: "18%", paddingHorizontal: 4, textAlign: "center" },
  noteText: { marginTop: 16, fontSize: 8, color: "#64748b" },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 44 },
  signCol: { width: "30%", textAlign: "center" },
  signSpace: { height: 50 },
  signLine: { borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 3 },
});

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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
  vehicleNumber?: string | null;
  driverName?: string | null;
  shippingAddress?: string | null;
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
  customer: { name: string; address?: string | null; city?: string | null };
  items: DeliveryPdfItem[];
}

export function DeliveryPdfDocument({ data }: { data: DeliveryPdfData }) {
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
            <Text style={styles.docTitle}>SURAT JALAN</Text>
            <Text style={styles.docNumber}>{data.deliveryNumber}</Text>
          </View>
        </View>
        <View style={styles.divider} />

        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>KEPADA</Text>
            <Text style={styles.infoName}>{data.customer.name}</Text>
            {data.shippingAddress ? (
              <Text style={styles.infoLine}>{data.shippingAddress}</Text>
            ) : (
              <>
                {data.customer.address ? <Text style={styles.infoLine}>{data.customer.address}</Text> : null}
                {data.customer.city ? <Text style={styles.infoLine}>{data.customer.city}</Text> : null}
              </>
            )}
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>TANGGAL KIRIM : {formatDate(data.deliveryDate)}</Text>
            <View style={styles.shipBox}>
              <View style={styles.shipRow}>
                <Text style={styles.shipKey}>No. Kendaraan</Text>
                <Text style={styles.shipVal}>{data.vehicleNumber || "-"}</Text>
              </View>
              <View style={styles.shipRow}>
                <Text style={styles.shipKey}>Nama Sopir</Text>
                <Text style={styles.shipVal}>{data.driverName || "-"}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.cellNo}>NO</Text>
            <Text style={styles.cellPart}>PART NUMBER</Text>
            <Text style={styles.cellDesc}>DESCRIPTION</Text>
            <Text style={styles.cellQty}>QTY</Text>
            <Text style={styles.cellUnit}>UNIT / KONDISI</Text>
          </View>
          {data.items.map((item) => (
            <View style={styles.tableRow} key={item.lineNumber} wrap={false}>
              <Text style={styles.cellNo}>{item.lineNumber}</Text>
              <Text style={styles.cellPart}>{item.partNumber || "-"}</Text>
              <Text style={styles.cellDesc}>{item.description}</Text>
              <Text style={styles.cellQty}>{item.quantity}</Text>
              <Text style={styles.cellUnit}>
                {item.unit || "-"}
                {item.notes ? ` / ${item.notes}` : ""}
              </Text>
            </View>
          ))}
        </View>

        {data.notes ? <Text style={styles.noteText}>Catatan: {data.notes}</Text> : null}

        <View style={styles.signRow}>
          <View style={styles.signCol}>
            <Text>Diserahkan oleh,</Text>
            <View style={styles.signSpace} />
            <View style={styles.signLine}>
              <Text>({data.driverName || "..........................."})</Text>
            </View>
          </View>
          <View style={styles.signCol}>
            <Text>Mengetahui,</Text>
            <View style={styles.signSpace} />
            <View style={styles.signLine}>
              <Text>(...........................)</Text>
            </View>
          </View>
          <View style={styles.signCol}>
            <Text>Diterima oleh,</Text>
            <View style={styles.signSpace} />
            <View style={styles.signLine}>
              <Text>(...........................)</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
