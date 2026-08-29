import { toBlob, toPng, toSvg } from "html-to-image"

// White regardless of the app's light/dark theme — exports are meant to be shared
// or printed, and a dark-mode capture would print as a giant black rectangle.
export const EXPORT_BACKGROUND_COLOR = "#ffffff"

export interface CaptureOptions {
  width: number
  height: number
  pixelRatio?: number
}

export async function exportPngBlob(
  node: HTMLElement,
  options: CaptureOptions
): Promise<Blob> {
  const blob = await toBlob(node, {
    width: options.width,
    height: options.height,
    backgroundColor: EXPORT_BACKGROUND_COLOR,
    pixelRatio: options.pixelRatio ?? 2,
    cacheBust: true,
  })
  if (!blob) throw new Error("PNG export failed — could not render the canvas.")
  return blob
}

// Returns the data URL directly (rather than a Blob) since pdf.ts's jsPDF#addImage
// takes a data URL and would otherwise need it re-decoded from a Blob.
export async function exportPngDataUrl(
  node: HTMLElement,
  options: CaptureOptions
): Promise<string> {
  return toPng(node, {
    width: options.width,
    height: options.height,
    backgroundColor: EXPORT_BACKGROUND_COLOR,
    pixelRatio: options.pixelRatio ?? 2,
    cacheBust: true,
  })
}

export async function exportSvgBlob(
  node: HTMLElement,
  options: CaptureOptions
): Promise<Blob> {
  const dataUrl = await toSvg(node, {
    width: options.width,
    height: options.height,
    backgroundColor: EXPORT_BACKGROUND_COLOR,
    cacheBust: true,
  })
  const svgText = decodeURIComponent(dataUrl.split(",")[1])
  return new Blob([svgText], { type: "image/svg+xml" })
}
