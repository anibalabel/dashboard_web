export const STREAMNEXUS_VERSION_REGEX = /^[0-9]\.[0-9]$/;

export function isValidStreamNexusVersion(value: unknown): value is string {
  return typeof value === 'string' && STREAMNEXUS_VERSION_REGEX.test(value);
}

export type StreamNexusVersionFile = {
  version: string;
  meta?: Record<string, unknown>;
};

export function validateStreamNexusVersionFile(json: unknown): { valid: boolean; error?: string } {
  if (json === null || typeof json !== 'object') {
    return { valid: false, error: 'JSON inválido' };
  }
  const obj = json as Partial<StreamNexusVersionFile>;
  if (typeof obj.version !== 'string') {
    return { valid: false, error: 'El campo "version" debe ser string' };
  }
  if (!isValidStreamNexusVersion(obj.version)) {
    return { valid: false, error: 'La versión debe cumplir el formato X.X con X en [0-9]' };
  }
  return { valid: true };
}
