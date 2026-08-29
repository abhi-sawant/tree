import { jsPDF } from "jspdf"

export interface PdfExportInput {
  pngDataUrl: string
  imageWidth: number
  imageHeight: number
  title: string
  generatedDate: Date
}

const PAGE_MARGIN_MM = 12
const HEADER_HEIGHT_MM = 16

export function fitImageToBox(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number
): { width: number; height: number } {
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight)
  return { width: imageWidth * scale, height: imageHeight * scale }
}

export function exportPdfBlob(input: PdfExportInput): Blob {
  const orientation = input.imageWidth >= input.imageHeight ? "l" : "p"
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - PAGE_MARGIN_MM * 2
  const contentHeight = pageHeight - PAGE_MARGIN_MM * 2 - HEADER_HEIGHT_MM

  doc.setFontSize(14)
  doc.text(input.title, PAGE_MARGIN_MM, PAGE_MARGIN_MM + 5)
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(
    `Generated ${input.generatedDate.toLocaleDateString()}`,
    PAGE_MARGIN_MM,
    PAGE_MARGIN_MM + 11
  )
  doc.setTextColor(0)

  const { width, height } = fitImageToBox(
    input.imageWidth,
    input.imageHeight,
    contentWidth,
    contentHeight
  )
  const imageX = PAGE_MARGIN_MM + (contentWidth - width) / 2
  const imageY = PAGE_MARGIN_MM + HEADER_HEIGHT_MM

  doc.addImage(input.pngDataUrl, "PNG", imageX, imageY, width, height)

  return doc.output("blob")
}
