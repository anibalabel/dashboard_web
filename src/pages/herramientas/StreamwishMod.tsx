import { useState, useEffect } from 'react';
import { Copy, CheckCircle, Flame, RefreshCw, Save, RotateCcw, Check, Sparkles, AlertCircle, ExternalLink } from 'lucide-react';
import { copyToClipboard } from '../../lib/clipboard';
import { 
  getStreamwishBaseUrl, 
  setStreamwishBaseUrl, 
  normalizeStreamwishBase, 
  DEFAULT_STREAMWISH_BASE,
  formatStreamwishUrl,
  subscribeStreamwishConfig
} from '../../lib/streamwishUtils';
import { useSnackbarStore } from '../../store/snackbarStore';

const PRESET_DOMAINS = [
  { label: 'streamwish.fun (Predeterminado)', value: 'https://streamwish.fun/e/' },
  { label: 'streamwish.to', value: 'https://streamwish.to/e/' },
  { label: 'streamwish.top', value: 'https://streamwish.top/e/' },
  { label: 'embedwish.com', value: 'https://embedwish.com/e/' },
  { label: 'wishembed.pro', value: 'https://wishembed.pro/e/' },
  { label: 'swishsrv.com', value: 'https://swishsrv.com/e/' },
  { label: 'awish.pro', value: 'https://awish.pro/e/' },
];

