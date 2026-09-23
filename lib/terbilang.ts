const ONES = [
  "", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan",
  "Sepuluh", "Sebelas", "Dua Belas", "Tiga Belas", "Empat Belas", "Lima Belas",
  "Enam Belas", "Tujuh Belas", "Delapan Belas", "Sembilan Belas",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const rest = n % 10;
  return `${ONES[tens]} Puluh${rest ? " " + ONES[rest] : ""}`;
}

function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const prefix = hundreds === 1 ? "Seratus" : `${ONES[hundreds]} Ratus`;
  return `${prefix}${rest ? " " + twoDigits(rest) : ""}`;
}

function groupToWords(n: number, scale: string): string {
  if (n === 0) return "";
  if (scale === "Ribu" && n === 1) return "Seribu";
  return `${threeDigits(n)} ${scale}`.trim();
}

/** Converts a non-negative integer into Indonesian words. */
export function numberToWordsID(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "Nol";

  const trillions = Math.floor(n / 1_000_000_000_000);
  const billions = Math.floor((n % 1_000_000_000_000) / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const hundreds = n % 1_000;

  const parts = [
    groupToWords(trillions, "Triliun"),
    groupToWords(billions, "Miliar"),
    groupToWords(millions, "Juta"),
    groupToWords(thousands, "Ribu"),
    hundreds ? threeDigits(hundreds) : "",
  ].filter(Boolean);

  return parts.join(" ");
}

/** Formats an amount as Indonesian terbilang for a Rupiah quotation, e.g. "Dua Puluh Dua Juta Dua Ratus Ribu Rupiah". */
export function terbilangRupiah(amount: number): string {
  return `${numberToWordsID(amount)} Rupiah`;
}
