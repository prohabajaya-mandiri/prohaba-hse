// Pemetaan bingkai di layar ke piksel foto untuk memotong KTP (aman dipakai client & server).

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
