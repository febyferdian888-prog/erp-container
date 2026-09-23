"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { RfqForm } from "../form";

export default function EditRFQPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const rfqId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && rfqId) {
      fetch(`/api/rfqs/${rfqId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((r) => setCompanyId(r.companyId))
        .catch(() => router.push("/sales/rfq"));
    }
  }, [status, rfqId, router]);

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
        <RfqForm rfqId={rfqId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
