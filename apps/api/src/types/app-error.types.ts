export type AppError = {
  message: string;
  code?: string;
  status: number;
};

export function appError(
  message: string,
  status = 400,
  code?: string,
): AppError {
  return { message, status, code };
}
