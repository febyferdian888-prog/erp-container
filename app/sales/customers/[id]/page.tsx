"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { CustomerForm } from "../form";

export default function EditCustomerPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const customerId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && customerId) {
      const fetchCustomerCompany = async () => {
        try {
          const res = await fetch(`/api/customers/${customerId}`);
          if (res.ok) {
            const customer = await res.json();
            setCompanyId(customer.companyId);
          } else {
            router.push("/sales/customers");
          }
        } catch (err) {
          console.error("Error fetching customer:", err);
          router.push("/sales/customers");
        }
      };
      fetchCustomerCompany();
    }
  }, [status, customerId, router]);

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
        <CustomerForm customerId={customerId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
