/**
 * AWS S3 adapter stub. When you are ready to switch, implement this function
 * and set STORAGE_DRIVER=s3. Nothing else in the app should import S3 directly.
 */
export async function uploadToS3() {
  throw Object.assign(
    new Error('S3 storage is not wired yet. Keep STORAGE_DRIVER=cloudinary, or implement uploadToS3().'),
    { statusCode: 503 },
  )
}
