"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

interface ChartOfAccountFormProps {
  accountId?: string;
  companyId: string;
}

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"];

export function ChartOfAccountForm({ accountId, companyId }: ChartOfAccountFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(!!accountId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    accountCode: "",
    accountName: "",
    accountType: "Asset",
    isActive: true,
  });

  useEffect(() => {
    if (accountId) fetchAccount();
  }, [accountId]);

  const fetchAccount = async () => {
    try {
      const res = await fetch(`/api/chart-of-accounts/${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          accountCode: data.accountCode,
          accountName: data.accountName,
          accountType: data.accountType,
          isActive: data.isActive,
        });
      }
    } catch (err) {
      console.error("Error fetching account:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const url = accountId ? `/api/chart-of-accounts/${accountId}` : "/api/chart-of-accounts";
      const method = accountId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...formData }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save account");
      }

      router.push("/finance/chart-of-accounts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving account");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
      >
        <ArrowLeft size={16} />
        Back to Chart of Accounts
      </button>

      <Card className="border-none">
        <CardHeader>
          <CardTitle>{accountId ? "Edit Account" : "Add New Account"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="accountCode" className="text-xs text-slate-500">
                  Account Code *
                </Label>
                <Input
                  id="accountCode"
                  name="accountCode"
                  placeholder="1000"
                  value={formData.accountCode}
                  onChange={handleChange}
                  required
                  disabled={!!accountId}
                  className="rounded-lg font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="accountType" className="text-xs text-slate-500">
                  Account Type *
                </Label>
                <select
                  id="accountType"
                  name="accountType"
                  value={formData.accountType}
                  onChange={handleChange}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="accountName" className="text-xs text-slate-500">
                Account Name *
              </Label>
              <Input
                id="accountName"
                name="accountName"
                placeholder="e.g., Kas Besar, Piutang Usaha"
                value={formData.accountName}
                onChange={handleChange}
                required
                className="rounded-lg"
              />
            </div>

            <div className="flex gap-3 border-t pt-6">
              <Button type="button" variant="outline" onClick={() => router.push("/finance/chart-of-accounts")} className="rounded-lg">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="rounded-lg">
                {submitting ? "Saving..." : accountId ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
