"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { InvoiceForm } from "../form";

export default function EditInvoicePage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && invoiceId) {
      fetch(`/api/invoices/${invoiceId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((invoice) => setCompanyId(invoice.companyId))
        .catch(() => router.push("/finance/invoices"));
    }
  }, [status, invoiceId, router]);

  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8">Loading...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="py-6">
        <InvoiceForm invoiceId={invoiceId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
