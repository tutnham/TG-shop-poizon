export function formatRub(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}

export function formatUsdt(n: number): string {
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} USDT`;
}