export default function StreamwishMod() {
  const { showSnackbar } = useSnackbarStore();
  const [currentBaseUrl, setCurrentBaseUrl] = useState<string>(DEFAULT_STREAMWISH_BASE);
  const [inputDomain, setInputDomain] = useState<string>(DEFAULT_STREAMWISH_BASE);
  const [isSaving, setIsSaving] = useState(false);
  const [inputUrls, setInputUrls] = useState('');
  const [outputUrls, setOutputUrls] = useState('');
  const [copied, setCopied] = useState(false);

  // Cargar y suscribir configuración
  useEffect(() => {
    const initial = getStreamwishBaseUrl();
    setCurrentBaseUrl(initial);
    setInputDomain(initial);

    const unsubscribe = subscribeStreamwishConfig((newUrl) => {
      setCurrentBaseUrl(newUrl);
    });

    return () => unsubscribe();
  }, []);

  // Procesar URLs dinámicamente cuando cambien los inputs o el dominio
  useEffect(() => {
    if (!inputUrls.trim()) {
      setOutputUrls('');
      return;
    }

    const lines = inputUrls.split('\n');
    const processed = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      return formatStreamwishUrl(trimmed, 'streamwish', currentBaseUrl);
    });

    setOutputUrls(processed.filter(Boolean).join('\n'));
  }, [inputUrls, currentBaseUrl]);

  const handleSaveConfig = async (domainToSave?: string) => {
    const target = domainToSave || inputDomain;
    if (!target.trim()) return;

    setIsSaving(true);
    try {
      const normalized = await setStreamwishBaseUrl(target, true);
      setCurrentBaseUrl(normalized);
      setInputDomain(normalized);
      showSnackbar(`Dominio de Streamwish actualizado a ${normalized}`, 'success');
    } catch (e) {
      console.error(e);
      showSnackbar('Error al guardar la configuración', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefault = async () => {
    setIsSaving(true);
    try {
      const normalized = await setStreamwishBaseUrl(DEFAULT_STREAMWISH_BASE, true);
      setCurrentBaseUrl(normalized);
      setInputDomain(normalized);
      showSnackbar('Configuración de Streamwish restablecida por defecto (https://streamwish.fun/e/)', 'success');
    } catch (e) {
      console.error(e);
      showSnackbar('Error al restablecer configuración', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!outputUrls) return;
    const ok = await copyToClipboard(outputUrls);
    if (ok) {
      setCopied(true);
      showSnackbar('URLs copiadas al portapapeles', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isDefault = currentBaseUrl === DEFAULT_STREAMWISH_BASE;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/10 rounded-xl border border-orange-500/20 text-orange-600">
              <Flame className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                Configuración y Conversor Streamwish
              </h1>
              <p className="text-gray-600 text-sm mt-0.5">
                Define la URL base o dominio predeterminado para todos los enlaces extraídos de Streamwish en la plataforma.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Activo: {currentBaseUrl}
          </span>
        </div>
      </div>

      {/* Card 1: Panel de Configuración del Dominio */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-orange-50/50 to-amber-50/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-orange-500" />
                Dominio Predeterminado de Extracción
              </h2>
              <p className="text-xs text-gray-600 mt-1">
                Cualquier scraper (Pelisplus, Gnula, Cinemitas, CineHDPlus, Series.ly, Anime) convertirá automáticamente los links de Streamwish a esta URL.
              </p>
            </div>

            <button
              onClick={handleResetDefault}
              disabled={isSaving || isDefault}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-start sm:self-auto"
              title="Restablecer a https://streamwish.fun/e/"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restablecer Predeterminado
            </button>
          </div>

          {/* Formulario de cambio de dominio */}
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputDomain}
                onChange={(e) => setInputDomain(e.target.value)}
                placeholder="Ejemplo: https://streamwish.fun/e/ o streamwish.to"
                className="w-full rounded-xl border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 border px-4 py-2.5 text-sm font-mono"
              />
            </div>
            <button
              onClick={() => handleSaveConfig()}
              disabled={isSaving || !inputDomain.trim() || normalizeStreamwishBase(inputDomain) === currentBaseUrl}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar Dominio
            </button>
          </div>

          {/* Presets rápidos */}
          <div className="mt-4 pt-3 border-t border-orange-200/50">
            <div className="text-xs font-medium text-gray-500 mb-2">Selección rápida de dominios conocidos:</div>
            <div className="flex flex-wrap gap-2">
              {PRESET_DOMAINS.map((preset) => {
                const isCurrent = currentBaseUrl === preset.value;
                return (
                  <button
                    key={preset.value}
                    onClick={() => {
                      setInputDomain(preset.value);
                      handleSaveConfig(preset.value);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                      isCurrent
                        ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:bg-orange-50/50'
                    }`}
                  >
                    {isCurrent && <Check className="h-3 w-3" />}
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 bg-gray-50/60 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            <span>Formato resultante estándar: <code className="text-orange-700 font-bold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">{currentBaseUrl}VIDEO_ID</code></span>
          </div>
          <span className="hidden sm:inline text-gray-400">Persistencia local + Sincronización Firebase</span>
        </div>
      </div>

      {/* Card 2: Conversor en Lote / Tester Interactivo */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-blue-600" />
              Conversor y Probador en Lote
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              Pega cualquier lista de enlaces de Streamwish (cualquier dominio o variante: /e/, /f/, /d/, .html, ID directo) para convertirlos al formato activo.
            </p>
          </div>

          <button
            onClick={handleCopy}
            disabled={!outputUrls}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-colors ${
              copied
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {copied ? (
              <>
                <CheckCircle className="h-4 w-4" />
                ¡Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copiar Resultado
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-gray-200 divide-y md:divide-y-0 md:divide-x divide-gray-200 min-h-[380px]">
          {/* Input Textarea */}
          <div className="flex flex-col">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 font-medium text-xs text-gray-700 flex justify-between items-center">
              <span>URLs Originales de Entrada</span>
              <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-[11px]">
                {inputUrls.split('\n').filter(l => l.trim()).length} enlace(s)
              </span>
            </div>
            <textarea
              value={inputUrls}
              onChange={(e) => setInputUrls(e.target.value)}
              placeholder={`Pega aquí enlaces de Streamwish (uno por línea)...&#10;Ejemplos soportados:&#10;https://streamwish.to/e/3r0ttf5nvn5w&#10;https://embedwish.com/f/3r0ttf5nvn5w&#10;https://wishembed.pro/3r0ttf5nvn5w.html&#10;https://awish.pro/d/3r0ttf5nvn5w&#10;https://streamwish.top/3r0ttf5nvn5w`}
              className="flex-1 w-full p-4 resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500 font-mono text-sm block"
              spellCheck="false"
            />
          </div>

          {/* Output Textarea */}
          <div className="flex flex-col bg-gray-50/50">
            <div className="bg-orange-50/70 px-4 py-2.5 border-b border-orange-100 font-medium text-xs text-orange-900 flex justify-between items-center">
              <span>Resultado Normalizado ({currentBaseUrl})</span>
              <span className="bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full text-[11px]">
                {outputUrls.split('\n').filter(l => l.trim()).length} enlace(s)
              </span>
            </div>
            <textarea
              value={outputUrls}
              readOnly
              placeholder={`Los enlaces convertidos aparecerán aquí:&#10;${currentBaseUrl}3r0ttf5nvn5w`}
              className="flex-1 w-full p-4 resize-none bg-transparent focus:outline-none font-mono text-sm block text-gray-800"
              spellCheck="false"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
