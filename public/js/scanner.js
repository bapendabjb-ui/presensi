/* ============================================================
   scanner.js — pemindai QR lewat kamera.
   Memakai BarcodeDetector bawaan browser bila tersedia (lebih hemat
   CPU), dan jatuh ke jsQR untuk browser yang belum mendukungnya.
   ============================================================ */
(function () {
  class QrScanner {
    /**
     * @param {HTMLVideoElement} video
     * @param {(code: string) => void} onDetect
     * @param {{ cooldown?: number }} options  cooldown = jeda ms sebelum kode sama diproses lagi
     */
    constructor(video, onDetect, options = {}) {
      this.video = video;
      this.onDetect = onDetect;
      this.cooldown = options.cooldown ?? 2500;

      this.stream = null;
      this.detector = null;
      this.raf = null;
      this.running = false;
      this.lastCode = null;
      this.lastAt = 0;

      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    }

    static async listCameras() {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput");
    }

    async start(deviceId) {
      if (this.running) await this.stop();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Browser ini tidak mendukung akses kamera.");
      }

      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        throw new Error(this.explain(err));
      }

      this.video.srcObject = this.stream;
      this.video.setAttribute("playsinline", "true");
      await this.video.play();

      if ("BarcodeDetector" in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes("qr_code")) {
            this.detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          }
        } catch {
          this.detector = null;
        }
      }

      this.running = true;
      this.loop();
    }

    explain(err) {
      const map = {
        NotAllowedError: "Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser.",
        NotFoundError: "Kamera tidak ditemukan pada perangkat ini.",
        NotReadableError: "Kamera sedang dipakai aplikasi lain.",
        OverconstrainedError: "Kamera yang dipilih tidak tersedia.",
      };
      // getUserMedia hanya jalan di HTTPS atau localhost.
      if (!window.isSecureContext) {
        return "Kamera hanya bisa diakses lewat HTTPS atau localhost.";
      }
      return map[err.name] || "Gagal membuka kamera: " + err.message;
    }

    async stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      if (this.video) this.video.srcObject = null;
    }

    /** Terima kode bila belum pernah dibaca atau cooldown-nya sudah lewat. */
    accept(code) {
      const now = Date.now();
      if (code === this.lastCode && now - this.lastAt < this.cooldown) return;
      this.lastCode = code;
      this.lastAt = now;
      this.onDetect(code);
    }

    /** Paksa kode berikutnya diterima walau sama (dipakai setelah reset manual). */
    resetCooldown() {
      this.lastCode = null;
      this.lastAt = 0;
    }

    async loop() {
      if (!this.running) return;

      if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
        try {
          if (this.detector) {
            const found = await this.detector.detect(this.video);
            if (found.length && found[0].rawValue) this.accept(found[0].rawValue.trim());
          } else if (window.jsQR) {
            const w = this.video.videoWidth;
            const h = this.video.videoHeight;
            if (w && h) {
              // Pindai versi kecil saja — cukup untuk QR dan jauh lebih ringan.
              const scale = Math.min(1, 640 / w);
              this.canvas.width = Math.round(w * scale);
              this.canvas.height = Math.round(h * scale);
              this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
              const image = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
              const result = window.jsQR(image.data, image.width, image.height, {
                inversionAttempts: "dontInvert",
              });
              if (result?.data) this.accept(result.data.trim());
            }
          }
        } catch {
          /* frame gagal dibaca — lanjut ke frame berikutnya */
        }
      }

      this.raf = requestAnimationFrame(() => this.loop());
    }
  }

  window.QrScanner = QrScanner;
})();
