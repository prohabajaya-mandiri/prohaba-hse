export async function apiFetch(input, init) {
  const response = await globalThis.fetch(input, init);
  if (!response.ok) {
    let data;
    try {
      data = await response.clone().json();
    } catch {}
    const error = new Error(data?.error ?? "Permintaan gagal (" + response.status + ").");
    error.status = response.status;
    throw error;
  }
  return response;
}
