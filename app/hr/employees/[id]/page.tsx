"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { EmployeeForm } from "../form";

export default function EditEmployeePage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const employeeId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && employeeId) {
      fetch(`/api/employees/${employeeId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((e) => setCompanyId(e.companyId))
        .catch(() => router.push("/hr/employees"));
    }
  }, [status, employeeId, router]);

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
        <EmployeeForm employeeId={employeeId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
