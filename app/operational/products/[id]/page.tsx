"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ProductForm } from "../form";

export default function EditProductPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && productId) {
      const fetchProductCompany = async () => {
        try {
          const res = await fetch(`/api/products/${productId}`);
          if (res.ok) {
            const product = await res.json();
            setCompanyId(product.companyId);
          } else {
            router.push("/operational/products");
          }
        } catch (err) {
          console.error("Error fetching product:", err);
          router.push("/operational/products");
        }
      };
      fetchProductCompany();
    }
  }, [status, productId, router]);

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
        <ProductForm productId={productId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
