import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, Loader2, RefreshCw, Save, Upload } from 'lucide-react';
import { isValidStreamNexusVersion, validateStreamNexusVersionFile } from '@/lib/versioning';

type VersionFile = {
  version?: unknown;
  v?: unknown;
};

export default function VersionApp() {
  const apkUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/app-streamnexus.apk';
    return new URL('/app-streamnexus.apk', window.location.origin).toString();
  }, []);

  const jsonUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/v-streamnexus.json';
    return new URL('/v-streamnexus.json', window.location.origin).toString();
  }, []);

  const [apkFile, setApkFile] = useState<File | null>(null);
  const [apkUploading, setApkUploading] = useState(false);
  const [apkError, setApkError] = useState<string | null>(null);
  const [apkOk, setApkOk] = useState<string | null>(null);
  const [apkDragOver, setApkDragOver] = useState(false);
  const apkInputRef = useRef<HTMLInputElement | null>(null);

  const [versionLoading, setVersionLoading] = useState(false);
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [versionOk, setVersionOk] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [nextVersion, setNextVersion] = useState<string>('');

  const setApkCandidate = (file: File | null) => {
    setApkError(null);
    setApkOk(null);

    if (!file) {
      setApkFile(null);
      return;
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith('.apk')) {
      setApkFile(null);
      setApkError('El archivo debe ser un .apk');
      return;
    }

    setApkFile(file);
  };

  const loadVersion = async () => {
    setVersionLoading(true);
    setVersionError(null);
    setVersionOk(null);
    try {
      const res = await fetch(`/v-streamnexus.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = (await res.json()) as VersionFile;

      const validation = validateStreamNexusVersionFile(data);
      if (validation.valid) {
        const v = (data as { version: string }).version;
        setCurrentVersion(v);
        setNextVersion(v);
        return;
      }

      if (typeof data?.v === 'number' && Number.isInteger(data.v) && data.v >= 0 && data.v <= 9) {
        const migrated = `${data.v}.0`;
        setCurrentVersion(migrated);
        setNextVersion(migrated);
        return;
      }

      throw new Error('Formato de JSON inválido');
    } catch {
      setVersionError('No se pudo leer v-streamnexus.json. Asegúrate de que exista en el servidor.');
    } finally {
      setVersionLoading(false);
    }
  };

  useEffect(() => {
    loadVersion();
  }, []);

  const uploadApk = async () => {
    setApkError(null);
    setApkOk(null);

    if (!apkFile) {
      setApkError('Selecciona un archivo APK.');
      return;
    }

    const formData = new FormData();
    formData.append('file', apkFile, 'app-streamnexus.apk');

    setApkUploading(true);
    try {
      const res = await fetch('/upload_app.php', {
        method: 'POST',
        body: formData
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setApkError((data && (data.error as string)) || `Error ${res.status} al subir el APK`);
        return;
      }

      if (data && data.success) {
        setApkOk('APK subido correctamente como app-streamnexus.apk');
      } else {
        setApkError((data && (data.error as string)) || 'No se pudo subir el APK');
      }
    } catch {
      setApkError('Error de red al subir el APK.');
    } finally {
      setApkUploading(false);
    }
  };

  const saveVersion = async () => {
    setVersionError(null);
    setVersionOk(null);

    if (!isValidStreamNexusVersion(nextVersion)) {
      setVersionError('La versión debe cumplir el formato X.X, donde cada X es un dígito entre 0 y 9.');
      return;
    }

    setVersionSaving(true);
    try {
      const res = await fetch('/update_version.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: nextVersion })
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setVersionError((data && (data.error as string)) || `Error ${res.status} al guardar la versión`);
        return;
      }

      if (data && data.success) {
        setVersionOk('Versión actualizada.');
        await loadVersion();
      } else {
        setVersionError((data && (data.error as string)) || 'No se pudo actualizar la versión');
      }
    } catch {
      setVersionError('Error de red al actualizar la versión.');
    } finally {
      setVersionSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Version App</h2>
          <p className="text-sm text-gray-500">Sube el APK y controla el número de versión en JSON.</p>
        </div>
        <button
          onClick={loadVersion}
          disabled={versionLoading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors shadow-sm"
        >
          <RefreshCw className={`h-4 w-4 ${versionLoading ? 'animate-spin' : ''}`} />
          Recargar JSON
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-gray-700" />
            <h3 className="text-base font-semibold text-gray-800">Subir APK</h3>
          </div>
          <a
            href={apkUrl}
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            <Download className="h-4 w-4" />
            Descarga directa
          </a>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Archivo APK</label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => apkInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    apkInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setApkDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setApkDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setApkDragOver(false);
                  const file = e.dataTransfer.files?.[0] || null;
                  setApkCandidate(file);
                }}
                className={`flex flex-col items-center justify-center w-full rounded-lg border-2 border-dashed p-6 text-sm transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-blue-500 ${
                  apkDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 text-gray-700">
                  <Upload className="h-4 w-4" />
                  <span>Arrastra y suelta el APK aquí, o haz clic para seleccionarlo</span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {apkFile ? `Seleccionado: ${apkFile.name}` : 'Solo archivos .apk'}
                </div>
                <input
                  ref={apkInputRef}
                  type="file"
                  accept=".apk"
                  onChange={(e) => setApkCandidate(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Se guardará como app-streamnexus.apk
              </p>
            </div>
            <button
              onClick={uploadApk}
              disabled={apkUploading || !apkFile}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {apkUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Subir
            </button>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500">Link directo del APK</div>
            <div className="mt-1 font-mono text-sm text-gray-800 break-all">{apkUrl}</div>
          </div>

          {apkError && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <div>{apkError}</div>
            </div>
          )}
          {apkOk && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
              {apkOk}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Save className="h-5 w-5 text-gray-700" />
            <h3 className="text-base font-semibold text-gray-800">Control de Versión (JSON)</h3>
          </div>
          <a
            href={jsonUrl}
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            <Download className="h-4 w-4" />
            Link JSON
          </a>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Versión actual</label>
              <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-800">
                {versionLoading ? 'Cargando…' : currentVersion ?? '—'}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nueva versión</label>
              <input
                type="text"
                inputMode="decimal"
                value={nextVersion}
                onChange={(e) => {
                  setVersionError(null);
                  setVersionOk(null);
                  const value = e.target.value;
                  if (value === '') {
                    setNextVersion(value);
                    return;
                  }
                  if (/^[0-9](\.[0-9]?)?$/.test(value)) {
                    setNextVersion(value);
                  }
                }}
                maxLength={3}
                placeholder="2.9"
                pattern="[0-9]\\.[0-9]"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={saveVersion}
              disabled={versionSaving || versionLoading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition-colors shadow-sm"
            >
              {versionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500">Link directo del JSON</div>
            <div className="mt-1 font-mono text-sm text-gray-800 break-all">{jsonUrl}</div>
          </div>

          {versionError && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <div>{versionError}</div>
            </div>
          )}
          {versionOk && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
              {versionOk}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
