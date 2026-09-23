"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ChartOfAccountForm } from "../form";

export default function EditChartOfAccountPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const accountId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && accountId) {
      fetch(`/api/chart-of-accounts/${accountId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((a) => setCompanyId(a.companyId))
        .catch(() => router.push("/finance/chart-of-accounts"));
    }
  }, [status, accountId, router]);

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
        <ChartOfAccountForm accountId={accountId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
