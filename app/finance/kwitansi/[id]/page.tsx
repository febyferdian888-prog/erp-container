"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { KwitansiForm } from "../form";

export default function EditKwitansiPage() {
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
      fetch(`/api/payments/${paymentId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((payment) => setCompanyId(payment.companyId))
        .catch(() => router.push("/finance/kwitansi"));
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
        <KwitansiForm paymentId={paymentId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
