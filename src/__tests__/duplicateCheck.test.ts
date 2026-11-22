import { describe, it, expect } from 'vitest';
import {
  buildDuplicateResponse,
  computeNextMissingOrder,
  findDuplicateUrlRow,
  normalizeComparableUrl,
  trimNullableUrl
} from '../../server/duplicateCheck';
import { isDuplicateRegisterResponse } from '../lib/registrationUtils';

describe('DB Duplicate Link Detection Helpers', () => {
  it('normalizeComparableUrl unifica esquema, www, barra final y espacios sin alterar IDs', () => {
    expect(normalizeComparableUrl('  http://www.vidara.so/v/4Y2q4yZDtxGWw/  ')).toBe(
      'https://vidara.so/v/4Y2q4yZDtxGWw'
    );
    expect(normalizeComparableUrl('https://VIDARA.SO/v/4Y2q4yZDtxGWw')).toBe(
      'https://vidara.so/v/4Y2q4yZDtxGWw'
    );
    expect(normalizeComparableUrl('//youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://youtube.com/watch?v=dQw4w9WgXcQ'
    );
    expect(normalizeComparableUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://youtube.com/watch?v=dQw4w9WgXcQ'
    );
    expect(normalizeComparableUrl('https://vidara.so/v/AbCdEf')).not.toBe(
      normalizeComparableUrl('https://vidara.so/v/abcdef')
    );
    expect(normalizeComparableUrl(null)).toBe('');
    expect(normalizeComparableUrl('   ')).toBe('');
  });

  it('trimNullableUrl recorta espacios y convierte vacíos en null', () => {
    expect(trimNullableUrl('  https://voe.sx/e/abc123  ')).toBe('https://voe.sx/e/abc123');
    expect(trimNullableUrl('   ')).toBeNull();
    expect(trimNullableUrl(undefined)).toBeNull();
  });

  it('findDuplicateUrlRow detecta enlaces repetidos en columnas link, url o file_url', () => {
    const dooplexRows = [
      { id: 10, link: 'https://vidara.so/v/4Y2q4yZDtxGWw' },
      { id: 11, link: 'https://bysekoze.com/e/6wbosve3hlry' }
    ];
    expect(findDuplicateUrlRow(dooplexRows, 'link', 'http://vidara.so/v/4Y2q4yZDtxGWw/')).toEqual(dooplexRows[0]);
    expect(findDuplicateUrlRow(dooplexRows, 'link', 'https://vidara.so/v/OTRO_ID')).toBeNull();
    expect(findDuplicateUrlRow(dooplexRows, 'link', '')).toBeNull();

    const docinesRows = [{ id: 5, url: 'https://smoothpre.com/v/abc123', link_order: 2 }];
    expect(findDuplicateUrlRow(docinesRows, 'url', '  https://smoothpre.com/v/abc123  ')).toEqual(docinesRows[0]);

    const plusmovieRows = [{ video_file_id: 99, file_url: 'https://uqload.vc/embed-xyz123.html', order: 1 }];
    expect(findDuplicateUrlRow(plusmovieRows, 'file_url', 'https://www.uqload.vc/embed-xyz123.html')).toEqual(
      plusmovieRows[0]
    );
  });

  it('computeNextMissingOrder encuentra el primer hueco secuencial libre', () => {
    expect(computeNextMissingOrder([])).toBe(1);
    expect(computeNextMissingOrder([1, 2, 4])).toBe(3);
    expect(computeNextMissingOrder([1, 2, 3])).toBe(4);
  });

  it('buildDuplicateResponse y isDuplicateRegisterResponse usan el contrato unificado', () => {
    const res = buildDuplicateResponse({ id: '42' });
    expect(res).toEqual({
      success: true,
      duplicate: true,
      skipped: true,
      message: 'El enlace ya existe en la BD (omitido)',
      data: {
        id: '42',
        duplicate: true
      }
    });
    expect(isDuplicateRegisterResponse(res)).toBe(true);
    expect(isDuplicateRegisterResponse({ data: { id: '42' }, message: 'Registrado correctamente' })).toBe(false);
    expect(isDuplicateRegisterResponse(undefined)).toBe(false);
  });
});
