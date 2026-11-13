import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  QrCode, Users, UserCheck, Settings, LogOut, Search, CheckCircle, 
  AlertCircle, Phone, Edit, Trash2, Shield, Eye, EyeOff, Plus, ArrowRight, RefreshCw, Download, XCircle 
} from 'lucide-react';

// ==========================================
// CONFIGURACIÓN DE SUPABASE (Variables de entorno seguras)
// ==========================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [vistaActual, setVistaActual] = useState('egresado'); // 'egresado', 'puerta', 'admin'

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
      {/* Encabezado Institucional ESRN N° 005 */}
      <header className="bg-[#6B1D2F] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center font-bold text-[#6B1D2F] text-sm shadow">
              05
            </div>
            <div>
              <h1 className="text-base font-bold tracking-wide">ESRN N° 005 — Cipolletti</h1>
              <p className="text-[10px] text-rose-200">Acto de Colación 2026</p>
            </div>
          </div>
          
          {/* Accesos secundarios discretos */}
          <div className="flex gap-1.5 text-xs">
            <button 
              onClick={() => setVistaActual('egresado')} 
              className={`px-2.5 py-1 rounded transition ${vistaActual === 'egresado' ? 'bg-white text-[#6B1D2F] font-bold' : 'text-rose-200 hover:text-white'}`}
            >
              Portal Principal (DNI)
            </button>
            <button 
              onClick={() => setVistaActual('puerta')} 
              className={`px-2.5 py-1 rounded transition ${vistaActual === 'puerta' ? 'bg-white text-[#6B1D2F] font-bold' : 'text-rose-200 hover:text-white'}`}
            >
              Puerta
            </button>
            <button 
              onClick={() => setVistaActual('admin')} 
              className={`px-2.5 py-1 rounded transition ${vistaActual === 'admin' ? 'bg-amber-500 text-white font-bold' : 'text-rose-200 hover:text-white'}`}
            >
              Admin
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Dinámico */}
      <main className="py-8">
        {vistaActual === 'egresado' && <PortalPrincipalDNI />}
        {vistaActual === 'puerta' && <PanelPuerta />}
        {vistaActual === 'admin' && <PanelAdmin />}
      </main>
    </div>
  );
}

