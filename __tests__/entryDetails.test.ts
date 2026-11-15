jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/app/Documents',
  mkdir: jest.fn(() => Promise.resolve()),
  copyFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
}));
jest.mock('@bam.tech/react-native-image-resizer', () => ({}));

import RNFS from 'react-native-fs';
import { keepPhoto, resolvePhotoPath } from '../src/services/imageUtils';
import type { FoodEntry } from '../src/types';
import { labelFromEntry, perServingOf, plateItemFromEntry } from '../src/utils/entryDetails';

const base: FoodEntry = {
  id: 'e1',
  name: 'Granola',
  date: '2026-11-15',
  createdAt: 0,
  meal: 'breakfast',
  source: 'label',
  servings: 2,
  servingDescription: '2/3 cup (55g)',
  nutrients: { calories: 460, protein: 6, carbs: 74, fat: 16, sodium: 320 },
};

describe('entry details', () => {
  it('divides the logged total back to one serving', () => {
    expect(perServingOf(base)).toMatchObject({ calories: 230, protein: 3, carbs: 37, fat: 8, sodium: 160 });
  });

  it('reopens the saved label page, using the current entry name', () => {
    const saved = labelFromEntry({
      ...base,
      name: 'Renamed granola',
      label: {
        productName: 'Granola',
        nutrients: { calories: 230, protein: 3, carbs: 37, fat: 8 },
        ingredients: 'OATS, SUGAR',
        rawText: 'Nutrition Facts…',
        detectedFields: ['calories'],
      },
    });
    expect(saved.ingredients).toBe('OATS, SUGAR');
    expect(saved.detectedFields).toEqual(['calories']);
    expect(saved.productName).toBe('Renamed granola');
  });

  it('rebuilds a page for entries logged before details were saved', () => {
    const rebuilt = labelFromEntry(base);
    expect(rebuilt.nutrients.calories).toBe(230);
    expect(rebuilt.servingSize).toBe('2/3 cup (55g)');
    expect(rebuilt.detectedFields).toEqual(expect.arrayContaining(['calories', 'protein', 'carbs', 'fat', 'sodium']));
  });

  it('rebuilds a plate item at one portion', () => {
    const item = plateItemFromEntry({ ...base, source: 'plate', servingDescription: '1 cup', confidence: 0.8 });
    expect(item).toMatchObject({ name: 'Granola', portion: '1 cup', confidence: 0.8 });
    expect(item.nutrients.calories).toBe(230);
  });
});

describe('kept photos', () => {
  it('copies temp photos into Documents and stores a portable path', async () => {
    const stored = await keepPhoto('file:///tmp/camera/abc.jpg');
    expect(stored).toMatch(/^doc:\/\/scans\/\w+\.jpg$/);
    expect(RNFS.copyFile).toHaveBeenCalledWith('/tmp/camera/abc.jpg', expect.stringMatching(/^\/app\/Documents\/scans\//));
    expect(resolvePhotoPath(stored)).toMatch(/^\/app\/Documents\/scans\/\w+\.jpg$/);
  });

  it('does not copy a photo that was already kept', async () => {
    (RNFS.copyFile as jest.Mock).mockClear();
    expect(await keepPhoto('/app/Documents/scans/x.jpg')).toBe('doc://scans/x.jpg');
    expect(await keepPhoto('doc://scans/x.jpg')).toBe('doc://scans/x.jpg');
    expect(RNFS.copyFile).not.toHaveBeenCalled();
  });

  it('keeps the original path if copying fails', async () => {
    (RNFS.copyFile as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    expect(await keepPhoto('/tmp/a.jpg')).toBe('/tmp/a.jpg');
  });
});
