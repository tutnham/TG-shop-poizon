/** Скачивание файла из Telegram по file_id (getFile + CDN-ссылка). */
export async function downloadTelegramFile(
  botToken: string,
  fileId: string,
): Promise<Buffer> {
  const metaRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = (await metaRes.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
    description?: string;
  };
  const filePath = meta.ok ? meta.result?.file_path : undefined;
  if (!filePath) {
    throw new Error(meta.description ?? "Telegram getFile failed");
  }

  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`,
  );
  if (!fileRes.ok) {
    throw new Error(`Telegram file download failed: ${fileRes.status}`);
  }
  return Buffer.from(await fileRes.arrayBuffer());
}
