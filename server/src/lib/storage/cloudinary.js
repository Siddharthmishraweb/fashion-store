import { createHash } from 'node:crypto'
import { config } from '../../config/env.js'

function sign(params, secret) {
  const blob = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&') + secret
  return createHash('sha1').update(blob).digest('hex')
}

/**
 * Uploads a buffer to Cloudinary and returns a stable https URL.
 * Swap this file (or STORAGE_DRIVER) later; callers stay on uploadImage().
 */
export async function uploadToCloudinary({ buffer, filename, mimeType, folder }) {
  const { cloudName, apiKey, apiSecret, uploadPreset } = config.storage.cloudinary
  if (!cloudName) {
    throw Object.assign(new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME.'), { statusCode: 503 })
  }

  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), filename || 'image.jpg')
  form.append('folder', folder)

  if (apiKey && apiSecret) {
    const timestamp = Math.floor(Date.now() / 1000)
    const params = { folder, timestamp }
    form.append('api_key', apiKey)
    form.append('timestamp', String(timestamp))
    form.append('signature', sign(params, apiSecret))
  } else if (uploadPreset) {
    form.append('upload_preset', uploadPreset)
  } else {
    throw Object.assign(
      new Error('Set CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET, or CLOUDINARY_UPLOAD_PRESET.'),
      { statusCode: 503 },
    )
  }

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.secure_url) {
    throw Object.assign(new Error(data.error?.message || 'Cloudinary rejected the upload.'), { statusCode: 502 })
  }

  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    provider: 'cloudinary',
  }
}
