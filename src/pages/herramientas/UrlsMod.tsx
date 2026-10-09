import React, { useState } from 'react';
import { Copy, CheckCircle, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { copyToClipboard } from '../../lib/clipboard';

export default function UrlsMod() {
  const [inputUrls, setInputUrls] = useState('');
  const [searchDomain, setSearchDomain] = useState('');
  const [replaceDomain, setReplaceDomain] = useState('');
  const [outputUrls, setOutputUrls] = useState('');
  const [copied, setCopied] = useState(false);

  const handleProcess = () => {
    const urls = inputUrls.split('\n');
    const processedUrls = urls.map(line => {
      const url = line.trim();
      if (!url) return '';
      
      const search = searchDomain.trim();
      const replace = replaceDomain.trim();
      
      if (!search || !replace) return url;

      try {
        const urlObj = new URL(url);
        if (urlObj.hostname === search || urlObj.host === search) {
            // Reemplazo limpio a nivel de la API de URL de JS
            urlObj.hostname = replace;
            return urlObj.toString();
        }
        // Fallback de string si es un segmento que no coincide exactamente (ej. subdominios)
        return url.replace(search, replace);
      } catch {
        // Si hay algún error analizando, fallback a reemplazo simple de texto
        return url.replace(search, replace);
      }
    });
    
    setOutputUrls(processedUrls.filter(u => u !== '').join('\n'));
  };

  const handleCopy = async () => {
    if (!outputUrls) return;
    const ok = await copyToClipboard(outputUrls);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <LinkIcon className="h-6 w-6 text-green-600" />
            URLS Mod
          </h1>
          <p className="text-gray-600 mt-1">
            Reemplaza masivamente un dominio por otro en una lista de enlaces.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleProcess}
            disabled={!inputUrls.trim() || !searchDomain.trim() || !replaceDomain.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className="h-4 w-4" />
            Procesar Cambios
          </button>

          <button
            onClick={handleCopy}
            disabled={!outputUrls}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              copied
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
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
      </div>

      {/* Controles de Dominio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dominio Original (Buscar)
          </label>
          <input
            type="text"
            value={searchDomain}
            onChange={(e) => setSearchDomain(e.target.value)}
            placeholder="Ejemplo: hglink.to"
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
          />
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nuevo Dominio (Reemplazar por)
          </label>
          <input
            type="text"
            value={replaceDomain}
            onChange={(e) => setReplaceDomain(e.target.value)}
            placeholder="Ejemplo: masukestin.com"
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 border p-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-350px)] min-h-[300px]">
        {/* Input */}
        <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 font-medium text-gray-700 flex justify-between items-center">
            <span>Urls Originales</span>
            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
              {inputUrls.split('\n').filter(l => l.trim()).length} lineas
            </span>
          </div>
          <textarea
            value={inputUrls}
            onChange={(e) => setInputUrls(e.target.value)}
            placeholder="Pega aquí tu lista de enlaces...&#10;Ejemplo: https://hglink.to/e/3r0ttf5nvn5w"
            className="flex-1 w-full p-4 resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500 font-mono text-sm block"
            spellCheck="false"
          />
        </div>

        {/* Output */}
        <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-green-50 px-4 py-3 border-b border-green-100 font-medium text-green-800 flex justify-between items-center">
            <span>URLs Modificadas</span>
            <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full">
              {outputUrls.split('\n').filter(l => l.trim()).length} lineas
            </span>
          </div>
          <textarea
            value={outputUrls}
            readOnly
            placeholder="Aquí aparecerán los enlaces con el dominio nuevo..."
            className="flex-1 w-full p-4 resize-none bg-gray-50 focus:outline-none font-mono text-sm block text-gray-700"
            spellCheck="false"
          />
        </div>
      </div>
    </div>
  );
}
