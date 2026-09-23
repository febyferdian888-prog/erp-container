"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { DeliveryForm } from "../form";

export default function EditDeliveryPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const deliveryId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && deliveryId) {
      fetch(`/api/deliveries/${deliveryId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((d) => setCompanyId(d.companyId))
        .catch(() => router.push("/sales/delivery"));
    }
  }, [status, deliveryId, router]);

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
        <DeliveryForm deliveryId={deliveryId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
