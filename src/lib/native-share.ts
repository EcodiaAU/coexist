/**
 * Native share / save-to-gallery helpers for Capacitor builds.
 *
 * Why this exists (client bug, Tamika Wilton 2026-07-17): the whole
 * share/save surface used to ride on the Web Share API.
 * - Android System WebView has NO navigator.share/canShare, so code fell to
 *   an <a download> blob click - Capacitor's WebView has no DownloadListener,
 *   so that is a SILENT no-op. Share and Save both did nothing on Android.
 * - iOS WKWebView's navigator.share requires transient user activation; we
 *   await a 1-3s html2canvas capture before calling it, so activation could
 *   expire and the NotAllowedError was swallowed.
 *
 * The fix: on native platforms, never touch the Web Share API.
 * - Share  -> write the blob to the app cache dir, hand the file uri to
 *             @capacitor/share (native share sheet; no activation constraint).
 * - Save   -> @capacitor-community/media savePhoto/saveVideo:
 *             iOS: PHPhotoLibrary .addOnly (needs NSPhotoLibraryAddUsageDescription,
 *             present in Info.plist). Android: writes into
 *             Android/media/<pkg>/<album>/ via getExternalMediaDirs - NO manifest
 *             permission needed on any API level (READ_MEDIA_IMAGES was rejected
 *             by Play policy review 2026-06-04, so the manifest must stay clean).
 *
 * Web behaviour is unchanged - callers gate on isNativePlatform().
 */
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Media } from '@capacitor-community/media'

/** Album that Android saves land in (shows up as a device folder in Gallery/Photos). */
const ANDROID_ALBUM_NAME = 'Co-Exist'

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/** True when the user dismissed a native share sheet (not a real failure). */
export function isShareCancellation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /cancel/i.test(msg) || (err instanceof Error && err.name === 'AbortError')
}

/** Blob -> raw base64 payload (no data: prefix). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.onloadend = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

/** Blob -> full data: URL (what Media.savePhoto accepts as `path`). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.onloadend = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(blob)
  })
}

/** Write a blob into the app cache dir; returns the native file:// uri. */
async function writeBlobToCache(blob: Blob, filename: string): Promise<string> {
  const data = await blobToBase64(blob)
  const result = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
  })
  return result.uri
}

/**
 * Open the NATIVE share sheet with a file attachment (plus optional text).
 * Use for "share this image" on iOS/Android. Throws on real failure;
 * cancellation also throws - filter with isShareCancellation().
 */
export async function shareBlobNative(
  blob: Blob,
  filename: string,
  opts?: { title?: string; text?: string },
): Promise<void> {
  const uri = await writeBlobToCache(blob, filename)
  await Share.share({
    title: opts?.title,
    text: opts?.text,
    files: [uri],
  })
}

/**
 * Open the NATIVE share sheet for a plain link/text share (no file).
 * Replaces navigator.share({title, text, url}) on native platforms.
 */
export async function shareLinkNative(opts: {
  title?: string
  text?: string
  url?: string
}): Promise<void> {
  await Share.share(opts)
}

/** Find-or-create the Co-Exist album on Android; returns its identifier. */
async function ensureAndroidAlbum(): Promise<string> {
  const { albums } = await Media.getAlbums()
  const existing = albums.find((a) => a.name === ANDROID_ALBUM_NAME)
  if (existing) return existing.identifier
  await Media.createAlbum({ name: ANDROID_ALBUM_NAME })
  const after = await Media.getAlbums()
  const created = after.albums.find((a) => a.name === ANDROID_ALBUM_NAME)
  if (!created) throw new Error(`Could not create the ${ANDROID_ALBUM_NAME} album`)
  return created.identifier
}

/**
 * Save an image or video straight into the device photo library.
 * `path` may be a data: URL or an http(s) URL (the plugin downloads it
 * natively on both platforms). `fileName` should NOT carry an extension -
 * Android appends the extension of the resolved media itself.
 */
export async function saveMediaToGallery(
  path: string,
  fileName: string,
  kind: 'photo' | 'video' = 'photo',
): Promise<void> {
  const baseName = fileName.replace(/\.[a-z0-9]+$/i, '')
  const options: { path: string; fileName: string; albumIdentifier?: string } = {
    path,
    fileName: baseName,
  }
  if (Capacitor.getPlatform() === 'android') {
    // Android savePhoto/saveVideo REQUIRE an albumIdentifier.
    options.albumIdentifier = await ensureAndroidAlbum()
  }
  if (kind === 'video') {
    await Media.saveVideo(options)
  } else {
    await Media.savePhoto(options)
  }
}

/** Save an in-memory blob (e.g. an html2canvas PNG) to the photo library. */
export async function saveBlobToGallery(
  blob: Blob,
  fileName: string,
): Promise<void> {
  const dataUrl = await blobToDataUrl(blob)
  const kind = blob.type.startsWith('video/') ? 'video' : 'photo'
  await saveMediaToGallery(dataUrl, fileName, kind)
}
