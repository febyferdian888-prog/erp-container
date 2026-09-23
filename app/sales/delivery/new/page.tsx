"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { DeliveryForm } from "../form";

export default function NewDeliveryPage() {
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
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((companies) => setCompanyId(companies[0]?.id || ""))
        .catch(() => {});
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
        <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
          <DeliveryForm companyId={companyId} />
        </Suspense>
      </div>
    </DashboardLayout>
  );
}
