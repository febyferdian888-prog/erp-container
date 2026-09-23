"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PriceInquiryForm } from "../form";

export default function NewPriceInquiryPage() {
  const { status } = useSession();
  const router = useRouter();
  const [companyId, setCompanyId] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status === "authenticated") {
      fetch("/api/companies")
        .then((r) => (r.ok ? r.json() : []))
        .then((c) => setCompanyId(c[0]?.id || ""))
        .catch(() => {});
    }
  }, [status, router]);

  return (
    <DashboardLayout>
      <div className="py-6">{companyId ? <PriceInquiryForm companyId={companyId} /> : <div className="py-8 text-center">Memuat…</div>}</div>
    </DashboardLayout>
  );
}
