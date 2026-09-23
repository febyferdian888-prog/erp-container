import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn("erp-spinning", className)} aria-hidden="true" />;
}
