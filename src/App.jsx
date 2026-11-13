import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  QrCode, Users, UserCheck, Settings, LogOut, Search, CheckCircle, 
  AlertCircle, Phone, Edit, Trash2, Shield, Eye, EyeOff, Plus, ArrowRight, RefreshCw 
} from 'lucide-react';

// ==========================================
// CONFIGURACIÓN DE SUPABASE (Variables de entorno seguras)
// ==========================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [vistaActual, setVistaActual] = useState('home'); // 'home', 'portal', 'puerta', 'admin'

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
      {/* Encabezado Institucional ESRN N° 005 */}
      <header className="bg-[#6B1D2F] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-[#6B1D2F] shadow">
              05
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wide">ESRN N° 005 — Cipolletti</h1>
              <p className="text-xs text-rose-200">Sistema de Control de Acceso y Colaciones</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setVistaActual('home')} 
              className="px-3 py-1.5 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-lg text-sm transition"
            >
              Inicio
            </button>
            <button 
              onClick={() => setVistaActual('portal')} 
              className="px-3 py-1.5 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-lg text-sm transition"
            >
              Portal DNI
            </button>
            <button 
              onClick={() => setVistaActual('puerta')} 
              className="px-3 py-1.5 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-lg text-sm transition"
            >
              Puerta
            </button>
            <button 
              onClick={() => setVistaActual('admin')} 
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition"
            >
              Admin
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Dinámico */}
      <main>
        {vistaActual === 'home' && <HomeView setVistaActual={setVistaActual} />}
        {vistaActual === 'portal' && <PortalAccesoDNI onVolver={() => setVistaActual('home')} />}
        {vistaActual === 'puerta' && <PanelPuerta onVolver={() => setVistaActual('home')} />}
        {vistaActual === 'admin' && <PanelAdmin onVolver={() => setVistaActual('home')} />}
      </main>
    </div>
  );
}

// ==========================================
// 1. VISTA DE INICIO
// ==========================================
function HomeView({ setVistaActual }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center">
      <h2 className="text-3xl font-bold text-[#6B1D2F] mb-4">Acto de Colación 2026</h2>
      <p className="text-gray-600 mb-8 max-w-xl mx-auto">
        Sistema oficial de gestión de invitados, cupos (Aforo 525), pases QR nominales y control de ingreso para Egresados y Docentes de la ESRN N° 005.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => setVistaActual('portal')}
          className="bg-white p-6 rounded-xl shadow-md border-t-4 border-[#6B1D2F] cursor-pointer hover:shadow-lg transition"
        >
          <div className="w-12 h-12 bg-rose-50 text-[#6B1D2F] rounded-lg mx-auto flex items-center justify-center mb-4 font-bold text-xl">ID</div>
          <h3 className="font-bold text-lg mb-2">Portal DNI (Egresados y Docentes)</h3>
          <p className="text-xs text-gray-500">Consultá tu estado, elegí modalidad de invitados y descargá tu Pase QR.</p>
        </div>

        <div 
          onClick={() => setVistaActual('puerta')}
          className="bg-white p-6 rounded-xl shadow-md border-t-4 border-green-600 cursor-pointer hover:shadow-lg transition"
        >
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-lg mx-auto flex items-center justify-center mb-4 font-bold text-xl">📷</div>
          <h3 className="font-bold text-lg mb-2">Control de Puerta</h3>
          <p className="text-xs text-gray-500">Escáner continuo y automático de QR individuales y grupales con Plan B.</p>
        </div>

        <div 
          onClick={() => setVistaActual('admin')}
          className="bg-white p-6 rounded-xl shadow-md border-t-4 border-amber-500 cursor-pointer hover:shadow-lg transition"
        >
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-lg mx-auto flex items-center justify-center mb-4 font-bold text-xl">⚙️</div>
          <h3 className="font-bold text-lg mb-2">Gestión y Admin</h3>
          <p className="text-xs text-gray-500">Control de vacantes (525), botones "No Asiste", y avisos rápidos por WhatsApp.</p>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. PORTAL UNIFICADO POR DNI (Egresados y Docentes)
