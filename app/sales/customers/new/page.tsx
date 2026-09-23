"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { CustomerForm } from "../form";

export default function NewCustomerPage() {
  const { status } = useSession();
  const router = useRouter();
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  // Get company ID from session (PT-A for now)
  useEffect(() => {
    if (status === "authenticated") {
      // For now, hardcode PT-A. In future, add company selector
      const getCompanyId = async () => {
        try {
          const res = await fetch("/api/companies");
          if (res.ok) {
            const companies = await res.json();
            if (companies.length > 0) {
              setCompanyId(companies[0].id);
            }
          }
        } catch (err) {
          console.error("Error fetching companies:", err);
        }
      };
      getCompanyId();
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
        <CustomerForm companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
