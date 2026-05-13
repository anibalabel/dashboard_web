import React, { useState, useEffect } from 'react';
import { Copy, CheckCircle, Wrench } from 'lucide-react';

export default function UqloadMod() {
  const [inputUrls, setInputUrls] = useState('');
  const [outputUrls, setOutputUrls] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const processUrls = (text: string) => {
      const urls = text.split('\n');
      const processedUrls = urls.map(line => {
        const url = line.trim();
        if (!url) return '';
        
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/');
          const lastPart = pathParts[pathParts.length - 1];
          
          if (lastPart && !lastPart.startsWith('embed-')) {
            pathParts[pathParts.length - 1] = 'embed-' + lastPart;
            urlObj.pathname = pathParts.join('/');
          }
          return urlObj.toString();
        } catch {
          // Fallback if it's not a proper URL with scheme
          const parts = url.split('/');
          const lastPart = parts[parts.length - 1];
          if (lastPart && !lastPart.startsWith('embed-')) {
            parts[parts.length - 1] = 'embed-' + lastPart;
          }
          return parts.join('/');
        }
      });
      
      setOutputUrls(processedUrls.filter(u => u !== '').join('\n'));
    };

    processUrls(inputUrls);
  }, [inputUrls]);

  const handleCopy = async () => {
    if (!outputUrls) return;
    try {
      await navigator.clipboard.writeText(outputUrls);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Wrench className="h-6 w-6 text-blue-600" />
            Uqload Mod
          </h1>
          <p className="text-gray-600 mt-1">
            Convierte y añade "embed-" a los enlaces de Uqload, Voe, etc.
          </p>
        </div>
        <button
          onClick={handleCopy}
          disabled={!outputUrls}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-250px)] min-h-[400px]">
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
            placeholder="Pega aquí tu lista de enlaces (uno por línea)...&#10;Ejemplo: https://uqload.is/xbsidtff7mme.html"
            className="flex-1 w-full p-4 resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 font-mono text-sm block"
            spellCheck="false"
          />
        </div>

        {/* Output */}
        <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 font-medium text-blue-800 flex justify-between items-center">
            <span>Resultado Modificado</span>
            <span className="text-xs bg-blue-200 text-blue-700 px-2 py-1 rounded-full">
              {outputUrls.split('\n').filter(l => l.trim()).length} lineas
            </span>
          </div>
          <textarea
            value={outputUrls}
            readOnly
            placeholder="Aquí aparecerán los enlaces con el 'embed-' añadido..."
            className="flex-1 w-full p-4 resize-none bg-gray-50 focus:outline-none font-mono text-sm block text-gray-700"
            spellCheck="false"
          />
        </div>
      </div>
    </div>
  );
}
