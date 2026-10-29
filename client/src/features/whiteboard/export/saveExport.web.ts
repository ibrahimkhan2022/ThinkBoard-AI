export async function saveExport(base64: string, mimeType: string): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const link = document.createElement("a");
  link.href = `data:${mimeType};base64,${base64}`;
  link.download = `thinkboard-${stamp}.${mimeType === "image/png" ? "png" : "jpg"}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
