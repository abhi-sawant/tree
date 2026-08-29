import { getNodesBounds, useReactFlow } from "@xyflow/react"

import { triggerDownload } from "~/lib/download"
import { exportFilename } from "~/lib/export/filenames"
import {
  exportPngBlob,
  exportPngDataUrl,
  exportSvgBlob,
} from "~/lib/export/image"
import { exportPdfBlob } from "~/lib/export/pdf"

// Breathing room around the tree's exact bounds so nodes at the very edge
// aren't clipped by antialiasing/border rounding.
const CAPTURE_PADDING = 0.05

export function useTreeExport(treeName: string) {
  const { getNodes, getViewport, setViewport } = useReactFlow()

  async function withFittedViewport<T>(
    run: (viewportEl: HTMLElement, width: number, height: number) => Promise<T>
  ): Promise<T> {
    const viewportEl = document.querySelector<HTMLElement>(
      ".react-flow__viewport"
    )
    if (!viewportEl) throw new Error("Canvas not ready for export.")

    const bounds = getNodesBounds(getNodes())
    const width = Math.ceil(bounds.width * (1 + CAPTURE_PADDING))
    const height = Math.ceil(bounds.height * (1 + CAPTURE_PADDING))

    const previousViewport = getViewport()
    await setViewport(
      {
        x: -bounds.x + (width - bounds.width) / 2,
        y: -bounds.y + (height - bounds.height) / 2,
        zoom: 1,
      },
      { duration: 0 }
    )
    // setViewport(duration: 0) commits synchronously, but the transformed
    // .react-flow__viewport element only reflects it after the next paint.
    await new Promise(requestAnimationFrame)

    try {
      return await run(viewportEl, width, height)
    } finally {
      await setViewport(previousViewport, { duration: 0 })
    }
  }

  async function exportPng() {
    await withFittedViewport(async (viewportEl, width, height) => {
      const blob = await exportPngBlob(viewportEl, { width, height })
      triggerDownload(blob, exportFilename(treeName, "png"))
    })
  }

  async function exportSvg() {
    await withFittedViewport(async (viewportEl, width, height) => {
      const blob = await exportSvgBlob(viewportEl, { width, height })
      triggerDownload(blob, exportFilename(treeName, "svg"))
    })
  }

  async function exportPdf() {
    await withFittedViewport(async (viewportEl, width, height) => {
      const pngDataUrl = await exportPngDataUrl(viewportEl, { width, height })
      const blob = exportPdfBlob({
        pngDataUrl,
        imageWidth: width,
        imageHeight: height,
        title: treeName,
        generatedDate: new Date(),
      })
      triggerDownload(blob, exportFilename(treeName, "pdf"))
    })
  }

  return { exportPng, exportSvg, exportPdf }
}
