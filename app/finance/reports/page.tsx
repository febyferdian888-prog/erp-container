"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";

interface Row { code: string; name: string; amount: number }
interface Report {
  years: number[];
  accounts: { code: string; name: string; type: string }[];
  incomeStatement: { revenue: Row[]; expense: Row[]; totalRevenue: number; totalExpense: number; netIncome: number };
  balanceSheet: { assets: Row[]; liabilities: Row[]; equity: Row[]; earnings: number; totalAssets: number; totalLiabilities: number; totalEquity: number };
  trialBalance: { code: string; name: string; type: string; debit: number; credit: number }[];
  ledger: null | {
    code: string; name: string; opening: number;
    rows: { date: string; number: string; description: string | null; debit: number; credit: number; balance: number; sourceType: string | null; sourceId: string | null }[];
  };
  ppn: { month: string; salesBase: number; output: number; purchaseBase: number; input: number; net: number }[];
  pph: {
    byCustomers: { id: string; number: string; date: string; party: string; base: number; amount: number; proofNumber: string | null; proofDate: string | null }[];
    toVendors: { id: string; number: string; date: string; party: string; base: number; amount: number; proofNumber: string | null; proofDate: string | null; remittedAt: string | null; dueDate: string; overdue: boolean }[];
  };
  entryCount: number;
}

const TABS = [
  { key: "pl", label: "Laba rugi" },
  { key: "bs", label: "Neraca" },
  { key: "tb", label: "Neraca saldo" },
  { key: "gl", label: "Buku besar" },
  { key: "ppn", label: "Rekap PPN" },
  { key: "pph", label: "PPh 23" },
] as const;

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const dt = (d: string) => new Date(d).toLocaleDateString("id-ID");
const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400";
const thr = th.replace("text-left", "text-right");
const td = "px-4 py-2 text-sm text-slate-700";
const tdr = `${td} text-right tabular-nums`;
const SOURCE_HREF: Record<string, string> = { Invoice: "/finance/invoices", Payment: "/finance/kwitansi", Bill: "/supply-chain/bills" };

