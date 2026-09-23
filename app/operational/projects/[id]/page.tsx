"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { ProjectForm } from "../form";

export default function EditProjectPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [companyId, setCompanyId] = useState<string>("");

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
      <div className="py-6">
        <ProjectForm projectId={projectId} companyId={companyId} />
      </div>
    </DashboardLayout>
  );
}