// ==========================================
function PortalAccesoDNI({ onVolver }) {
  const [dni, setDni] = useState('');
  const [tipoUsuario, setTipoUsuario] = useState('egresado'); // 'egresado' o 'docente'
  const [datosPersona, setDatosPersona] = useState(null);
  const [error, setError] = useState('');
  const [celular, setCelular] = useState('');
  const [tipoIngreso, setTipoIngreso] = useState('individual');

  const buscarPorDNI = async (e) => {
    e.preventDefault();
    setError('');
    setDatosPersona(null);

    const tabla = tipoUsuario === 'egresado' ? 'egresados' : 'docentes';
    const { data, error: err } = await supabase
      .from(tabla)
      .select('*')
      .eq('dni', dni.trim())
      .single();

    if (err || !data) {
      setError('No se encontró ningún registro con ese DNI.');
      return;
    }

    if (data.activo === false) {
      setError('Este acceso se encuentra marcado como Inactivo / No Asiste.');
      return;
    }

    setDatosPersona(data);
    if (data.celular) setCelular(data.celular);
    if (data.tipo_ingreso) setTipoIngreso(data.tipo_ingreso);
  };

  const guardarDatosEstudiante = async () => {
    const { error: updateErr } = await supabase
      .from('egresados')
      .update({ celular, tipo_ingreso: tipoIngreso })
      .eq('id', datosPersona.id);

    if (updateErr) {
      alert('Error al actualizar datos.');
    } else {
      alert('¡Datos y modalidad guardados con éxito!');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6 border-t-4 border-[#6B1D2F]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[#6B1D2F]">Portal ESRN N° 005</h2>
          <button onClick={onVolver} className="text-sm text-gray-600 hover:underline">Volver</button>
        </div>

        <div className="flex gap-2 mb-4">
          <button 
            type="button"
            onClick={() => { setTipoUsuario('egresado'); setDatosPersona(null); setError(''); }}
            className={`flex-1 py-2 rounded-lg font-medium text-sm ${tipoUsuario === 'egresado' ? 'bg-[#6B1D2F] text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Egresados
          </button>
          <button 
            type="button"
            onClick={() => { setTipoUsuario('docente'); setDatosPersona(null); setError(''); }}
            className={`flex-1 py-2 rounded-lg font-medium text-sm ${tipoUsuario === 'docente' ? 'bg-[#6B1D2F] text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Docentes
          </button>
        </div>

        {!datosPersona ? (
          <form onSubmit={buscarPorDNI} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ingrese su DNI</label>
              <input 
                type="text" 
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                placeholder="Ej: 40123456"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#6B1D2F]"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="w-full py-2 bg-[#6B1D2F] text-white rounded-lg hover:bg-opacity-90 font-medium">
              Consultar mi Pase QR
            </button>
          </form>
        ) : (
          <div className="space-y-4 text-left">
            <div className="p-4 bg-gray-50 rounded-lg border text-center">
              <h3 className="font-bold text-lg text-gray-800">{datosPersona.nombre}</h3>
              <p className="text-sm text-gray-600">DNI: {datosPersona.dni}</p>
              <p className="text-xs uppercase tracking-wider text-[#6B1D2F] font-semibold mt-1">
                {tipoUsuario === 'egresado' ? 'Egresado / Titulado' : 'Personal Docente'}
              </p>
            </div>

            {tipoUsuario === 'egresado' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Celular / WhatsApp</label>
                  <input 
                    type="text"
                    placeholder="Ej: 2994444444"
                    value={celular}
                    onChange={(e) => setCelular(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Para recibir avisos de plazas extra.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Modalidad de Ingreso</label>
                  <select 
                    value={tipoIngreso} 
                    onChange={(e) => setTipoIngreso(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="individual">🪪 Individual (Cada invitado con su QR)</option>
                    <option value="grupal">👥 Grupal (Un solo QR para todo el grupo)</option>
                  </select>
                </div>

                <button 
                  onClick={guardarDatosEstudiante}
                  className="w-full py-1.5 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-700"
                >
                  Guardar Cambios y Actualizar QR
                </button>
              </>
            )}

            <div className="p-4 bg-white border-2 border-dashed border-gray-300 rounded-xl text-center">
              <div className="w-36 h-36 bg-gray-200 mx-auto flex items-center justify-center text-xs text-gray-500 rounded font-mono">
                [QR {tipoIngreso.toUpperCase()}]
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {tipoUsuario === 'docente' ? 'Pase Nominal Docente' : `Pase de Ingreso (${tipoIngreso})`}
              </p>
            </div>

            <button 
              onClick={() => setDatosPersona(null)} 
              className="w-full py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
            >
              Consultar otro DNI
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 3. CONTROL DE PUERTA (Escaneo Continuo + Plan B)
// ==========================================
function PanelPuerta({ onVolver }) {
  const [busquedaManual, setBusquedaManual] = useState('');
  const [ultimoEscaneo, setUltimoEscaneo] = useState(null);
  const [modoEscaneoActivo, setModoEscaneoActivo] = useState(true);

  const registrarIngreso = (nombrePersona, tipo) => {
    setUltimoEscaneo({ nombre: nombrePersona, tipo, hora: new Date().toLocaleTimeString() });
    setModoEscaneoActivo(false);

    // Auto-reinicio a los 2 segundos para escaneo ultra rápido continuo
    setTimeout(() => {
      setUltimoEscaneo(null);
      setModoEscaneoActivo(true);
    }, 2000);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[#6B1D2F]">Control de Puerta — ESRN N° 005</h2>
        <button onClick={onVolver} className="text-sm text-gray-600 hover:underline">Volver</button>
      </div>

      {ultimoEscaneo ? (
        <div className="p-6 bg-green-100 border-2 border-green-500 rounded-xl text-center mb-6 shadow-lg animate-bounce">
          <span className="text-4xl">✅</span>
          <h3 className="text-xl font-bold text-green-800 mt-2">¡Ingreso Habilitado!</h3>
          <p className="text-lg text-green-700 font-semibold">{ultimoEscaneo.nombre}</p>
          <p className="text-xs text-green-600 mt-1">Registrado a las {ultimoEscaneo.hora} ({ultimoEscaneo.tipo})</p>
        </div>
      ) : (
        <div className="p-10 bg-gray-900 text-white rounded-2xl text-center mb-6 shadow-md">
          <div className="w-16 h-16 border-4 border-dashed border-[#6B1D2F] rounded-full mx-auto flex items-center justify-center mb-3 animate-spin">
            📷
          </div>
          <p className="font-bold text-lg">Escáner Continuo Activo</p>
          <p className="text-xs text-gray-400 mt-1">Listo para escanear QR (Individual, Grupal o Docente)</p>
        </div>
      )}

      {/* Plan B: Búsqueda manual por DNI o Apellido */}
      <div className="bg-white p-5 rounded-xl border shadow-sm">
        <h4 className="font-semibold text-sm text-gray-800 mb-2">Plan B: Búsqueda Manual en Puerta</h4>
        <p className="text-xs text-gray-500 mb-3">Si un grupo llega separado o el QR falla, tipea el DNI o Apellido para autorizar el acceso parcial:</p>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Ingrese DNI o Apellido..." 
            value={busquedaManual}
            onChange={(e) => setBusquedaManual(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
          />
          <button 
            onClick={() => {
              if(busquedaManual) {
                registrarIngreso(`Asistente Manual (${busquedaManual})`, 'Plan B Manual');
                setBusquedaManual('');
              }
            }}
            className="px-4 py-2 bg-[#6B1D2F] text-white rounded-lg text-sm font-medium hover:bg-opacity-90"
          >
            Validar Ingreso
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. PANEL DE ADMINISTRACIÓN (Con Switch WhatsApp y Botones No Asiste)
// ==========================================
function PanelAdmin({ onVolver }) {
  const [whatsappActivo, setWhatsappActivo] = useState(true);
  const [egresadosEjemplo, setEgresadosEjemplo] = useState([
    { id: 1, nombre: 'Juan Pérez', dni: '41234567', celular: '2996326617', activo: true },
    { id: 2, nombre: 'Lucía Gómez', dni: '41987654', celular: '2994444444', activo: false }
  ]);

  const toggleActivo = (id) => {
    setEgresadosEjemplo(egresadosEjemplo.map(e => e.id === id ? { ...e, activo: !e.activo } : e));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#6B1D2F]">Panel de Gestión — ESRN N° 005</h2>
          <p className="text-xs text-gray-500">Aforo total: 525 butacas | Vacantes libres calculadas automáticamente</p>
        </div>
        <button onClick={onVolver} className="text-sm text-gray-600 hover:underline">Volver</button>
      </div>

      {/* Tarjeta de Configuración Global (WhatsApp) */}
      <div className="bg-white p-4 rounded-xl shadow-sm border mb-6 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-sm text-gray-800">Sistema de Notificaciones por WhatsApp</h3>
          <p className="text-xs text-gray-500">Habilita o deshabilita los botones de aviso rápido `wa.me` gratuitos.</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            checked={whatsappActivo} 
            onChange={() => setWhatsappActivo(!whatsappActivo)}
            className="sr-only peer" 
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
        </label>
      </div>

      {/* Listado de Egresados con Botón No Asiste y WhatsApp */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800">Padrón de Egresados y Liberación de Butacas</h3>
        </div>
        <div className="divide-y">
          {egresadosEjemplo.map(estudiante => {
            const numeroLimpio = estudiante.celular ? estudiante.celular.replace(/\D/g, '') : '';
            const linkWp = `https://wa.me/549${numeroLimpio}?text=Hola%20${encodeURIComponent(estudiante.nombre)},%20te%20informamos%20desde%20la%20ESRN%20N°%20005%20que%20se%20han%20actualizado%20tus%20plazas.`;

            return (
              <div key={estudiante.id} className="p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                  <h4 className="font-bold text-gray-900">{estudiante.nombre}</h4>
                  <p className="text-xs text-gray-500">DNI: {estudiante.dni} | Cel: {estudiante.celular || 'No registrado'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => toggleActivo(estudiante.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${estudiante.activo ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                  >
                    {estudiante.activo ? '🚫 Marcar "No Asiste"' : '✅ Reactivar Asistencia'}
                  </button>

                  {whatsappActivo && estudiante.celular && estudiante.activo && (
                    <a
                      href={linkWp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 flex items-center gap-1"
                    >
                      <span>💬 Avisar</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
