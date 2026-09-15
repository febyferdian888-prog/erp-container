"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { QuotationForm } from "../form";

export default function EditQuotationPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const quotationId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && quotationId) {
      const fetchQuotationCompany = async () => {
        try {
          const res = await fetch(`/api/quotations/${quotationId}`);
          if (res.ok) {
            const quotation = await res.json();
            setCompanyId(quotation.companyId);
          } else {
            router.push("/sales/quotations");
          }
        } catch (err) {
          console.error("Error fetching quotation:", err);
          router.push("/sales/quotations");
        }
      };
      fetchQuotationCompany();
    }
  }, [status, quotationId, router]);

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
        <QuotationForm quotationId={quotationId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
