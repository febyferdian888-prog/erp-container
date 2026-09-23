"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { WarehouseForm } from "../form";

export default function EditWarehousePage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const warehouseId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && warehouseId) {
      fetch(`/api/warehouses/${warehouseId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((w) => setCompanyId(w.companyId))
        .catch(() => router.push("/supply-chain/warehouses"));
    }
  }, [status, warehouseId, router]);

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
        <WarehouseForm warehouseId={warehouseId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
