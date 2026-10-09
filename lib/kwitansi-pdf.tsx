import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { companyDetailLines } from "./company-pdf";
import { terbilangRupiah } from "./terbilang";

// MDA kwitansi layout (see Panduan-Claude-Kwitansi-MDA.md): A5 landscape,
// red accent #C62828, single page by design (kwitansi content is short and
// fixed-field, unlike invoice/quotation which need multi-page pagination).
const RED = "#c62828";
const INK = "#20252c";
const MUTED = "#60656d";
const LINE = "#d8d8d8";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 12, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", alignItems: "center", borderBottomWidth: 2, borderBottomColor: RED, paddingBottom: 8, marginBottom: 4 },
  logo: { width: 99, height: 40, objectFit: "contain", marginRight: 10 },
  companyCol: { flex: 1 },
  companyLine: { fontSize: 8.5, color: MUTED, marginTop: 1 },
  title: { fontSize: 24, fontWeight: 700, color: RED, textAlign: "right" },
  number: { fontSize: 11, fontWeight: 700, textAlign: "right", marginTop: 8, marginBottom: 12 },

  detailsRow: { flexDirection: "row", marginBottom: 6 },
  detailsLabel: { width: 118, fontSize: 11 },
  detailsColon: { width: 8, fontSize: 11 },
  detailsValue: { flex: 1, fontSize: 11, fontWeight: 700 },
  address: { fontSize: 9.5, color: MUTED, marginTop: 3 },

  bottom: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LINE, marginTop: 8, paddingTop: 10 },
  left: { width: "58%" },
  amount: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff2f2", paddingVertical: 8, paddingHorizontal: 10, width: "88%" },
  amountLabel: { fontSize: 10, color: RED, fontWeight: 700 },
  amountValue: { fontSize: 19, color: RED, fontWeight: 700 },
  bank: { fontSize: 9.5, marginTop: 10, lineHeight: 1.4 },
  note: { fontSize: 8, color: MUTED, marginTop: 8 },

  right: { width: "38%", fontSize: 11 },
  signSpace: { height: 82 },
  signName: { fontWeight: 700 },
  signRole: { fontSize: 9.5, color: MUTED },
});

function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export interface KwitansiPdfData {
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  method: string;
  description?: string | null;
  invoiceReferences?: string[];
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
  customerName: string;
  customerAddress?: string | null;
}

export function KwitansiPdfDocument({ data }: { data: KwitansiPdfData }) {
  return (
    <Document>
      <Page size="A5" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          {data.company.logo ? <Image style={styles.logo} src={data.company.logo} /> : null}
          <View style={styles.companyCol}>
            <Text style={{ fontWeight: 700, fontSize: 10.5 }}>{data.company.name}</Text>
            {companyDetailLines(data.company).slice(0, 2).map((line, i) => (
              <Text key={i} style={styles.companyLine}>{line}</Text>
            ))}
          </View>
          <Text style={styles.title}>KWITANSI</Text>
        </View>
        <Text style={styles.number}>No. {data.paymentNumber}</Text>

        <View style={styles.detailsRow}>
          <Text style={styles.detailsLabel}>Sudah terima dari</Text>
          <Text style={styles.detailsColon}>:</Text>
          <Text style={styles.detailsValue}>
            {data.customerName}
            {data.customerAddress ? <Text style={styles.address}>{"\n" + data.customerAddress}</Text> : null}
          </Text>
        </View>
        <View style={styles.detailsRow}>
          <Text style={styles.detailsLabel}>Terbilang</Text>
          <Text style={styles.detailsColon}>:</Text>
          <Text style={styles.detailsValue}>{terbilangRupiah(data.amount)}</Text>
        </View>
        <View style={styles.detailsRow}>
          <Text style={styles.detailsLabel}>Untuk pembayaran</Text>
          <Text style={styles.detailsColon}>:</Text>
          <Text style={styles.detailsValue}>{data.description || "-"}</Text>
        </View>
        {data.invoiceReferences && data.invoiceReferences.length > 0 ? (
          <View style={styles.detailsRow}>
            <Text style={styles.detailsLabel}>Referensi invoice</Text>
            <Text style={styles.detailsColon}>:</Text>
            <Text style={styles.detailsValue}>{data.invoiceReferences.join(", ")}</Text>
          </View>
        ) : null}

        <View style={styles.bottom}>
          <View style={styles.left}>
            <View style={styles.amount}>
              <Text style={styles.amountLabel}>JUMLAH</Text>
              <Text style={styles.amountValue}>{formatIDR(data.amount)}</Text>
            </View>
            {data.company.bankName && data.company.bankAccount ? (
              <Text style={styles.bank}>
                <Text style={{ fontWeight: 700 }}>Rekening perusahaan{"\n"}</Text>
                Bank {data.company.bankName} | {data.company.bankAccount}
                {"\n"}a.n. {data.company.name}
              </Text>
            ) : null}
            <Text style={styles.note}>Pembayaran cek/giro diakui setelah dana efektif diterima.</Text>
          </View>
          <View style={styles.right}>
            <Text>
              {[data.company.city, formatDate(data.paymentDate)].filter(Boolean).join(", ")}
            </Text>
            <Text>Yang menerima,</Text>
            <View style={styles.signSpace} />
            {data.company.signatoryName ? (
              <>
                <Text style={styles.signName}>{data.company.signatoryName}</Text>
                {data.company.signatoryTitle ? <Text style={styles.signRole}>{data.company.signatoryTitle}</Text> : null}
              </>
            ) : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}
