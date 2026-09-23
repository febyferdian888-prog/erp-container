"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { LeaveForm } from "../form";

export default function EditLeavePage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const leaveId = params.id as string;

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
        <LeaveForm leaveId={leaveId} />
      </div>
    </DashboardLayout>
  );
}
