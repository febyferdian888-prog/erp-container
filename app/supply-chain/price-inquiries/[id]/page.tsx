"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PriceInquiryForm } from "../form";

export default function EditPriceInquiryPage() {
  const { status } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [companyId, setCompanyId] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/login");
    if (status === "authenticated" && id) {
      fetch(`/api/price-inquiries/${id}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => setCompanyId(d.companyId))
        .catch(() => router.push("/supply-chain/price-inquiries"));
    }
  }, [status, id, router]);

  return (
    <DashboardLayout>
      <div className="py-6">{companyId ? <PriceInquiryForm inquiryId={id} companyId={companyId} /> : <div className="py-8 text-center">Memuat…</div>}</div>
    </DashboardLayout>
  );
}
