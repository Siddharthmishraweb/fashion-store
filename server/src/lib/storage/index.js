import { config } from '../../config/env.js'
import { lazyImageUrl } from './lazyUrl.js'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const MAX_BYTES = 8 * 1024 * 1024

/**
 * Single entry point for every image the platform stores. Product editors,
 * banners, and logos all call this. Changing cloud vendor is a STORAGE_DRIVER
 * switch plus the matching adapter file — routes and the database keep storing
 * a plain https URL.
 */
export async function uploadImage({ buffer, filename = 'image.jpg', mimeType = 'image/jpeg', folder = 'vastrika' }) {
  if (!buffer?.length) {
    throw Object.assign(new Error('The file was empty.'), { statusCode: 400 })
  }
  if (buffer.length > MAX_BYTES) {
    throw Object.assign(new Error('Images must be 8 MB or smaller.'), { statusCode: 400 })
  }
  if (mimeType && !ALLOWED_TYPES.has(mimeType)) {
    throw Object.assign(new Error('Use a JPG, PNG, WEBP, GIF, or AVIF image.'), { statusCode: 400 })
  }

  const target = folder.replace(/[^a-z0-9/_-]/gi, '').slice(0, 80) || 'vastrika'
  const payload = { buffer, filename, mimeType, folder: target }

  const result = config.storage.driver === 's3'
    ? await (await import('./s3.js')).uploadToS3(payload)
    : await (await import('./cloudinary.js')).uploadToCloudinary(payload)

  return { ...result, url: lazyImageUrl(result.url) }
}
