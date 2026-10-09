/**
 * Shared "active order" definition for Sales Orders, used by both the
 * director dashboard and the Sales Orders list so the two numbers never
 * disagree again (Tahap 1 audit part B: the dashboard read Rp1,227,000 for 1
 * active order while /sales/orders showed Rp2,836,287,015 for "active",
 * which actually summed every order regardless of status).
 *
 * The definition itself now lives in lib/so-progress.ts, not here: an order
 * is active while its computed progress key is anything but "done" (Tahap 5
 * audit — the old `status: in [confirmed, partially_delivered, delivered]`
 * filter undercounted, because the `status` column can sit at "draft"
 * indefinitely while real procurement work is already happening on the
 * order; nothing in the codebase ever transitions it to "confirmed"). Both
 * consumers call loadSoProgress()/deriveSoProgress() directly and filter on
 * `progress.key !== "done"` rather than importing a status list from here.
 */
export const ACTIVE_ORDER_VALUE_LABEL = "Nilai pesanan aktif";
export const ACTIVE_ORDER_VALUE_HINT =
  "Total nilai pesanan yang belum selesai (progres: perlu diproses purchasing, menunggu barang, siap kirim, kirim sebagian, menunggu invoice, atau waiting delivery). Tidak termasuk pesanan yang sudah selesai atau dibatalkan.";
