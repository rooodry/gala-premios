export async function uploadMedia(file) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET)

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`,
    { method: 'POST', body: formData }
  )

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error?.message || 'Error subiendo el archivo')
  }

  let tipo = 'imagen'
  if (file.type.startsWith('audio/') || data.is_audio) {
    tipo = 'audio'
  } else if (data.resource_type === 'video') {
    tipo = 'video'
  }

  return {
    url: data.secure_url,
    tipo
  }
}