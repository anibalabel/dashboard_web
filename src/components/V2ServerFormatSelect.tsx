import { V2_SERVER_FORMAT_OPTIONS, V2ServerFormatMode } from '../lib/registrationUtils';

interface V2ServerFormatSelectProps {
  value: V2ServerFormatMode;
  onChange: (mode: V2ServerFormatMode) => void;
}

/**
 * Selector reutilizable para definir cómo se guarda la columna `server` en los registros masivos V2.
 */
export function V2ServerFormatSelect({ value, onChange }: V2ServerFormatSelectProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Formato de Calidad (campo <code className="text-xs">server</code>)
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as V2ServerFormatMode)}
        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm bg-white"
      >
        {V2_SERVER_FORMAT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-500 mt-1">
        Define qué se guarda en <code className="text-[11px]">server</code>;{' '}
        <code className="text-[11px]">header</code> siempre conserva el Servidor normalizado.
      </p>
    </div>
  );
}
