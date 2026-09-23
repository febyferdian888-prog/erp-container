"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { BomForm } from "../form";

export default function EditBomPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const bomId = params.id as string;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <DashboardLayout>
        <div className="text-center py-8">Loading...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="py-6">
        <BomForm bomId={bomId} />
      </div>
    </DashboardLayout>
  );
}
