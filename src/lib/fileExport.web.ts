/** Web file export: stream a Blob to the browser download folder. */
export const exportTextFile = async (
  fileName: string,
  content: string,
  mimeType = 'text/plain'
): Promise<string> => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next macrotask so Safari has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return fileName;
};
