import ru from "./ru.json";

const dict: Record<string, string> = ru;

export function t(key: string): string {
  return dict[key] ?? key;
}
