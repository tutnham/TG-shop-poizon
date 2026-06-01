/** Sanitize user search input for PostgREST ilike / or() filters */
export function sanitizeSearchQuery(input: string): string {
  return input
    .replace(/[%_,().\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
