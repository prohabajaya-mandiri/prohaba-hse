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
