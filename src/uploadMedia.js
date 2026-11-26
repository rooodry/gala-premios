export async function uploadMedia(file) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET)

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`,
    { method: 'POST', body: formData }
  )

  if (!res.ok) throw new Error('Error subiendo el archivo')
  const data = await res.json()

  return {
    url: data.secure_url,
    tipo: data.resource_type === 'video' ? 'video' : 'imagen'
  }
}