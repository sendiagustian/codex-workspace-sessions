# Keputusan integrasi

Target MVP: sidebar per project, klik sesi membuka tab Codex asli bila integrasi tersedia, fallback detail lokal, pencarian, pin, dan refresh. Tidak ada penghapusan atau penulisan ulang data Codex.

Pemeriksaan 14 September 2026 pada extension resmi `openai.chatgpt` versi `26.908.40401` menemukan:

- Manifest menyediakan `chatgpt.openSidebar`, `chatgpt.newCodexPanel`, dan command lain, tetapi tidak menyediakan command publik untuk resume UUID tertentu.
- Registrasi custom editor memakai `chatgpt.conversationEditor`.
- URI editor menggunakan scheme `openai-codex`, authority `route`, dan path `/local/<UUID>`.
- Editor mengambil ID dari URI lalu memuat percakapan melalui provider milik Codex.

Integrasi dengan editor Codex memanggil API VS Code `vscode.openWith`. Tidak menyalin kode atau aset Codex, menambal extension resmi, membaca token, mengirim pesan internal webview, atau menggunakan API proposal VS Code. Kontrak URI milik Codex tetap tidak terdokumentasi dan bukan jaminan kompatibilitas resmi.

Mulai versi 0.1.1, navigasi editor memakai `workbench.action.newGroupRight` ketika belum ada grup khusus chat dan `workbench.action.lockEditorGroup` setelah tab Codex aktif. Grup yang hanya berisi tab Codex dipakai kembali; grup berisi file kode tidak dikunci. Klik yang berdekatan diproses berurutan agar tidak membuat beberapa split. Lock adalah fitur editor-group VS Code, bukan larangan memindahkan/menutup grup secara manual.

Allowlist versi berada di `src/services/codex-integration.ts`. Untuk menambahkan versi, periksa kembali kontrak editor dari instalasi resmi, jalankan tes host opsional terhadap sesi milik penguji, dan pastikan transcript serta interaksi UI melalui pengujian manual. Jangan memperluas allowlist semata-mata berdasarkan kemiripan nomor versi.

Sumber daftar sesi: header pertama `session_meta` pada rollout lokal, judul dari `session_index.jsonl`. Header harus berisi UUID yang sama dengan nama file dan `cwd` absolut yang sesuai folder aktif. Pencocokan Windows menerima drive case, slash, dan prefix extended path; POSIX case-sensitive. Symlink project tidak otomatis disamakan. Subfolder opsional, worktree tidak otomatis digabung.

Status aktif/unread tidak tersedia sebagai kontrak tepercaya, sehingga tidak ditampilkan. Tanggal aktivitas menggunakan mtime file serta timestamp metadata/index, bukan bukti bahwa agent masih berjalan.

Mulai 0.1.2, view Usage membaca snapshot `event_msg` → payload `token_count` → `rate_limits` dari maksimal lima rollout terbaru, masing-masing maksimal 1 MiB di bagian akhir. Hanya pool `limit_id: codex` (atau format lama tanpa ID) yang ditampilkan. `used_percent` berarti sudah terpakai, `window_minutes` menentukan label periode, dan `resets_at` dikonversi dari Unix seconds. Snapshot dipilih menurut timestamp event. Pada mode snapshot lokal: pergantian akun, aktivitas pada perangkat lain, dan event di luar batas pembacaan dapat membuat snapshot tertinggal. View mencantumkan waktu simpan dan tidak mengubah nilai menjadi nol saat waktu reset lewat.

