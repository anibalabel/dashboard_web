import { describe, it, expect } from 'vitest';
import {
  parseVidaraBatchInput,
  getVidaraUrl,
  DEFAULT_VIDARA_API_KEY,
  isVidaraUrlOrServer,
  extractVidaraVideoId,
  formatVidaraUrl
} from '../lib/vidaraUtils';

describe('Vidara Utils & Parser', () => {
  it('should have default API key configured', () => {
    expect(DEFAULT_VIDARA_API_KEY).toBe('72986748feba04250dd69f366cb4ed0125c6f6323f27bd2aa0b77ce5acde10f7');
  });

  it('should correctly parse batch input and skip non-URL lines', () => {
    const rawInput = `https://lulustream.com/e/jta3a5ep8e4k\t=\tstar-trek-strange-new-worlds-4x1
FALTA 4 - 2 - Episodio 2 (Sin enlace en Luluvdo / Castellano)\t=\tstar-trek-strange-new-worlds-4x2  '  esta no hay que asele caso '
https://lulustream.com/e/woz55ms7vx5z\t=\tstar-trek-strange-new-worlds-4x3
https://lulustream.com/e/rlt31gqzb7n8\t=\tstar-trek-strange-new-worlds-4x4`;

    const result = parseVidaraBatchInput(rawInput);

    expect(result.items.length).toBe(4);
    expect(result.validCount).toBe(3);
    expect(result.skippedCount).toBe(1);

    // Check item 1
    expect(result.items[0].isValid).toBe(true);
    expect(result.items[0].url).toBe('https://lulustream.com/e/jta3a5ep8e4k');
    expect(result.items[0].title).toBe('star-trek-strange-new-worlds-4x1');

    // Check item 2 (Skipped line)
    expect(result.items[1].isValid).toBe(false);
    expect(result.items[1].skipReason).toContain('no contiene una URL válida');

    // Check item 3
    expect(result.items[2].isValid).toBe(true);
    expect(result.items[2].url).toBe('https://lulustream.com/e/woz55ms7vx5z');
    expect(result.items[2].title).toBe('star-trek-strange-new-worlds-4x3');

    // Check item 4
    expect(result.items[3].isValid).toBe(true);
    expect(result.items[3].url).toBe('https://lulustream.com/e/rlt31gqzb7n8');
    expect(result.items[3].title).toBe('star-trek-strange-new-worlds-4x4');
  });

  it('should correctly format Vidara embed and watch URLs with /v/ as default', () => {
    expect(getVidaraUrl('a1b2c3d4e5f6')).toBe('https://vidara.so/v/a1b2c3d4e5f6');
    expect(getVidaraUrl('a1b2c3d4e5f6', 'watch')).toBe('https://vidara.so/v/a1b2c3d4e5f6');
    expect(getVidaraUrl('a1b2c3d4e5f6', 'embed')).toBe('https://vidara.so/e/a1b2c3d4e5f6');
  });

  it('should support plain single URLs and piped lines', () => {
    const mixedInput = `https://example.com/video.mp4
https://example.com/sample.mp4 | Sample Title`;

    const result = parseVidaraBatchInput(mixedInput);
    expect(result.validCount).toBe(2);
    expect(result.items[0].url).toBe('https://example.com/video.mp4');
    expect(result.items[0].title).toBe('');
    expect(result.items[1].url).toBe('https://example.com/sample.mp4');
    expect(result.items[1].title).toBe('Sample Title');
  });

  it('should detect, extract ID, and normalize Vidara links to https://vidara.so/v/VIDEO_ID', () => {
    expect(isVidaraUrlOrServer('https://vidara.to/e/4Y2q4yZDtxGWw')).toBe(true);
    expect(isVidaraUrlOrServer('https://custom.domain/e/4Y2q4yZDtxGWw', 'virda')).toBe(true);
    expect(isVidaraUrlOrServer('https://voe.sx/e/abc123', 'voe')).toBe(false);

    expect(extractVidaraVideoId('https://vidara.to/e/4Y2q4yZDtxGWw?autoplay=1')).toBe('4Y2q4yZDtxGWw');
    expect(extractVidaraVideoId('https://vidara.so/4Y2q4yZDtxGWw.html')).toBe('4Y2q4yZDtxGWw');

    expect(formatVidaraUrl('https://vidara.to/e/4Y2q4yZDtxGWw')).toBe('https://vidara.so/v/4Y2q4yZDtxGWw');
    expect(formatVidaraUrl('https://custom.example/embed-vr999.html', 'virda')).toBe('https://vidara.so/v/vr999');
  });
});
