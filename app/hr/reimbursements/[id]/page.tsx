"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ReimbursementForm } from "../form";

export default function EditReimbursementPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const reimbursementId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && reimbursementId) {
      fetch(`/api/reimbursements/${reimbursementId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((r) => setCompanyId(r.employee?.companyId || ""))
        .catch(() => router.push("/hr/reimbursements"));
    }
  }, [status, reimbursementId, router]);

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
        <ReimbursementForm reimbursementId={reimbursementId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
