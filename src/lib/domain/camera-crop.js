// Pemetaan bingkai di layar ke piksel video untuk memotong foto (aman dipakai client & server).

/**
 * Video ditampilkan dengan object-fit: cover di `view` ({left, top, width, height}, piksel CSS).
 * Kembalikan area sumber {sx, sy, sw, sh} (piksel video) yang tampil di dalam `frame`,
 * diperlebar `margin` (proporsi) di tiap sisi dan dibatasi ke ukuran video.
 */
export function coverCrop(view, frame, videoWidth, videoHeight, margin = 0) {
  const scale = Math.max(view.width / videoWidth, view.height / videoHeight);
  const offX = (view.width - videoWidth * scale) / 2;
  const offY = (view.height - videoHeight * scale) / 2;
  let sx = (frame.left - view.left - offX) / scale;
  let sy = (frame.top - view.top - offY) / scale;
  let sw = frame.width / scale;
  let sh = frame.height / scale;
  sx -= sw * margin; sy -= sh * margin;
  sw *= 1 + 2 * margin; sh *= 1 + 2 * margin;
  const x0 = Math.max(0, sx), y0 = Math.max(0, sy);
  const x1 = Math.min(videoWidth, sx + sw), y1 = Math.min(videoHeight, sy + sh);
  return { sx: x0, sy: y0, sw: Math.max(0, x1 - x0), sh: Math.max(0, y1 - y0) };
}

/**
 * Potong gambar yang digeser/di-zoom pengguna di bawah bingkai.
 * Gambar (iw × ih piksel) tampil dengan pojok kiri-atas di (imgLeft, imgTop) dan skala `scale`;
 * `frame` = posisi bingkai pada sistem koordinat yang sama. Hasil: kanvas outW × outH berisi isi
 * bingkai. Bagian bingkai di luar gambar dibiarkan kosong (sumber & tujuan dipotong bersama).
 */
export function frameCrop({ frame, imgLeft, imgTop, scale, iw, ih }, outW) {
  const outH = Math.round(outW * (frame.height / frame.width));
  const k = outW / frame.width; // piksel keluaran per piksel layar
  // Area bingkai dalam koordinat gambar asli.
  const fx = (frame.left - imgLeft) / scale, fy = (frame.top - imgTop) / scale;
  const fw = frame.width / scale, fh = frame.height / scale;
  const sx = Math.max(0, fx), sy = Math.max(0, fy);
  const ex = Math.min(iw, fx + fw), ey = Math.min(ih, fy + fh);
  const sw = Math.max(0, ex - sx), sh = Math.max(0, ey - sy);
  return {
    outW, outH, sx, sy, sw, sh,
    dx: (sx - fx) * scale * k, dy: (sy - fy) * scale * k,
    dw: sw * scale * k, dh: sh * scale * k,
  };
}

/** Skala & posisi awal: gambar menutupi bingkai penuh dan berada di tengahnya. */
export function coverFit(frame, iw, ih) {
  const scale = Math.max(frame.width / iw, frame.height / ih);
  return { scale, imgLeft: frame.left + (frame.width - iw * scale) / 2, imgTop: frame.top + (frame.height - ih * scale) / 2 };
}
