"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentHeader, SectionCard, StatusLabel } from "@/components/ui/document-form";
import { ArrowLeft, Plus, Trash2, BookText, Scale, CheckCircle2, AlertTriangle } from "lucide-react";

interface AccountOption {
  id: string;
  accountCode: string;
  accountName: string;
}

interface JournalLine {
  id?: string;
  accountCode: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
}

interface JournalEntryFormProps {
  entryId?: string;
  companyId: string;
}

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  draft: "slate",
  posted: "blue",
  reversed: "red",
};

export function JournalEntryForm({ entryId, companyId }: JournalEntryFormProps) {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(!!entryId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [entryNumber, setEntryNumber] = useState("");
  const [docStatus, setDocStatus] = useState("draft");
  const [lines, setLines] = useState<JournalLine[]>([
    { accountCode: "", description: "", debitAmount: 0, creditAmount: 0 },
    { accountCode: "", description: "", debitAmount: 0, creditAmount: 0 },
  ]);

  const [formData, setFormData] = useState({
    entryDate: new Date().toISOString().split("T")[0],
    description: "",
  });

  const isPosted = docStatus === "posted";

  useEffect(() => {
    if (status === "authenticated") {
      fetchAccounts();
      if (entryId) {
        fetchEntry();
      } else {
        setLoading(false);
      }
    }
  }, [status]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/chart-of-accounts");
      if (res.ok) setAccounts(await res.json());
    } catch (err) {
      console.error("Error fetching accounts:", err);
    }
  };

  const fetchEntry = async () => {
    try {
      const res = await fetch(`/api/journal-entries/${entryId}`);
      if (res.ok) {
        const data = await res.json();
        setEntryNumber(data.entryNumber);
        setDocStatus(data.status);
        setFormData({
          entryDate: data.entryDate.split("T")[0],
          description: data.description || "",
        });
        if (data.lines?.length > 0) {
          setLines(
            data.lines.map((l: any) => ({
              id: l.id,
              accountCode: l.accountCode,
              description: l.description || "",
              debitAmount: Number(l.debitAmount),
              creditAmount: Number(l.creditAmount),
            }))
          );
        }
      }
    } catch (err) {
      console.error("Error fetching journal entry:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setLines(newLines);
  };

  const addLine = () => {
    setLines([...lines, { accountCode: "", description: "", debitAmount: 0, creditAmount: 0 }]);
  };

  const removeLine = (index: number) => {
    if (lines.length > 2) setLines(lines.filter((_, i) => i !== index));
  };

  const totalDebit = lines.reduce((sum, l) => sum + Number(l.debitAmount || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + Number(l.creditAmount || 0), 0);
  const isBalanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(price);

  const submitWithStatus = async (nextStatus: string) => {
    setSubmitting(true);
    setError(null);

    try {
      if (!isBalanced) throw new Error("Total debit and credit must be equal before saving");
      if (lines.some((l) => !l.accountCode)) throw new Error("Every line must have an account selected");

      const url = entryId ? `/api/journal-entries/${entryId}` : "/api/journal-entries";
      const method = entryId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...formData,
          status: nextStatus,
          lines: lines.map((l) => ({
            accountCode: l.accountCode,
            description: l.description,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save journal entry");
      }

      router.push("/finance/journal-entries");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving journal entry");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitWithStatus(docStatus === "posted" ? "posted" : "draft");
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-5xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft size={16} />
        Back to Journal Entries
      </button>

      <form onSubmit={handleSubmit}>
        <DocumentHeader
          icon={BookText}
          eyebrow="Journal Entry"
          title={entryId ? entryNumber : "New Journal Entry"}
          gradient="from-fuchsia-950 via-fuchsia-900 to-slate-900"
          badge={entryId && <StatusLabel label={docStatus} tone={STATUS_TONE[docStatus] || "slate"} />}
          actions={
            <div className="flex gap-2">
              {!isPosted && (
                <Button
                  type="button"
                  disabled={submitting || !isBalanced}
                  onClick={() => submitWithStatus("draft")}
                  variant="outline"
                >
                  Save Draft
                </Button>
              )}
              {!isPosted && (
                <Button
                  type="button"
                  disabled={submitting || !isBalanced}
                  onClick={() => submitWithStatus("posted")}
                 
                >
                  {submitting ? "Saving..." : "Post Entry"}
                </Button>
              )}
            </div>
          }
        />

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        )}

        {isPosted && (
          <div className="mb-6 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-sm text-fuchsia-800">
            This entry has been posted to the ledger and can no longer be edited.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard icon={BookText} title="Entry Information" accentColor="text-fuchsia-600">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="entryDate" className="text-xs text-slate-500">
                    Entry Date *
                  </Label>
                  <Input
                    id="entryDate"
                    name="entryDate"
                    type="date"
                    value={formData.entryDate}
                    onChange={handleChange}
                    required
                    disabled={isPosted}
                    className="rounded-lg"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="description" className="text-xs text-slate-500">
                    Description
                  </Label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    disabled={isPosted}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500 disabled:bg-slate-100"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              icon={Scale}
              title="Journal Lines"
              accentColor="text-fuchsia-600"
              action={
                !isPosted && (
                  <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1.5 rounded-lg">
                    <Plus size={14} />
                    Add Line
                  </Button>
                )
              }
            >
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="text-left px-2 py-2 font-medium w-48">Account</th>
                      <th className="text-left px-2 py-2 font-medium">Description</th>
                      <th className="text-right px-2 py-2 font-medium w-32">Debit</th>
                      <th className="text-right px-2 py-2 font-medium w-32">Credit</th>
                      <th className="text-center px-2 py-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/60">
                        <td className="px-2 py-1.5">
                          <select
                            value={line.accountCode}
                            onChange={(e) => handleLineChange(index, "accountCode", e.target.value)}
                            disabled={isPosted}
                            required
                            className="w-full h-9 rounded-lg border-0 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-fuchsia-500 disabled:bg-slate-100"
                          >
                            <option value="">Select account...</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.accountCode}>
                                {a.accountCode} — {a.accountName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={line.description}
                            onChange={(e) => handleLineChange(index, "description", e.target.value)}
                            placeholder="Line description"
                            disabled={isPosted}
                            className="border-0 shadow-none focus-visible:ring-1"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            value={line.debitAmount}
                            onChange={(e) => handleLineChange(index, "debitAmount", parseFloat(e.target.value) || 0)}
                            disabled={isPosted}
                            className="border-0 shadow-none text-right tabular-nums focus-visible:ring-1"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            value={line.creditAmount}
                            onChange={(e) => handleLineChange(index, "creditAmount", parseFloat(e.target.value) || 0)}
                            disabled={isPosted}
                            className="border-0 shadow-none text-right tabular-nums focus-visible:ring-1"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {!isPosted && lines.length > 2 && (
                            <button type="button" onClick={() => removeLine(index)} className="text-slate-400 hover:text-red-600">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-semibold">
                      <td className="px-2 py-2" colSpan={2}>
                        Total
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatPrice(totalDebit)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatPrice(totalCredit)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <div
              className={`border p-5 ${
                isBalanced ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <h3
                className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${
                  isBalanced ? "text-green-700" : "text-amber-700"
                }`}
              >
                {isBalanced ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {isBalanced ? "Balanced" : "Not Balanced"}
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Total Debit</dt>
                  <dd className="font-medium text-slate-900 tabular-nums">{formatPrice(totalDebit)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Total Credit</dt>
                  <dd className="font-medium text-slate-900 tabular-nums">{formatPrice(totalCredit)}</dd>
                </div>
                <div className="flex justify-between border-t border-black/5 pt-2">
                  <dt className="font-semibold text-slate-700">Difference</dt>
                  <dd className={`font-bold tabular-nums ${isBalanced ? "text-green-700" : "text-amber-700"}`}>
                    {formatPrice(Math.abs(totalDebit - totalCredit))}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        {!isPosted && (
          <div className="flex gap-3 justify-end mt-6">
            <Button type="button" variant="outline" onClick={() => router.push("/finance/journal-entries")} className="rounded-lg">
              Cancel
            </Button>
            <Button type="button" disabled={submitting || !isBalanced} onClick={() => submitWithStatus("draft")} variant="outline" className="rounded-lg">
              Save Draft
            </Button>
            <Button type="button" disabled={submitting || !isBalanced} onClick={() => submitWithStatus("posted")} className="rounded-lg">
              {submitting ? "Saving..." : "Post Entry"}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
