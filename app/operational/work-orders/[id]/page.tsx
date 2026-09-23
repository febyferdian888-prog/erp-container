"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { WorkOrderForm } from "../form";

export default function EditWorkOrderPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const woId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && woId) {
      fetch(`/api/work-orders/${woId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((wo) => setCompanyId(wo.companyId))
        .catch(() => router.push("/operational/work-orders"));
    }
  }, [status, woId, router]);

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
        <WorkOrderForm woId={woId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
