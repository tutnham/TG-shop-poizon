export function formatRub(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;
}

export function formatUsdt(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} USDT`;
}
