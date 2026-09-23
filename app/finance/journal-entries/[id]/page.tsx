"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { JournalEntryForm } from "../form";

export default function EditJournalEntryPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const entryId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && entryId) {
      fetch(`/api/journal-entries/${entryId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((e) => setCompanyId(e.companyId))
        .catch(() => router.push("/finance/journal-entries"));
    }
  }, [status, entryId, router]);

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
        <JournalEntryForm entryId={entryId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
