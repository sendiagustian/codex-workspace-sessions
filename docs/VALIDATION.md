# Hasil verifikasi lokal

Diperiksa 24 September 2026 pada Windows x64, VS Code 1.139.0, dan OpenAI Codex extension 26.917.62051.

| Pemeriksaan | Hasil |
| --- | --- |
| Unit dan regression tests | 35 lulus, 0 gagal |
| TypeScript strict | Lulus |
| ESLint | Lulus |
| VS Code Extension Host | Aktivasi, command, tindakan saat akses nonaktif, panel sesi dan search, dan content provider lulus |
| Draft baru | Route composer native berhasil dibuka di grup chat yang sama tanpa prompt; filter draft diuji memakai response_item role user dan event user_message sintetis |
| Tab Codex asli | Custom editor terbuka dengan UUID sesi yang dipilih; tidak mengirim prompt |
| Split menuju sidebar dan lock | Grup chat terpisah dari file utama, klik ulang memakai grup yang sama, file kode baru dibuka di luar grup chat |
| Usage | Registrasi webview lulus di VS Code asli; pembacaan akun langsung melalui app-server berhasil; periode 300/10080 menit tervalidasi; fallback lokal tetap diuji |
| Data lokal project ini | Sesi aktif ditemukan, tanpa warning; scan awal 129 ms pada riwayat lokal saat pemeriksaan |
| Aislop 0.16.1 | 100/100, 0 errors, 0 warnings; npm audit internal tidak dapat menemukan npm di lingkungan Windows ini |
| Audit VSIX | 37 file sesuai allowlist; data sesi, kredensial, fixture, node_modules, dan source map tidak ikut |
| npm audit | 0 vulnerabilities |
| Instalasi VSIX | Tidak diulang setelah paket 0.1.16 dibuat |

Aislop melaporkan informasi bahwa subprocess `npm audit` tidak dapat ditemukan di Windows (`spawn npm ENOENT`). `npm audit` dijalankan sendiri dan berhasil. File mentah lokal: `artifacts/aislop.json` dan `artifacts/host-test.json`; direktori artifacts tidak masuk VSIX.

Artefak: `dist/build/codex-workspace-sessions-0.1.16.vsix`

Checksum dapat diperiksa dengan `Get-FileHash dist/build/codex-workspace-sessions-0.1.16.vsix -Algorithm SHA256`.

Tes host dijalankan dari terminal biasa. Bila dijalankan dari proses extension host VS Code, variabel `ELECTRON_RUN_AS_NODE=1` diwariskan ke child process sehingga `Code.exe` berjalan sebagai Node dan tes gagal dengan `bad option: --user-data-dir`; ini kondisi lingkungan, bukan kegagalan extension.

Batas verifikasi: tes tab memeriksa custom editor serta UUID tujuannya, bukan isi transcript setelah login/loading. UI macOS/Linux, remote/WSL dan versi Codex lain belum diuji langsung; CI lintas OS tersedia, tetapi belum dijalankan di server CI. Tidak ada klaim bebas dari seluruh bug. Publisher Marketplace, repository publik, screenshot listing, dan publikasi final belum diselesaikan. Panduan rilis disimpan sebagai catatan internal dan tidak ikut distribusi.

Validasi visual sidebar di browser lokal tidak dijalankan: kebijakan browser memblokir URL file lokal. Tata letak sidebar 0.1.5 – 0.1.11 diverifikasi manual di VS Code Windows melalui pemasangan VSIX berulang, bukan lewat tes otomatis. Aktivasi WebviewView dan routing diuji di Extension Host asli; CSP, pesan webview, dan pencarian diuji otomatis. Isi composer serta pilihan folder multi-root tetap memerlukan pemeriksaan manual di VS Code. Ikon PNG 256 × 256 telah diperiksa secara visual.
