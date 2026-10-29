export async function saveExport(_base64: string, _mimeType: string): Promise<void> {
  // Saving to the device needs a file-system/sharing dependency; web is the priority platform.
  throw new Error("Exporting images is only available on web for now.");
}
