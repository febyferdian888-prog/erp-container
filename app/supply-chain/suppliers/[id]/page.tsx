"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { SupplierForm } from "../form";

export default function EditSupplierPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const supplierId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && supplierId) {
      const fetchSupplierCompany = async () => {
        try {
          const res = await fetch(`/api/suppliers/${supplierId}`);
          if (res.ok) {
            const supplier = await res.json();
            setCompanyId(supplier.companyId);
          } else {
            router.push("/supply-chain/suppliers");
          }
        } catch (err) {
          console.error("Error fetching supplier:", err);
          router.push("/supply-chain/suppliers");
        }
      };
      fetchSupplierCompany();
    }
  }, [status, supplierId, router]);

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
        <SupplierForm supplierId={supplierId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
