import { useState } from 'react'
import { Button, Input } from './index.jsx'
import { uploadImageFile } from '../../services/storage/uploadImage.js'
import { safeImageUrl } from '../../utils/security.js'

export function ImageUploadField({ label, value, onChange, error, hint, folder = 'vastrika' }) {
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const preview = safeImageUrl(value)
  const message = localError || error

  const onFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setLocalError('')
    setBusy(true)
    try {
      const result = await uploadImageFile(file, { folder })
      onChange(result.url)
    } catch (err) {
      setLocalError(err.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`image-upload ${message ? 'field-error' : ''}`}>
      <Input
        label={label}
        value={value || ''}
        error={message}
        hint={hint || 'Upload a file, or paste an https:// image address'}
        placeholder="https://…"
        onChange={(e) => {
          setLocalError('')
          onChange(e.target.value)
        }}
      />
      <div className="image-picker-row">
        {preview ? <img src={preview} alt="" className="image-picker-thumb" loading="lazy" decoding="async" /> : <span className="image-picker-thumb empty" aria-hidden="true" />}
        <label className="btn btn-ghost btn-sm">
          {busy ? 'Uploading…' : 'Upload image'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={onFile} />
        </label>
        {value ? <Button variant="ghost" size="sm" onClick={() => onChange('')}>Clear</Button> : null}
      </div>
    </div>
  )
}
