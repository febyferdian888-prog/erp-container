"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { SalesOrderForm } from "../form";

export default function EditSalesOrderPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const soId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && soId) {
      fetch(`/api/sales-orders/${soId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((so) => setCompanyId(so.companyId))
        .catch(() => router.push("/sales/orders"));
    }
  }, [status, soId, router]);

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
        <SalesOrderForm soId={soId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
