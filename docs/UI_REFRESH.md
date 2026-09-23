# Penyegaran UI ERP

Arahan pengguna: fresh, minimalis, elegan; pertahankan logo PT yang sudah dipasang.

## Keputusan desain

- ENERGY 1 / RHYTHM 2 / MOTION 1: ruang kerja tenang, hierarki dokumen jelas, transisi hanya untuk interaksi.
- Putih hangat dan charcoal mendukung pembacaan dokumen sepanjang hari; tema terang tetap agar formulir dan dokumen cetak konsisten.
- Merah mengikuti identitas MDA. Warna tombol #c52630 lebih gelap daripada logo untuk menjaga kontras teks putih.
- Geist yang sudah terpasang digunakan untuk keterbacaan label kecil dan angka; hapus override Arial yang menghalangi font proyek.
- Ringkasan empat angka dikelompokkan dalam satu bidang agar dapat dibandingkan; daftar dokumen memiliki ruang lebih luas daripada panel keuangan.
- Panel charcoal menonjolkan piutang dan utang yang perlu ditindaklanjuti, bukan status teknis aplikasi.
- Sudut 12px membedakan bidang informasi dari kontrol 7px; bayangan hanya pada popover akun karena berada di atas konten.
- Ikon navigasi lama dipertahankan untuk pengenalan modul; warna ikon netral menjaga fokus pada label dan tindakan utama.
- Logo asli, aksen merah, serta pengurutan dokumen pengadaan memberi identitas ERP MDA. Tidak ada ilustrasi atau angka rekaan.
- Jarak 30–36px memisahkan bagian; jarak 6–12px menghubungkan judul dengan detailnya.

## Sumber data dan batas cakupan

Dashboard membaca GET /api/reports/dashboard, memakai scope seluruh periode dan semua perusahaan yang dapat diakses akun, sesuai endpoint yang sudah ada.
Jumlah pesanan bukan jumlah pesanan aktif; jumlah proyek mencakup semua status. Nilai dokumen mengikuti subtotal endpoint, bukan klaim pendapatan bulanan.
Piutang dan utang mengikuti perhitungan endpoint yang ada. Tidak ada perubahan schema, data, atau API backend.
Angka nol hanya ditampilkan setelah respons berhasil. Loading, kegagalan, dan data kosong dibedakan.

Komponen bersama yang diperbarui: sidebar, header, footer, kartu, tombol, input, tipografi, dan focus ring. Isi setiap formulir/modul tidak dirancang ulang pada perubahan ini.

## Kontras terhitung (WCAG)

| Pasangan | Rasio |
| --- | --- |
| #62676d pada #f6f6f3 | 5.27:1 |
| #62676d pada putih | 5.71:1 |
| Putih pada #c52630 | 5.68:1 |
| #aa202b pada #fcebed | 6.18:1 |
| #c4c8cc pada #2c3034 | 7.90:1 |
| Border input #858b94 pada putih | 3.43:1 |

## Verifikasi

- TypeScript: lulus `npx tsc --noEmit --incremental false`.
- Browser: halaman login lokal dimuat; pemeriksaan dashboard menunggu sesi login lokal pengguna.
- Deployment: belum dilakukan; website online masih menggunakan versi sebelumnya.

## Catatan pergantian AI

Jangan menimpa perubahan Claude yang sudah ada sebelum penyegaran UI ini.
Next dev sempat mengganti blok AGENTS.md yang dikelolanya dan menghapus pointer Anti Slop di dalam blok. Pointer dipulihkan di luar blok otomatis agar tetap tersimpan pada startup berikutnya.
