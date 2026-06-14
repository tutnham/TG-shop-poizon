/** Нормализует строку для сравнения (trim + lowercase). */
export function normalizeLabelKey(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

/**
 * Убирает дубликаты по нормализованному ключу, сохраняя первое каноническое написание.
 * Результат отсортирован по localeCompare("ru").
 */
export function dedupeDisplayLabels(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeLabelKey(trimmed);
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "ru"));
}

export type LabeledItem = { name_ru: string; [key: string]: unknown };

/**
 * Дедупликация объектов с полем name_ru по нормализованному ключу.
 * Сохраняет первый элемент для каждого уникального name_ru.
 */
export function dedupeByNameRu<T extends LabeledItem>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const trimmed = item.name_ru.trim();
    if (!trimmed) continue;
    const key = normalizeLabelKey(trimmed);
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()].sort((a, b) =>
    a.name_ru.localeCompare(b.name_ru, "ru"),
  );
}