function csv(name: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Box({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h3>
        {action}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Export({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs font-medium text-slate-500 hover:text-slate-900 hover:underline">
      Unduh CSV
    </button>
  );
}

function Group({ title, rows, total, totalLabel }: { title: string; rows: Row[]; total: number; totalLabel: string }) {
  return (
    <>
      <tr><td colSpan={3} className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</td></tr>
      {rows.map((r) => (
        <tr key={r.code} className="border-b border-slate-100">
          <td className={`${td} w-24 font-mono text-xs text-slate-400`}>{r.code}</td>
          <td className={td}>{r.name}</td>
          <td className={tdr}>{idr(r.amount)}</td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={3} className="px-4 py-2 text-sm text-slate-300">Tidak ada</td></tr>}
      <tr className="border-b border-slate-200">
        <td />
        <td className={`${td} font-semibold`}>{totalLabel}</td>
        <td className={`${tdr} font-semibold text-slate-900`}>{idr(total)}</td>
      </tr>
    </>
  );
}

export default function FinanceReportsPage() {
  const { status } = useSession();
  const router = useRouter();
  const thisYear = new Date().getFullYear();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pl");
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [account, setAccount] = useState("1200");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ from, to, account });
    const res = await fetch(`/api/reports/finance?${p}`);
    if (res.ok) {
      setData(await res.json());
      setError(null);
    } else setError("Gagal memuat laporan");
  }, [from, to, account]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status === "authenticated") load();
  }, [status, router, load]);

  const setYear = (y: string) => {
    if (y === "all") {
      setFrom("2000-01-01");
      setTo(new Date().toISOString().slice(0, 10));
    } else {
      setFrom(`${y}-01-01`);
      setTo(`${y}-12-31`);
    }
  };
  const field = "h-9 border border-slate-300 bg-white px-2 text-sm";
  const d = data;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <Link href="/finance" className="text-sm text-slate-500 hover:text-slate-900">← Finance</Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Laporan keuangan</h1>
          <p className="mt-1 text-slate-600">
            Dari jurnal yang sudah diposting. Invoice, kwitansi, bill, dan pembayaran vendor masuk ke jurnal otomatis.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <select className={field} defaultValue={String(thisYear)} onChange={(e) => setYear(e.target.value)}>
            {[...new Set([thisYear, ...(d?.years || [])])].sort().reverse().map((y) => (
              <option key={y} value={y}>Tahun {y}</option>
            ))}
            <option value="all">Semua periode</option>
          </select>
          <label className="text-xs text-slate-500">Dari <input type="date" className={`${field} ml-1`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs text-slate-500">Sampai <input type="date" className={`${field} ml-1`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>

        <div className="flex gap-6 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 pb-3 text-sm font-medium ${tab === t.key ? "border-brand text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {!d && !error && <p className="py-12 text-center text-slate-500">Memuat…</p>}

        {d && tab === "pl" && (
          <Box
            title={`Laba rugi · ${dt(from)} – ${dt(to)}`}
            action={<Export onClick={() => csv("laba-rugi", [["Kode", "Akun", "Jumlah"], ...d.incomeStatement.revenue.map((r) => [r.code, r.name, r.amount]), ["", "Total pendapatan", d.incomeStatement.totalRevenue], ...d.incomeStatement.expense.map((r) => [r.code, r.name, r.amount]), ["", "Total beban", d.incomeStatement.totalExpense], ["", "Laba (rugi) bersih", d.incomeStatement.netIncome]])} />}
          >
            <table className="w-full">
              <tbody>
                <Group title="Pendapatan" rows={d.incomeStatement.revenue} total={d.incomeStatement.totalRevenue} totalLabel="Total pendapatan" />
                <Group title="Beban dan pembelian" rows={d.incomeStatement.expense} total={d.incomeStatement.totalExpense} totalLabel="Total beban" />
                <tr className="bg-slate-50">
                  <td />
                  <td className={`${td} text-base font-semibold text-slate-900`}>Laba (rugi) bersih</td>
                  <td className={`${tdr} text-base font-semibold ${d.incomeStatement.netIncome < 0 ? "text-brand" : "text-slate-900"}`}>{idr(d.incomeStatement.netIncome)}</td>
                </tr>
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
              Pembelian dicatat langsung sebagai beban saat bill diterbitkan. Selama bill belum diinput, pendapatan tampil tanpa harga pokok.
            </p>
          </Box>
        )}

        {d && tab === "bs" && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Box title={`Aset · per ${dt(to)}`}>
                <table className="w-full"><tbody>
                  <Group title="Aset" rows={d.balanceSheet.assets} total={d.balanceSheet.totalAssets} totalLabel="Total aset" />
                </tbody></table>
              </Box>
              <Box title="Kewajiban dan ekuitas">
                <table className="w-full"><tbody>
                  <Group title="Kewajiban" rows={d.balanceSheet.liabilities} total={d.balanceSheet.totalLiabilities} totalLabel="Total kewajiban" />
                  <Group
                    title="Ekuitas"
                    rows={[...d.balanceSheet.equity, { code: "", name: "Laba (rugi) berjalan", amount: d.balanceSheet.earnings }]}
                    total={d.balanceSheet.totalEquity}
                    totalLabel="Total ekuitas"
                  />
                  <tr className="bg-slate-50">
                    <td />
                    <td className={`${td} font-semibold text-slate-900`}>Kewajiban + ekuitas</td>
                    <td className={`${tdr} font-semibold text-slate-900`}>{idr(d.balanceSheet.totalLiabilities + d.balanceSheet.totalEquity)}</td>
                  </tr>
                </tbody></table>
              </Box>
            </div>
            {Math.abs(d.balanceSheet.totalAssets - d.balanceSheet.totalLiabilities - d.balanceSheet.totalEquity) < 1 ? (
              <p className="text-sm text-slate-500">Neraca seimbang.</p>
            ) : (
              <p className="border-l-2 border-brand bg-white px-4 py-3 text-sm text-slate-700">Neraca tidak seimbang. Cek jurnal manual yang memakai akun tidak terdaftar.</p>
            )}
          </div>
        )}

        {d && tab === "tb" && (
          <Box
            title={`Neraca saldo · per ${dt(to)}`}
            action={<Export onClick={() => csv("neraca-saldo", [["Kode", "Akun", "Debit", "Kredit"], ...d.trialBalance.map((r) => [r.code, r.name, r.debit, r.credit])])} />}
          >
            <table className="w-full">
              <thead><tr className="border-b border-slate-200"><th className={th}>Kode</th><th className={th}>Akun</th><th className={thr}>Debit</th><th className={thr}>Kredit</th></tr></thead>
              <tbody>
                {d.trialBalance.map((r) => (
                  <tr key={r.code} className="border-b border-slate-100">
                    <td className={`${td} font-mono text-xs`}>{r.code}</td>
                    <td className={td}>{r.name}</td>
                    <td className={tdr}>{r.debit ? idr(r.debit) : "-"}</td>
                    <td className={tdr}>{r.credit ? idr(r.credit) : "-"}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50">
                  <td /><td className={`${td} font-semibold`}>Total</td>
                  <td className={`${tdr} font-semibold`}>{idr(d.trialBalance.reduce((s, r) => s + r.debit, 0))}</td>
                  <td className={`${tdr} font-semibold`}>{idr(d.trialBalance.reduce((s, r) => s + r.credit, 0))}</td>
                </tr>
              </tbody>
            </table>
          </Box>
        )}

        {d && tab === "gl" && (
          <div className="space-y-4">
            <select className={`${field} w-72`} value={account} onChange={(e) => setAccount(e.target.value)}>
              {d.accounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
            </select>
            {d.ledger && (
              <Box
                title={`${d.ledger.code} · ${d.ledger.name}`}
                action={<Export onClick={() => csv(`buku-besar-${d.ledger!.code}`, [["Tanggal", "No. jurnal", "Keterangan", "Debit", "Kredit", "Saldo"], ...d.ledger!.rows.map((r) => [dt(r.date), r.number, r.description || "", r.debit, r.credit, r.balance])])} />}
              >
                <table className="w-full">
                  <thead><tr className="border-b border-slate-200"><th className={th}>Tanggal</th><th className={th}>No. jurnal</th><th className={th}>Keterangan</th><th className={thr}>Debit</th><th className={thr}>Kredit</th><th className={thr}>Saldo</th></tr></thead>
                  <tbody>
                    <tr className="border-b border-slate-100"><td colSpan={5} className={`${td} text-slate-400`}>Saldo awal</td><td className={tdr}>{idr(d.ledger.opening)}</td></tr>
                    {d.ledger.rows.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className={td}>{dt(r.date)}</td>
                        <td className={`${td} font-mono text-xs`}>{r.number}</td>
                        <td className={td}>
                          {r.sourceType && r.sourceId && SOURCE_HREF[r.sourceType] ? (
                            <Link href={`${SOURCE_HREF[r.sourceType]}/${r.sourceId}`} className="hover:underline">{r.description}</Link>
                          ) : r.description}
                        </td>
                        <td className={tdr}>{r.debit ? idr(r.debit) : "-"}</td>
                        <td className={tdr}>{r.credit ? idr(r.credit) : "-"}</td>
                        <td className={`${tdr} font-medium`}>{idr(r.balance)}</td>
                      </tr>
                    ))}
                    {d.ledger.rows.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-sm text-slate-400">Tidak ada transaksi pada periode ini.</td></tr>}
                  </tbody>
                </table>
              </Box>
            )}
          </div>
        )}

        {d && tab === "ppn" && (
          <Box
            title="Rekap PPN per bulan"
            action={<Export onClick={() => csv("rekap-ppn", [["Bulan", "DPP penjualan", "PPN keluaran", "DPP pembelian", "PPN masukan", "Kurang (lebih) bayar"], ...d.ppn.map((m) => [m.month, m.salesBase, m.output, m.purchaseBase, m.input, m.net])])} />}
          >
            <table className="w-full">
              <thead><tr className="border-b border-slate-200"><th className={th}>Bulan</th><th className={thr}>DPP penjualan</th><th className={thr}>PPN keluaran</th><th className={thr}>DPP pembelian</th><th className={thr}>PPN masukan</th><th className={thr}>Kurang (lebih) bayar</th></tr></thead>
              <tbody>
                {d.ppn.map((m) => (
                  <tr key={m.month} className="border-b border-slate-100">
                    <td className={td}>{new Date(`${m.month}-01`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</td>
                    <td className={tdr}>{idr(m.salesBase)}</td>
                    <td className={tdr}>{idr(m.output)}</td>
                    <td className={tdr}>{m.purchaseBase ? idr(m.purchaseBase) : "-"}</td>
                    <td className={tdr}>{m.input ? idr(m.input) : "-"}</td>
                    <td className={`${tdr} font-semibold ${m.net < 0 ? "text-brand" : "text-slate-900"}`}>{idr(m.net)}</td>
                  </tr>
                ))}
                {d.ppn.length > 0 && (
                  <tr className="bg-slate-50">
                    <td className={`${td} font-semibold`}>Total</td>
                    <td className={`${tdr} font-semibold`}>{idr(d.ppn.reduce((s, m) => s + m.salesBase, 0))}</td>
                    <td className={`${tdr} font-semibold`}>{idr(d.ppn.reduce((s, m) => s + m.output, 0))}</td>
                    <td className={`${tdr} font-semibold`}>{idr(d.ppn.reduce((s, m) => s + m.purchaseBase, 0))}</td>
                    <td className={`${tdr} font-semibold`}>{idr(d.ppn.reduce((s, m) => s + m.input, 0))}</td>
                    <td className={`${tdr} font-semibold`}>{idr(d.ppn.reduce((s, m) => s + m.net, 0))}</td>
                  </tr>
                )}
                {d.ppn.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-sm text-slate-400">Tidak ada transaksi pada periode ini.</td></tr>}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
              Angka dari invoice dan bill yang sudah diterbitkan. Ini rekap kerja, bukan pengganti SPT Masa PPN dan faktur pajak.
            </p>
          </Box>
        )}

        {d && tab === "pph" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                ["Dipotong customer", idr(d.pph.byCustomers.reduce((t, r) => t + r.amount, 0)), `${d.pph.byCustomers.length} invoice, jadi kredit pajak`],
                ["Bukti potong belum diterima", idr(d.pph.byCustomers.filter((r) => !r.proofNumber).reduce((t, r) => t + r.amount, 0)), `${d.pph.byCustomers.filter((r) => !r.proofNumber).length} invoice, tagih ke customer`],
                ["Kita potong dari vendor", idr(d.pph.toVendors.reduce((t, r) => t + r.amount, 0)), `${d.pph.toVendors.length} bill`],
                ["Belum disetor", idr(d.pph.toVendors.filter((r) => !r.remittedAt).reduce((t, r) => t + r.amount, 0)), `${d.pph.toVendors.filter((r) => r.overdue).length} lewat batas setor`],
              ].map(([l, v, n]) => (
                <div key={l} className="border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">{l}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{v}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{n}</p>
                </div>
              ))}
            </div>

            <Box
              title="PPh 23 yang dipotong customer (kredit pajak kita)"
              action={<Export onClick={() => csv("pph23-dipotong-customer", [["Tanggal invoice", "Invoice", "Customer", "DPP", "PPh 23", "No. bukti potong", "Tanggal bukti potong"], ...d.pph.byCustomers.map((r) => [dt(r.date), r.number, r.party, r.base, r.amount, r.proofNumber || "", r.proofDate ? dt(r.proofDate) : ""])])} />}
            >
              <table className="w-full">
                <thead><tr className="border-b border-slate-200"><th className={th}>Tanggal</th><th className={th}>Invoice</th><th className={th}>Customer</th><th className={thr}>DPP</th><th className={thr}>PPh 23</th><th className={th}>Bukti potong</th></tr></thead>
                <tbody>
                  {d.pph.byCustomers.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className={td}>{dt(r.date)}</td>
                      <td className={`${td} font-mono text-xs`}><Link href={`/finance/invoices/${r.id}`} className="hover:underline">{r.number}</Link></td>
                      <td className={td}>{r.party}</td>
                      <td className={tdr}>{idr(r.base)}</td>
                      <td className={`${tdr} font-medium`}>{idr(r.amount)}</td>
                      <td className={td}>{r.proofNumber ? `${r.proofNumber}${r.proofDate ? ` · ${dt(r.proofDate)}` : ""}` : <span className="text-brand">Belum diterima</span>}</td>
                    </tr>
                  ))}
                  {d.pph.byCustomers.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-sm text-slate-400">Tidak ada pada periode ini.</td></tr>}
                </tbody>
              </table>
            </Box>

            <Box
              title="PPh 23 yang kita potong dari vendor (utang pajak)"
              action={<Export onClick={() => csv("pph23-kita-potong", [["Tanggal bill", "Bill", "Vendor", "DPP", "PPh 23", "Batas setor", "Tanggal setor", "No. bukti potong"], ...d.pph.toVendors.map((r) => [dt(r.date), r.number, r.party, r.base, r.amount, dt(r.dueDate), r.remittedAt ? dt(r.remittedAt) : "", r.proofNumber || ""])])} />}
            >
              <table className="w-full">
                <thead><tr className="border-b border-slate-200"><th className={th}>Tanggal</th><th className={th}>Bill</th><th className={th}>Vendor</th><th className={thr}>DPP</th><th className={thr}>PPh 23</th><th className={th}>Setor</th><th className={th}>Bukti potong</th></tr></thead>
                <tbody>
                  {d.pph.toVendors.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className={td}>{dt(r.date)}</td>
                      <td className={`${td} font-mono text-xs`}><Link href={`/supply-chain/bills/${r.id}`} className="hover:underline">{r.number}</Link></td>
                      <td className={td}>{r.party}</td>
                      <td className={tdr}>{idr(r.base)}</td>
                      <td className={`${tdr} font-medium`}>{idr(r.amount)}</td>
                      <td className={td}>{r.remittedAt ? dt(r.remittedAt) : <span className={r.overdue ? "text-brand" : "text-amber-700"}>{r.overdue ? "Lewat" : "Batas"} {dt(r.dueDate)}</span>}</td>
                      <td className={td}>{r.proofNumber || <span className="text-slate-400">-</span>}</td>
                    </tr>
                  ))}
                  {d.pph.toVendors.length === 0 && <tr><td colSpan={7} className="px-5 py-6 text-sm text-slate-400">Tidak ada pada periode ini.</td></tr>}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
                Rekap kerja dari dokumen. Bukan pengganti bukti potong resmi (e-Bupot) atau SPT Masa PPh 23/26. Batas setor dihitung tanggal 10 bulan berikutnya dari tanggal bill.
              </p>
            </Box>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
