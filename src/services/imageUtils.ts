import ImageResizer from '@bam.tech/react-native-image-resizer';
import RNFS from 'react-native-fs';
import { AI_IMAGE_MAX_EDGE } from '../config';

export const toFileUri = (path: string) =>
  path.startsWith('file://') ? path : `file://${path}`;

const stripFileScheme = (uri: string) => uri.replace(/^file:\/\//, '');

/** Downscale a captured photo to a JPEG and return it as base64 (for the AI proxy). */
export async function photoToBase64Jpeg(
  path: string,
  maxEdge: number = AI_IMAGE_MAX_EDGE,
): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
  const resized = await ImageResizer.createResizedImage(
    toFileUri(path),
    maxEdge,
    maxEdge,
    'JPEG',
    80,
    0,
    undefined,
    false,
    { mode: 'contain', onlyScaleDown: true },
  );
  const base64 = await RNFS.readFile(stripFileScheme(resized.uri), 'base64');
  // Clean up the temporary resized file; the original stays for the preview.
  RNFS.unlink(stripFileScheme(resized.uri)).catch(() => {});
  return { base64, mediaType: 'image/jpeg' };
}

// ---------------- Keeping photos for logged foods ----------------

/**
 * Saved photos are stored as "doc://scans/<file>" rather than an absolute path:
 * iOS moves the app's Documents folder when the app is updated or reinstalled.
 */
const DOC_SCHEME = 'doc://';
const SCANS_DIR = 'scans';

/** Turn a stored photo path back into a real file path (no-op for ordinary paths). */
export function resolvePhotoPath(stored?: string): string | undefined {
  if (!stored) return undefined;
  return stored.startsWith(DOC_SCHEME) ? `${RNFS.DocumentDirectoryPath}/${stored.slice(DOC_SCHEME.length)}` : stored;
}

/**
 * Copy a scan photo out of the temporary folder (which iOS empties) so a logged food
 * keeps its picture. Returns the path to store on the entry; on failure, the original.
 */
export async function keepPhoto(path?: string): Promise<string | undefined> {
  if (!path) return undefined;
  if (path.startsWith(DOC_SCHEME)) return path;
  const src = stripFileScheme(path);
  const dir = `${RNFS.DocumentDirectoryPath}/${SCANS_DIR}`;
  if (src.startsWith(`${dir}/`)) return `${DOC_SCHEME}${SCANS_DIR}/${src.slice(dir.length + 1)}`; // already kept
  try {
    await RNFS.mkdir(dir);
    const ext = /\.(jpe?g|png|heic)$/i.exec(src)?.[0] ?? '.jpg';
    const file = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${ext}`;
    await RNFS.copyFile(src, `${dir}/${file}`);
    return `${DOC_SCHEME}${SCANS_DIR}/${file}`;
  } catch {
    return path;
  }
}

/** Delete a kept photo (when its entry is removed). Ignores photos that weren't kept. */
export function deleteKeptPhoto(stored?: string) {
  if (!stored?.startsWith(DOC_SCHEME)) return;
  RNFS.unlink(resolvePhotoPath(stored)!).catch(() => {});
}
