import { describe, it, expect } from 'vitest';
import { isValidStreamNexusVersion, validateStreamNexusVersionFile } from '../lib/versioning';
import fs from 'fs';
import path from 'path';

describe('isValidStreamNexusVersion', () => {
  it('acepta valores válidos X.X con X en 0-9', () => {
    for (let major = 0; major <= 9; major++) {
      for (let minor = 0; minor <= 9; minor++) {
        const v = `${major}.${minor}`;
        expect(isValidStreamNexusVersion(v)).toBe(true);
      }
    }
  });

  it('rechaza valores inválidos', () => {
    const invalid = ['1.10', '10.0', '-1.0', '1.a', 'a.1', '1.', '1', '', '01.1', '1.01', '.1'];
    for (const v of invalid) {
      expect(isValidStreamNexusVersion(v)).toBe(false);
    }
  });
});

describe('validateStreamNexusVersionFile', () => {
  it('valida el archivo JSON público v-streamnexus.json', () => {
    const filePath = path.resolve(process.cwd(), 'public', 'v-streamnexus.json');
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    const res = validateStreamNexusVersionFile(json);
    expect(res.valid).toBe(true);
  });

  it('falla si falta "version" o no cumple el formato', () => {
    const bad1 = {};
    const bad2 = { version: '10.0' };
    expect(validateStreamNexusVersionFile(bad1).valid).toBe(false);
    expect(validateStreamNexusVersionFile(bad2).valid).toBe(false);
  });
});
