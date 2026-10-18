export function shrinkImage(file: Blob) {
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const max = 1024
      const scale = Math.min(1, max / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Esa foto no se pudo leer. Prueba con otra.'))
        return
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (!blob) reject(new Error('Esa foto no se pudo leer. Prueba con otra.'))
        else resolve(blob)
      }, 'image/jpeg', 0.7)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Esa foto no se pudo leer. Prueba con otra.'))
    }
    image.src = url
  })
}
