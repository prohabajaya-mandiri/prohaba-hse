import { pagination } from "./validation.js";
export async function pageQuery(searchParams) {
  const query = await searchParams;
  try {
    return pagination(new URLSearchParams({ page: query?.page ?? "1" }));
  } catch {
    return pagination(new URLSearchParams());
  }
}
