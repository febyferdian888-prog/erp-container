"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { BillForm } from "../form";

export default function EditBillPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const billId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && billId) {
      fetch(`/api/bills/${billId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((bill) => setCompanyId(bill.companyId))
        .catch(() => router.push("/supply-chain/bills"));
    }
  }, [status, billId, router]);

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
        <BillForm billId={billId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
