"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { matchPart, normPart } from "@/lib/part-match";

interface Prod {
  sku: string;
  name: string;
}

let cache: Prod[] | null = null;
let inflight: Promise<Prod[]> | null = null;

function loadProducts(): Promise<Prod[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Prod[]) => (cache = rows.map((p) => ({ sku: p.sku, name: p.name }))))
      .catch(() => [])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function PartNumberField({
  value,
  onChange,
  className,
  placeholder = "Part no.",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [products, setProducts] = useState<Prod[]>(cache || []);
  useEffect(() => {
    loadProducts().then(setProducts);
  }, []);

  const candidates = useMemo(() => products.map((p) => ({ partNumber: p.sku, source: "master" as const, label: p.name })), [products]);
  const part = value.trim();
  const registered = part ? products.find((p) => normPart(p.sku) === normPart(part)) : null;
  const match = useMemo(() => (part && !registered && products.length ? matchPart(part, candidates) : null), [part, registered, products.length, candidates]);
  const refs = match ? (match.canonical ? [{ partNumber: match.canonical, label: undefined }] : match.suggestions) : [];

  return (
    <div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list="registered-parts"
        placeholder={placeholder}
        className={className}
      />
      {part && registered && <p className="mt-0.5 truncate text-[10px] text-emerald-700">Terdaftar: {registered.name}</p>}
      {part && !registered && products.length > 0 && (
        <div className="mt-0.5 text-[10px] leading-tight text-amber-700">
          <span>Belum terdaftar.</span>
          {refs.length > 0 && (
            <span>
              {" "}Mirip:{" "}
              {refs.map((r, i) => (
                <button key={r.partNumber} type="button" className="mr-1 underline" onClick={() => onChange(r.partNumber)}>
                  {r.partNumber}
                  {i < refs.length - 1 ? "," : ""}
                </button>
              ))}
            </span>
          )}{" "}
          <Link href={`/operational/products/new?sku=${encodeURIComponent(part)}`} target="_blank" className="underline">
            Daftarkan
          </Link>
        </div>
      )}
      {!part && <p className="mt-0.5 text-[10px] text-slate-400">Wajib, pilih dari master</p>}
      <datalist id="registered-parts">
        {products.slice(0, 800).map((p) => (
          <option key={p.sku} value={p.sku}>
            {p.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}
