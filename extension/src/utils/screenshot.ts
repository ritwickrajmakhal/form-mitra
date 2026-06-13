interface ViewportSegment {
  y: number
  dataUrl: string
}

export function stitchViewports(
  viewports: ViewportSegment[],
  scrollHeight: number,
  clientWidth: number,
  clientHeight: number,
  formRect?: { left: number; top: number; width: number; height: number } | null
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!viewports || viewports.length === 0) {
      reject(new Error('No viewport segments provided to stitch'))
      return
    }

    // Create a canvas with the full page height and width
    const canvas = document.createElement('canvas')
    canvas.width = clientWidth
    canvas.height = scrollHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas 2D context not supported'))
      return
    }

    let loadedCount = 0
    const loadedImages: { y: number; img: HTMLImageElement }[] = []

    viewports.forEach((vp) => {
      const img = new Image()
      img.onload = () => {
        loadedImages.push({ y: vp.y, img })
        loadedCount++

        if (loadedCount === viewports.length) {
          // Sort images by their vertical scroll positions
          loadedImages.sort((a, b) => a.y - b.y)

          // Draw each segment onto the canvas
          loadedImages.forEach(({ y, img: segmentImg }) => {
            ctx.drawImage(segmentImg, 0, y, clientWidth, clientHeight)
          })

          try {
            if (formRect) {
              // Create a canvas for the cropped form element
              const cropCanvas = document.createElement('canvas')
              cropCanvas.width = formRect.width
              cropCanvas.height = formRect.height
              const cropCtx = cropCanvas.getContext('2d')
              if (cropCtx) {
                // Draw the form area from full canvas onto the cropped canvas
                cropCtx.drawImage(
                  canvas,
                  formRect.left,
                  formRect.top,
                  formRect.width,
                  formRect.height,
                  0,
                  0,
                  formRect.width,
                  formRect.height
                )
                const croppedDataUrl = cropCanvas.toDataURL('image/png')
                resolve(croppedDataUrl)
                return
              }
            }

            const stitchedDataUrl = canvas.toDataURL('image/png')
            resolve(stitchedDataUrl)
          } catch (e) {
            reject(new Error(`Failed to export stitched canvas: ${(e as Error).message}`))
          }
        }
      }
      img.onerror = () => {
        reject(new Error('Failed to load viewport segment image'))
      }
      img.src = vp.dataUrl
    })
  })
}
