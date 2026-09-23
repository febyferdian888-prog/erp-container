"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PurchaseOrderForm } from "../form";

export default function EditPurchaseOrderPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const poId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && poId) {
      fetch(`/api/purchase-orders/${poId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((po) => setCompanyId(po.companyId))
        .catch(() => router.push("/supply-chain/purchase-orders"));
    }
  }, [status, poId, router]);

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
        <PurchaseOrderForm poId={poId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
