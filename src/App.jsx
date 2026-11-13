import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  QrCode, Users, UserCheck, Settings, LogOut, Search, CheckCircle, 
  AlertCircle, Phone, Edit, Trash2, Shield, Eye, EyeOff, Plus, ArrowRight, RefreshCw, Download, XCircle 
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

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
// 1. PORTAL PRINCIPAL UNIFICADO POR DNI (Egresados, Docentes y VIP)
// ==========================================
function PortalPrincipalDNI() {
  const [dni, setDni] = useState('');
  const [tipoUsuario, setTipoUsuario] = useState('egresado'); // 'egresado', 'docente', 'vip'
  const [datosPersona, setDatosPersona] = useState(null);
  const [error, setError] = useState('');
  const [celular, setCelular] = useState('');
  const [tipoIngreso, setTipoIngreso] = useState('individual');
  const qrRef = useRef(null);

  const buscarPorDNI = async (e) => {
    e.preventDefault();
    setError('');
    setDatosPersona(null);

    let tabla = 'egresados';
    if (tipoUsuario === 'docente') tabla = 'docentes';
    if (tipoUsuario === 'vip') tabla = 'vip';

    const { data, error: err } = await supabase
      .from(tabla)
      .select('*')
      .eq('dni', dni.trim())
      .single();

    if (err || !data) {
      setError(`No se encontró ningún registro con ese DNI en ${tipoUsuario.toUpperCase()}.`);
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
    if (!window.confirm('¿Estás seguro de que no asistirás? Esto liberará tu lugar.')) return;

    let tabla = 'egresados';
    if (tipoUsuario === 'docente') tabla = 'docentes';
    if (tipoUsuario === 'vip') tabla = 'vip';

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

  // Función de descarga para generar la tarjeta 1080x1920 con el nombre real arriba y el rol correspondiente abajo
  const descargarTarjeta1080x1920 = () => {
    const svgElement = qrRef.current?.querySelector('svg');
    if (!svgElement) {
      alert('No se pudo generar la imagen del QR.');
      return;
    }

    try {
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const qrImage = new Image();
      qrImage.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 1080;
          canvas.height = 1920;
          const ctx = canvas.getContext('2d');

          // 1. Fondo general gris claro
          ctx.fillStyle = '#F3F4F6';
          ctx.fillRect(0, 0, 1080, 1920);

          // 2. Encabezado institucional Borgoña (#6B1D2F)
          ctx.fillStyle = '#6B1D2F';
          ctx.fillRect(0, 0, 1080, 380);

          // Texto de cabecera
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 42px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('ESRN N° 005 — CIPOLLETTI', 540, 120);

          ctx.fillStyle = '#FBCFE8';
          ctx.font = '26px sans-serif';
          ctx.fillText('Acto de Colación 2026 — Pase Oficial de Ingreso', 540, 180);

          // 3. Tarjeta blanca central con bordes redondeados
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(120, 440, 840, 1280, 30);
          } else {
            ctx.rect(120, 440, 840, 1280);
          }
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#E5E7EB';
          ctx.stroke();

          // 4. Extracción robusta del nombre (Arriba) y Rol aclarado abajo
          const nombreTitular = (
            datosPersona.nombre || 
            datosPersona.name || 
            datosPersona.apellido || 
            datosPersona.docente || 
            datosPersona.profesor || 
            datosPersona.fullname || 
            datosPersona.full_name || 
            datosPersona.docente_nombre || 
            datosPersona.egresado || 
            (datosPersona.apellidos ? `${datosPersona.apellidos}, ${datosPersona.nombre}` : '') || 
            'ASISTENTE ESRN N° 005'
          );
          const dniTitular = datosPersona.dni || dni;

          // Nombre grande y destacado arriba
          ctx.fillStyle = '#111827';
          ctx.font = 'bold 44px sans-serif';
          ctx.fillText(String(nombreTitular).toUpperCase(), 540, 580);

          ctx.fillStyle = '#4B5563';
          ctx.font = '32px sans-serif';
          ctx.fillText(`DNI: ${dniTitular}`, 540, 650);

          // Rol aclarado abajo (DOCENTE, VIP o EGRESADO)
          ctx.fillStyle = '#6B1D2F';
          ctx.font = 'bold 28px sans-serif';
          let textoRol = 'EGRESADO / TITULADO';
          if (tipoUsuario === 'docente') textoRol = 'DOCENTE';
          if (tipoUsuario === 'vip') textoRol = 'INVITADO VIP / AUTORIDAD';
          ctx.fillText(textoRol, 540, 710);

          // 5. Dibujar el Código QR centrado (500x500 px)
          ctx.drawImage(qrImage, 290, 780, 500, 500);

          // 6. Información de modalidad
          ctx.fillStyle = '#374151';
          ctx.font = 'bold 30px sans-serif';
          ctx.fillText(tipoUsuario === 'egresado' ? `Modalidad: Ingreso ${tipoIngreso.toUpperCase()}` : `Pase Nominal ${tipoUsuario.toUpperCase()}`, 540, 1370);

          ctx.fillStyle = '#6B7280';
          ctx.font = '24px sans-serif';
          ctx.fillText('Válido para el ingreso al establecimiento', 540, 1430);

          // 7. Pie de página institucional
          ctx.fillStyle = '#9CA3AF';
          ctx.font = '24px sans-serif';
          ctx.fillText('Presentar este pase en puerta (digital o impreso)', 540, 1810);

          const pngUrl = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = pngUrl;
          downloadLink.download = `Pase-Oficial-ESRN005-${dniTitular}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        } catch (canvasErr) {
          console.error('Error al pintar canvas:', canvasErr);
          alert('Hubo un error al procesar la imagen del pase.');
        }
      };
      qrImage.onerror = () => {
        alert('Error al cargar la imagen del código QR.');
      };
      qrImage.src = blobURL;
    } catch (err) {
      console.error('Error en descarga:', err);
      alert('No se pudo iniciar la descarga de la tarjeta.');
    }
  };

  const nombreMostrado = datosPersona ? (
    datosPersona.nombre || 
    datosPersona.name || 
    datosPersona.apellido || 
    datosPersona.docente || 
    datosPersona.profesor || 
    datosPersona.fullname || 
    datosPersona.full_name || 
    datosPersona.docente_nombre || 
    datosPersona.egresado || 
    (datosPersona.apellidos ? `${datosPersona.apellidos}, ${datosPersona.nombre}` : '') || 
    'Asistente'
  ) : '';

  const valorQRTexto = datosPersona ? `ESRN005-${tipoUsuario.toUpperCase()}-${datosPersona.dni || dni}-${nombreMostrado}` : '';

  return (
    <div className="max-w-md mx-auto px-4 space-y-4">
      {/* Tarjeta de Bienvenida e Instructivo Unificado */}
      <div className="bg-gradient-to-r from-[#6B1D2F] to-[#8a253c] text-white rounded-xl shadow-md p-5 text-center">
        <h2 className="text-xl font-bold mb-1">¡Bienvenidos al Acto de Colación 2026! 🎉</h2>
        <p className="text-xs text-rose-100 leading-relaxed">
          Seleccioná tu rol (Egresado, Docente o VIP) e ingresá tu número de DNI para gestionar tu acceso, verificar plazas, registrar tu WhatsApp y descargar tu tarjeta de pase QR en alta resolución (1080x1920) para la entrada.
        </p>
      </div>

      {/* Formulario Principal con Selector de Rol */}
      <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-[#6B1D2F]">
        <h3 className="text-lg font-bold text-[#6B1D2F] mb-1 text-center">Portal de Acceso por DNI</h3>
        <p className="text-xs text-gray-500 text-center mb-4">Seleccioná tu rol y consultá tu pase</p>

        {/* Selector de Pestañas Egresados / Docentes / VIP */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
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
          <button 
            type="button"
            onClick={() => { setTipoUsuario('vip'); setDatosPersona(null); setError(''); }}
            className={`flex-1 py-2 rounded-md font-medium text-xs transition ${tipoUsuario === 'vip' ? 'bg-amber-600 text-white shadow' : 'text-gray-600 hover:text-gray-900'}`}
          >
            ⭐ VIP
          </button>
        </div>

        {!datosPersona ? (
          <form onSubmit={buscarPorDNI} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                DNI de {tipoUsuario.toUpperCase()}
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
              <h3 className="font-bold text-lg text-gray-800">{nombreMostrado}</h3>
              <p className="text-xs text-gray-500">DNI: {datosPersona.dni || dni}</p>
              <p className="text-[11px] uppercase tracking-wider text-[#6B1D2F] font-semibold mt-1">
                {tipoUsuario === 'egresado' ? 'Egresado / Titulado' : tipoUsuario === 'docente' ? 'Docente' : 'Invitado VIP / Autoridad'}
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

            {/* Visualización del código QR (oculta para el canvas) y Botón de Descarga 1080x1920 */}
            <div className="p-4 bg-white border-2 border-dashed border-gray-300 rounded-xl text-center space-y-3">
              <div ref={qrRef} className="w-36 h-36 bg-white mx-auto flex items-center justify-center p-1 rounded border hidden">
                <QRCodeSVG value={valorQRTexto} size={130} level="H" includeMargin={true} />
              </div>
              
              <div className="p-3 bg-gray-50 rounded-lg border">
                <p className="text-xs font-bold text-[#6B1D2F] mb-1">Pase Oficial Generado</p>
                <p className="text-[11px] text-gray-500">Incluye el nombre del titular, DNI, institución y código QR en formato vertical (1080x1920).</p>
              </div>

              <button 
                type="button"
                onClick={descargarTarjeta1080x1920}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 shadow cursor-pointer"
              >
                <Download className="w-4 h-4" /> Descargar Tarjeta Pase (1080x1920)
              </button>
            </div>

            {/* Botón de No Asistiré / Liberar Cupo */}
            <div className="pt-2 border-t">
              <button 
                type="button"
                onClick={marcarNoAsistire}
                className="w-full py-2.5 bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <XCircle className="w-4 h-4" /> No podré asistir / Liberar cupo
              </button>
            </div>

            <button 
              type="button"
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
          <p className="text-xs text-gray-400 mt-1">Listo para escanear QRs (Egresados, Docentes y VIP)</p>
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
