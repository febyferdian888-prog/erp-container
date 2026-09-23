"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { GoodsReceiptForm } from "../form";

export default function ViewGoodsReceiptPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const grId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && grId) {
      fetch(`/api/goods-receipts/${grId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((gr) => setCompanyId(gr.companyId))
        .catch(() => router.push("/supply-chain/goods-receipts"));
    }
  }, [status, grId, router]);

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
        <GoodsReceiptForm grId={grId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
