"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PurchaseRequestForm } from "../form";

export default function EditPurchaseRequestPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const prId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && prId) {
      fetch(`/api/purchase-requests/${prId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((pr) => setCompanyId(pr.companyId))
        .catch(() => router.push("/supply-chain/purchase-requests"));
    }
  }, [status, prId, router]);

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
        <PurchaseRequestForm prId={prId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
