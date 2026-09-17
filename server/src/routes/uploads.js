import { badRequest } from '../lib/errors.js'
import { uploadImage } from '../lib/storage/index.js'
import * as clean from '../lib/sanitize.js'

export default async function uploadRoutes(app) {
  app.post('/uploads', async (request) => {
    app.requireStaff(request, 'store.products')
    const file = await request.file()
    if (!file) throw badRequest('Choose an image to upload.')

    const buffer = await file.toBuffer()
    const folder = clean.slugify(request.query.folder || file.fields?.folder?.value || 'vastrika') || 'vastrika'
    return uploadImage({
      buffer,
      filename: file.filename,
      mimeType: file.mimetype,
      folder,
    })
  })
}
