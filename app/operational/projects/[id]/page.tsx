"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ProjectForm } from "../form";
import { ProjectOverview } from "./overview";

export default function EditProjectPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");
  const [tab, setTab] = useState<"overview" | "edit">("overview");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && projectId) {
      fetch(`/api/projects/${projectId}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((p) => setCompanyId(p.companyId))
        .catch(() => router.push("/operational/projects"));
    }
  }, [status, projectId, router]);

  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8">Loading...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="py-6 max-w-5xl mx-auto">
        <div className="flex gap-2 mb-4 border-b" style={{ borderColor: "#E4E7EC" }}>
          <button
            className="px-3 py-2 text-sm font-medium"
            style={{ color: tab === "overview" ? "var(--primary)" : "var(--neutral-600)", borderBottom: tab === "overview" ? "2px solid var(--primary)" : "2px solid transparent" }}
            onClick={() => setTab("overview")}
          >
            Ringkasan
          </button>
          <button
            className="px-3 py-2 text-sm font-medium"
            style={{ color: tab === "edit" ? "var(--primary)" : "var(--neutral-600)", borderBottom: tab === "edit" ? "2px solid var(--primary)" : "2px solid transparent" }}
            onClick={() => setTab("edit")}
          >
            Edit proyek
          </button>
        </div>
        {tab === "overview" ? <ProjectOverview projectId={projectId} /> : <ProjectForm projectId={projectId} companyId={companyId} />}
      </div>
    </DashboardLayout>
  );
}
