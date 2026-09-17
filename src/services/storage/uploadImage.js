import { env } from '../../config/env.js'
import { ApiError } from '../api/client.js'
import { getToken, notifyAuthExpired } from '../session.js'

const MAX_BYTES = 8 * 1024 * 1024

/**
 * Uploads an image and returns the cloud URL that should be stored in the DB.
 * Talks to POST /uploads (server adapter). In mock mode it can also hit
 * Cloudinary unsigned so GitHub Pages still works. Swap the server adapter to
 * move from Cloudinary to S3 later — this client keeps sending a file.
 */
export async function uploadImageFile(file, { folder = 'vastrika' } = {}) {
  if (!file) throw new Error('Choose an image to upload.')
  if (!String(file.type || '').startsWith('image/')) throw new Error('Use a JPG, PNG, WEBP, or GIF.')
  if (file.size > MAX_BYTES) throw new Error('Images must be 8 MB or smaller.')

  if (env.useMock) return unsignedCloudinary(file, folder)
  if (!env.apiUrl) throw new Error('The API is not configured, so images cannot be uploaded.')

  const body = new FormData()
  body.append('file', file)
  const token = getToken()
  const res = await fetch(`${env.apiUrl}/uploads?folder=${encodeURIComponent(folder)}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) notifyAuthExpired()
  if (!res.ok || !data.url) throw new ApiError(data.message || 'Upload failed', res.status, data)
  return data
}

async function unsignedCloudinary(file, folder) {
  const cloud = env.cloudinaryCloudName
  const preset = env.cloudinaryUploadPreset
  if (!cloud || !preset) {
    throw new Error('Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to upload images in mock mode.')
  }
  const body = new FormData()
  body.append('file', file)
  body.append('upload_preset', preset)
  body.append('folder', folder)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.secure_url) throw new Error(data.error?.message || 'Cloudinary rejected the upload.')
  return { url: data.secure_url, publicId: data.public_id, provider: 'cloudinary' }
}
