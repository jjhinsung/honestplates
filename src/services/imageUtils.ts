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