Dokumentasi publik: [command Codex](https://learn.chatgpt.com/docs/developer-commands) dan [VS Code commands](https://code.visualstudio.com/api/extension-guides/command). Format rollout dan custom-editor URI di atas berasal dari inspeksi lokal, bukan dokumentasi API publik.

## Versi 0.1.3

- Panel sesi memakai WebviewView dengan search permanen. Judul masuk lewat textContent, CSP berbasis nonce, dan pesan hanya menerima action yang dikenal serta UUID anggota daftar. Action tetap diperiksa ulang oleh controller.
- Tombol + membuka route draft resmi yang teramati, /extension/panel/new, dalam grup chat terkunci. Tidak membuat UUID palsu atau mengirim prompt. Konteks folder mengikuti composer Codex di window aktif; pada multi-root, pengguna memilih folder di composer Codex.
- Reader hanya menampilkan rollout setelah event_msg dengan payload.type user_message. Role user pada response_item saja tidak cukup karena bisa berupa environment context. Pencarian event dibatasi 8 MiB; file berubah diperiksa ulang. (Aturan ini direvisi pada 0.1.4; lihat bagian di bawah.)
- Live usage memakai protokol publik initialize → initialized → account/rateLimits/read, melalui executable bawaan extension resmi yang versinya sudah diverifikasi. Hanya bucket codex yang dipakai; usedPercent tetap ditampilkan sebagai terpakai tanpa offset koreksi. Pembacaan lokal menjadi fallback berlabel.
- Proses dibatasi 10 detik/1 MiB, tanpa shell, tanpa stderr log, ditutup saat selesai atau akses dicabut. Tidak memanggil thread/start atau turn/start. Dokumentasi: [Codex app-server](https://learn.chatgpt.com/docs/app-server).

## Versi 0.1.4

Deteksi "chat sudah dimulai" pada 0.1.3 mengasumsikan giliran pengguna selalu tercatat sebagai `event_msg` dengan `payload.type` `user_message`. Asumsi itu tidak berlaku pada rollout yang ditulis Codex versi September 2026: pemeriksaan pada rollout nyata menemukan nol kemunculan `"type":"user_message"`, sementara giliran pengguna tercatat sebagai `response_item` dengan `payload.type` `message` dan `role` `user`. Akibatnya seluruh sesi dianggap belum dimulai dan daftar selalu kosong.

Reader sekarang menerima kedua bentuk tersebut. Konsekuensinya diterima secara sadar: pada format baru, blok konteks yang disuntikkan Codex juga memakai `role` `user`, sehingga sebuah sesi dapat muncul sesaat sebelum pengguna mengetik. Membedakan teks asli dari pembungkus sintetis akan bergantung pada pola tag internal Codex yang tidak terdokumentasi dan mudah berubah, sehingga tidak dilakukan.

## Versi 0.1.5 – 0.1.11

Perubahan tampilan sidebar saja; tidak ada perubahan pada pembacaan data atau kontrak integrasi. HTML, CSS, dan ikon webview dipindahkan dari literal TypeScript ke berkas terpisah di `media/webview/`. CSP tetap `default-src 'none'` dengan nonce karena CSS disisipkan ke dalam elemen `<style>`, bukan ditautkan; `localResourceRoots` dipersempit dari seluruh `media/` menjadi `media/webview/sessions`. Placeholder `{{token}}` diisi lewat fungsi pengganti sehingga nilai yang disisipkan tidak dipindai ulang, dan teks yang berasal dari data tetap di-escape.

## Versi 0.1.12

Satu kali refresh sebelumnya melukis panel Usage dua kali: snapshot lokal lebih dulu, lalu hasil app-server. Bila snapshot lokal tertinggal, persentase basi terlihat sekejap sebelum tergantikan. Saat live usage aktif, snapshot lokal tidak lagi dilukis lebih dulu; panel mempertahankan nilai sebelumnya sampai balasan akun tiba. Snapshot lokal tetap menjadi fallback bila app-server gagal, dan perilaku mode snapshot lokal tidak berubah.

## Struktur sumber

`src/` dibagi menjadi `model/` (bentuk data dan parsing), `services/` (akses berkas, integrasi Codex, app-server), `views/` (WebviewView dan penyedia dokumen), `controller/`, dan `util/`. Jalur berkas pada dokumen ini mengikuti pembagian tersebut.
