import { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, Edit2, Loader2, Save, X, AlertCircle } from 'lucide-react';
import { ref, onValue, set } from 'firebase/database';
import { database } from '../../lib/firebase';
import { useSnackbarStore } from '../../store/snackbarStore';

export default function Dominios() {
  const { showSnackbar } = useSnackbarStore();
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const domainsRef = ref(database, 'allowed_domains/domains');
    const unsubscribe = onValue(domainsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Firebase a veces guarda arrays como objetos con índices si se eliminan elementos intermedios.
        // Esto asegura que siempre lo tratemos como un array limpio.
        const domainsArray = Array.isArray(data) ? data : Object.values(data);
        setDomains(domainsArray.filter(Boolean) as string[]);
      } else {
        setDomains([]);
      }
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Firebase read error:", err);
      setError("No se pudo leer la base de datos. Revisa las reglas de seguridad de Firebase.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const saveDomains = async (newDomainsList: string[], successMessage: string) => {
    setIsSaving(true);
    setError(null);
    try {
      await set(ref(database, 'allowed_domains/domains'), newDomainsList);
      showSnackbar(successMessage, 'success');
    } catch (err: any) {
      console.error("Error saving domains:", err);
      setError("Error al guardar. Asegúrate de tener permisos de escritura (.write: true) en las reglas de Firebase.");
      showSnackbar("Error al guardar en Firebase", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const normalizeDomain = (domain: string) => {
    return domain.trim().toLowerCase().replace(/\/$/, '');
  };

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    const domainToAdd = newDomain.trim();
    if (!domainToAdd) return;
    
    const isDuplicate = domains.some(
      (d) => normalizeDomain(d) === normalizeDomain(domainToAdd)
    );

    if (isDuplicate) {
      setError("Este dominio ya existe en la lista.");
      return;
    }

    const updatedDomains = [...domains, domainToAdd];
    saveDomains(updatedDomains, "Dominio agregado con éxito");
    setNewDomain('');
  };

  const handleDeleteDomain = (index: number) => {
    if (confirm('¿Estás seguro de que deseas eliminar este dominio?')) {
      const updatedDomains = domains.filter((_, i) => i !== index);
      saveDomains(updatedDomains, "Dominio eliminado con éxito");
    }
  };

  const startEditing = (index: number, value: string) => {
    setEditingIndex(index);
    setEditValue(value);
  };

  const saveEdit = () => {
    const newDomainValue = editValue.trim();
    if (!newDomainValue) return;

    const isDuplicate = domains.some(
      (d, idx) => idx !== editingIndex && normalizeDomain(d) === normalizeDomain(newDomainValue)
    );

    if (isDuplicate) {
      setError("Este dominio ya existe en la lista.");
      return;
    }

    const updatedDomains = [...domains];
    updatedDomains[editingIndex!] = newDomainValue;
    saveDomains(updatedDomains, "Dominio actualizado con éxito");
    setEditingIndex(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
    setError(null);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <Globe className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Dominios</h1>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Dominios Permitidos</h2>
          <p className="text-sm text-gray-600 mb-6">
            Agrega, edita o elimina los dominios que tienen acceso a tu aplicación a través de Firebase.
          </p>

          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 flex items-start gap-3 rounded-r-md">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleAddDomain} className="flex gap-3">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="Ej: https://midominio.com"
              className="flex-1 rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2 text-sm"
              disabled={isSaving || loading}
            />
            <button
              type="submit"
              disabled={!newDomain.trim() || isSaving || loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium transition-colors"
            >
              {isSaving && !editingIndex ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Agregar
            </button>
          </form>
        </div>

        <div className="bg-gray-50 p-6 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
              <p>Cargando dominios desde Firebase...</p>
            </div>
          ) : domains.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-white rounded-lg border border-dashed border-gray-300">
              <Globe className="h-12 w-12 mb-3 opacity-20" />
              <p>No hay dominios registrados actualmente.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {domains.map((domain, index) => (
                <li key={index} className="bg-white border border-gray-200 rounded-md p-4 flex items-center justify-between shadow-sm hover:border-blue-300 transition-colors">
                  {editingIndex === index ? (
                    <div className="flex items-center gap-3 w-full">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 rounded-md border border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-1.5 text-sm"
                        autoFocus
                      />
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={saveEdit}
                          disabled={!editValue.trim() || isSaving}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-md transition-colors disabled:opacity-50"
                          title="Guardar"
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={isSaving}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
                          title="Cancelar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 truncate">
                        <span className="flex-shrink-0 h-2 w-2 rounded-full bg-green-500"></span>
                        <span className="text-gray-700 font-medium truncate">{domain}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => startEditing(index, domain)}
                          disabled={isSaving}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteDomain(index)}
                          disabled={isSaving}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}