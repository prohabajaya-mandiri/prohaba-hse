import { Prisma } from "@prisma/client";
export function serialize(value) {
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();
  if (Array.isArray(value)) return value.map(serialize);
  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !ArrayBuffer.isView(value)
  )
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)]),
    );
  return value;
}
