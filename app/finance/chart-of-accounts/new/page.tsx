"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ChartOfAccountForm } from "../form";

export default function NewChartOfAccountPage() {
  const { status } = useSession();
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/companies")
        .then((res) => (res.ok ? res.json() : []))
        .then((companies) => {
          if (companies.length > 0) setCompanyId(companies[0].id);
        })
        .catch((err) => console.error("Error fetching companies:", err));
    }
  }, [status]);

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
        <ChartOfAccountForm companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
