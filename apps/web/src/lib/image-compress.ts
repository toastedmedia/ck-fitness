/**
 * Browser-only. Re-draws a photo onto a canvas and saves it as a smaller JPEG. This also removes
 * hidden camera data (location, device, time) because only the pixels are kept.
 */
export async function compressPhoto(
  file: File,
  maxSide = 1600,
  quality = 0.82,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser cannot process photos.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not prepare the photo."))),
      "image/jpeg",
      quality,
    ),
  );
}