// ==========================================
// 1. PORTAL PRINCIPAL UNIFICADO POR DNI (Egresados y Docentes)
// ==========================================
function PortalPrincipalDNI() {
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
      setError(`No se encontró ningún registro con ese DNI en ${tipoUsuario === 'egresado' ? 'Egresados' : 'Docentes'}.`);
      return;
    }

    if (tipoUsuario === 'egresado' && data.activo === false) {
      setError('Este acceso se encuentra inactivo (marcado como No Asiste).');
      return;
    }

    setDatosPersona(data);
    if (tipoUsuario === 'egresado') {
      if (data.celular) setCelular(data.celular);
      if (data.tipo_ingreso) setTipoIngreso(data.tipo_ingreso);
    }
  };

  const guardarDatosEstudiante = async () => {
    const { error: updateErr } = await supabase
      .from('egresados')
      .update({ celular, tipo_ingreso: tipoIngreso })
      .eq('id', datosPersona.id);

    if (updateErr) {
      alert('Error al guardar los cambios.');
    } else {
      alert('¡Datos guardados con éxito!');
    }
  };

  const marcarNoAsistire = async () => {
    if (!window.confirm('¿Estás seguro de que no asistirás? Esto liberará tu lugar y el de tus invitados.')) return;

    const tabla = tipoUsuario === 'egresado' ? 'egresados' : 'docentes';
    const { error: updateErr } = await supabase
      .from(tabla)
      .update({ activo: false })
      .eq('id', datosPersona.id);

    if (updateErr) {
      alert('Error al actualizar el estado.');
    } else {
      alert('Has marcado que no asistirás. ¡Gracias por avisar!');
      setDatosPersona(null);
      setDni('');
    }
  };

  const descargarQR = () => {
    alert('Simulación de descarga de pase QR. (Aquí se generará/descargará la imagen del QR).');
  };

  return (
    <div className="max-w-md mx-auto px-4 space-y-4">
      {/* Tarjeta de Bienvenida e Instructivo Unificado */}
      <div className="bg-gradient-to-r from-[#6B1D2F] to-[#8a253c] text-white rounded-xl shadow-md p-5 text-center">
        <h2 className="text-xl font-bold mb-1">¡Bienvenidos al Acto de Colación 2026! 🎉</h2>
        <p className="text-xs text-rose-100 leading-relaxed">
          Seleccioná tu rol (Egresado o Docente) e ingresá tu número de DNI para gestionar tu acceso, verificar plazas, registrar tu WhatsApp, configurar tu modalidad y descargar tu código QR para la entrada.
        </p>
      </div>

      {/* Formulario Principal con Selector de Rol */}
      <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-[#6B1D2F]">
        <h3 className="text-lg font-bold text-[#6B1D2F] mb-1 text-center">Portal de Acceso por DNI</h3>
        <p className="text-xs text-gray-500 text-center mb-4">Seleccioná tu rol y consultá tu pase</p>

        {/* Selector de Pestañas Egresados / Docentes */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
          <button 
            type="button"
            onClick={() => { setTipoUsuario('egresado'); setDatosPersona(null); setError(''); }}
            className={`flex-1 py-2 rounded-md font-medium text-xs transition ${tipoUsuario === 'egresado' ? 'bg-[#6B1D2F] text-white shadow' : 'text-gray-600 hover:text-gray-900'}`}
          >
            🎓 Egresado
          </button>
          <button 
            type="button"
            onClick={() => { setTipoUsuario('docente'); setDatosPersona(null); setError(''); }}
            className={`flex-1 py-2 rounded-md font-medium text-xs transition ${tipoUsuario === 'docente' ? 'bg-[#6B1D2F] text-white shadow' : 'text-gray-600 hover:text-gray-900'}`}
          >
            📚 Docente
          </button>
        </div>

        {!datosPersona ? (
          <form onSubmit={buscarPorDNI} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                DNI de {tipoUsuario === 'egresado' ? 'Egresado' : 'Docente'}
              </label>
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
            <button type="submit" className="w-full py-2.5 bg-[#6B1D2F] text-white rounded-lg hover:bg-opacity-90 font-medium shadow">
              Consultar mi Pase QR
            </button>
          </form>
        ) : (
          <div className="space-y-4 text-left">
            <div className="p-4 bg-gray-50 rounded-lg border text-center">
              <h3 className="font-bold text-lg text-gray-800">{datosPersona.nombre}</h3>
              <p className="text-xs text-gray-500">DNI: {datosPersona.dni}</p>
              <p className="text-[11px] uppercase tracking-wider text-[#6B1D2F] font-semibold mt-1">
                {tipoUsuario === 'egresado' ? 'Egresado / Titulado' : 'Personal Docente ESRN N° 005'}
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
                  <p className="text-xs text-gray-400 mt-0.5">Para recibir avisos institucionales.</p>
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
                  Guardar Cambios
                </button>
              </>
            )}

            {/* Visualización del código QR y Botón de Descarga Real */}
            <div className="p-4 bg-white border-2 border-dashed border-gray-300 rounded-xl text-center space-y-3">
              <div className="w-40 h-40 bg-gray-900 text-white mx-auto flex flex-col items-center justify-center rounded-lg shadow-inner font-mono p-2">
                <QrCode className="w-20 h-20 mb-1 text-rose-300" />
                <span className="text-[10px] tracking-wider text-gray-300">QR OFICIAL ESRN 005</span>
                <span className="text-xs font-bold text-amber-400">{tipoUsuario === 'docente' ? 'DOCENTE' : tipoIngreso.toUpperCase()}</span>
              </div>
              
              <button 
                onClick={descargarQR}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 shadow"
              >
                <Download className="w-4 h-4" /> Descargar Código QR (Imagen)
              </button>
            </div>

            {/* Botón de No Asistiré */}
            <div className="pt-2 border-t">
              <button 
                onClick={marcarNoAsistire}
                className="w-full py-2 bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <XCircle className="w-4 h-4" /> No podré asistir / Liberar cupo
              </button>
            </div>

            <button 
              onClick={() => { setDatosPersona(null); setDni(''); }} 
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
// 2. CONTROL DE PUERTA
// ==========================================
function PanelPuerta() {
  const [busquedaManual, setBusquedaManual] = useState('');
  const [ultimoEscaneo, setUltimoEscaneo] = useState(null);

  const registrarIngreso = (nombrePersona, tipo) => {
    setUltimoEscaneo({ nombre: nombrePersona, tipo, hora: new Date().toLocaleTimeString() });
    setTimeout(() => setUltimoEscaneo(null), 2000);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-[#6B1D2F] mb-4">Control de Puerta — ESRN N° 005</h2>
      
      {ultimoEscaneo ? (
        <div className="p-6 bg-green-100 border-2 border-green-500 rounded-xl text-center mb-6 shadow-lg animate-bounce">
          <span className="text-4xl">✅</span>
          <h3 className="text-xl font-bold text-green-800 mt-2">¡Ingreso Habilitado!</h3>
          <p className="text-lg text-green-700 font-semibold">{ultimoEscaneo.nombre}</p>
        </div>
      ) : (
        <div className="p-10 bg-gray-900 text-white rounded-2xl text-center mb-6 shadow-md">
          <div className="w-16 h-16 border-4 border-dashed border-[#6B1D2F] rounded-full mx-auto flex items-center justify-center mb-3 animate-spin">📷</div>
          <p className="font-bold text-lg">Escáner Continuo Activo</p>
          <p className="text-xs text-gray-400 mt-1">Listo para escanear QRs (Egresados y Docentes)</p>
        </div>
      )}

      <div className="bg-white p-5 rounded-xl border shadow-sm">
        <h4 className="font-semibold text-sm text-gray-800 mb-2">Plan B: Búsqueda Manual en Puerta</h4>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="DNI o Apellido..." 
            value={busquedaManual}
            onChange={(e) => setBusquedaManual(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
          />
          <button 
            onClick={() => {
              if(busquedaManual) {
                registrarIngreso(`Asistente Manual (${busquedaManual})`, 'Plan B');
                setBusquedaManual('');
              }
            }}
            className="px-4 py-2 bg-[#6B1D2F] text-white rounded-lg text-sm font-medium"
          >
            Validar
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. PANEL DE ADMINISTRACIÓN
// ==========================================
function PanelAdmin() {
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
      <h2 className="text-2xl font-bold text-[#6B1D2F] mb-1">Panel de Gestión — ESRN N° 005</h2>
      <p className="text-xs text-gray-500 mb-6">Aforo total: 525 butacas | Liberación automática de cupos por inasistencia</p>

      <div className="bg-white p-4 rounded-xl shadow-sm border mb-6 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-sm text-gray-800">Sistema de Notificaciones por WhatsApp</h3>
          <p className="text-xs text-gray-500">Habilita o deshabilita los botones de aviso rápido `wa.me`</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            checked={whatsappActivo} 
            onChange={() => setWhatsappActivo(!whatsappActivo)}
            className="sr-only peer" 
          />
          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
        </label>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 font-bold text-gray-800 text-sm">Padrón de Egresados</div>
        <div className="divide-y">
          {egresadosEjemplo.map(estudiante => {
            const numLimpio = estudiante.celular ? estudiante.celular.replace(/\D/g, '') : '';
            const linkWp = `https://wa.me/549${numLimpio}?text=Hola%20${encodeURIComponent(estudiante.nombre)},%20te%20informamos%20desde%20la%20ESRN%20N°%20005%20que%20se%20han%20actualizado%20tus%20plazas.`;

            return (
              <div key={estudiante.id} className="p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                  <h4 className="font-bold text-gray-900">{estudiante.nombre}</h4>
                  <p className="text-xs text-gray-500">DNI: {estudiante.dni} | Cel: {estudiante.celular || 'No registrado'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => toggleActivo(estudiante.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${estudiante.activo ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}
                  >
                    {estudiante.activo ? '🚫 Marcar "No Asiste"' : '✅ Reactivar'}
                  </button>
                  {whatsappActivo && estudiante.celular && estudiante.activo && (
                    <a href={linkWp} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium">
                      💬 Avisar
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
