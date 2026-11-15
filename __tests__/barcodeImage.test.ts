jest.mock('@react-native-ml-kit/barcode-scanning', () => {
  const BarcodeFormat = { QR_CODE: 256, EAN_13: 32, EAN_8: 64, ITF: 128, UPC_A: 512, UPC_E: 1024, CODE_128: 1 };
  return { __esModule: true, default: { scan: jest.fn() }, BarcodeFormat };
});
jest.mock('react-native-fs', () => ({}));
jest.mock('@bam.tech/react-native-image-resizer', () => ({}));

import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import { findBarcodeInPhoto, pickFoodBarcode } from '../src/services/barcodeImage';

describe('pickFoodBarcode', () => {
  it('skips QR and shipping codes and returns the product barcode', () => {
    expect(
      pickFoodBarcode([
        { format: 256, value: 'https://example.com' },
        { format: 1, value: '1234567890' },
        { format: 512, value: '012345678905' },
      ]),
    ).toBe('012345678905');
  });

  it('returns undefined when there is no product barcode', () => {
    expect(pickFoodBarcode([{ format: 256, value: 'hello' }])).toBeUndefined();
    expect(pickFoodBarcode([])).toBeUndefined();
  });
});

describe('findBarcodeInPhoto', () => {
  it('scans the photo as a file URL', async () => {
    (BarcodeScanning.scan as jest.Mock).mockResolvedValueOnce([{ format: 32, value: '4006381333931' }]);
    await expect(findBarcodeInPhoto('/tmp/a.jpg')).resolves.toBe('4006381333931');
    expect(BarcodeScanning.scan).toHaveBeenCalledWith('file:///tmp/a.jpg');
  });

  it('treats a scanner error as "no barcode"', async () => {
    (BarcodeScanning.scan as jest.Mock).mockRejectedValueOnce(new Error('bad image'));
    await expect(findBarcodeInPhoto('file:///tmp/b.jpg')).resolves.toBeUndefined();
  });
});
