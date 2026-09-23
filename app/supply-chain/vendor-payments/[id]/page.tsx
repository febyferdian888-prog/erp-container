"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { VendorPaymentForm } from "../form";

export default function EditVendorPaymentPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const paymentId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && paymentId) {
      fetch(`/api/vendor-payments/${paymentId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((p) => setCompanyId(p.companyId))
        .catch(() => router.push("/supply-chain/vendor-payments"));
    }
  }, [status, paymentId, router]);

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
        <VendorPaymentForm paymentId={paymentId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
