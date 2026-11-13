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
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900 relative">
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
          
          {/* Accesos de navegación y Panel Administrativo claramente visible */}
          <div className="flex gap-1.5 text-xs items-center">
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
              className={`px-3 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white font-bold shadow transition ${vistaActual === 'admin' ? 'ring-2 ring-white' : ''}`}
            >
              Administración
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Dinámico */}
      <main className="py-8 pb-20">
        {vistaActual === 'egresado' && <PortalPrincipalDNI />}
        {vistaActual === 'puerta' && <PanelPuerta />}
        {vistaActual === 'admin' && <PanelAdmin />}
      </main>

      {/* Botón Flotante de Ayuda por WhatsApp */}
      <a
        href="https://wa.me/5492996326617?text=Hola,%20necesito%20ayuda%20con%20el%20sistema%20de%20acceso%20de%20la%20Colación%20ESRN%20N°%20005."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-green-600 hover:bg-green-700 text-white p-3.5 rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
        title="¿Necesitas ayuda? Escribinos por WhatsApp"
      >
        <Phone className="w-6 h-6" />
      </a>
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
  const [invitados, setInvitados] = useState([
    { id: 1, nombre: '', dni: '', grupal: false },
    { id: 2, nombre: '', dni: '', grupal: false },
    { id: 3, nombre: '', dni: '', grupal: false },
    { id: 4, nombre: '', dni: '', grupal: false }
  ]);
  const qrRef = useRef(null);

  const buscarPorDNI = async (e) => {
    e.preventDefault();
    setError('');
    setDatosPersona(null);

    let tabla = 'egresados';
    if (tipoUsuario === 'docente') tabla = 'docentes';
    if (tipoUsuario === 'vip') tabla = 'vip';

    let { data, error: err } = await supabase
      .from(tabla)
      .select('*')
      .eq('dni', dni.trim())
      .single();

    if ((err || !data) && tipoUsuario === 'vip') {
      const resAlt = await supabase
        .from('invitados_especiales')
        .select('*')
        .eq('dni', dni.trim())
        .single();
      data = resAlt.data;
      err = resAlt.error;
    }

    if (err || !data) {
      setError(`No se encontró ningún registro con ese DNI en ${tipoUsuario.toUpperCase()}.`);
      return;
    }

    if (tipoUsuario === 'egresado' && data.activo === false) {
      setError('Este acceso se encuentra inactivo (marcado como No Asiste).');
      return;
    }

    console.log("Datos recuperados de Supabase:", data);
    setDatosPersona(data);
    if (tipoUsuario === 'egresado') {
      if (data.celular) setCelular(data.celular);
    }
  };

  const actualizarInvitado = (index, campo, valor) => {
    const nuevosInvitados = [...invitados];
    nuevosInvitados[index][campo] = valor;
    setInvitados(nuevosInvitados);
  };

  const guardarDatosEstudiante = async () => {
    for (let i = 0; i < invitados.length; i++) {
      const inv = invitados[i];
      if ((inv.nombre && !inv.dni) || (!inv.nombre && inv.dni)) {
        alert(`Por favor revise el invitado #${i + 1}: complete tanto el nombre como el DNI, o déjelos vacíos.`);
        return;
      }
    }

    const { error: updateErr } = await supabase
      .from('egresados')
      .update({ celular })
      .eq('id', datosPersona.id);

    if (updateErr) {
      alert('Error al guardar los cambios.');
    } else {
      alert('¡Datos e invitados guardados con éxito! Recuerde revisar bien los datos antes del acto.');
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

  const obtenerNombreReal = (obj) => {
    if (!obj) return '';
    return (
      obj.nombre_completo || 
      obj.nombre || 
      obj.name || 
      obj.apellido || 
      obj.docente || 
      obj.profesor || 
      obj.fullname || 
      obj.full_name || 
      obj.docente_nombre || 
      obj.egresado || 
      obj.persona || 
      obj.titular || 
      (obj.apellidos ? `${obj.apellidos}, ${obj.nombre}` : '') ||
      ''
    );
  };

  const descargarTarjeta1080x1920 = (nombreQR, subtituloQR, textoRolQR) => {
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

          ctx.fillStyle = '#F3F4F6';
          ctx.fillRect(0, 0, 1080, 1920);

          ctx.fillStyle = '#6B1D2F';
          ctx.fillRect(0, 0, 1080, 380);

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 42px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('ESRN N° 005 — CIPOLLETTI', 540, 120);

          ctx.fillStyle = '#FBCFE8';
          ctx.font = '26px sans-serif';
          ctx.fillText('Acto de Colación 2026 — Pase Oficial de Ingreso', 540, 180);

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

          ctx.fillStyle = '#111827';
          ctx.font = 'bold 44px sans-serif';
          ctx.fillText(String(nombreQR).toUpperCase(), 540, 580);

          ctx.fillStyle = '#4B5563';
          ctx.font = '32px sans-serif';
          ctx.fillText(subtituloQR, 540, 650);

          ctx.fillStyle = '#6B1D2F';
          ctx.font = 'bold 28px sans-serif';
          ctx.fillText(textoRolQR, 540, 710);

          ctx.drawImage(qrImage, 290, 780, 500, 500);

          ctx.fillStyle = '#374151';
          ctx.font = 'bold 30px sans-serif';
          ctx.fillText('Pase Autorizado para Ingreso', 540, 1370);

          ctx.fillStyle = '#6B7280';
          ctx.font = '24px sans-serif';
          ctx.fillText('Presentar en puerta (digital o impreso)', 540, 1430);

          ctx.fillStyle = '#9CA3AF';
          ctx.font = '24px sans-serif';
          ctx.fillText('ESRN N° 005 — Cipolletti', 540, 1810);

          const pngUrl = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = pngUrl;
          downloadLink.download = `Pase-Oficial-${nombreQR.replace(/\s+/g, '-')}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        } catch (canvasErr) {
          console.error('Error al pintar canvas:', canvasErr);
          alert('Hubo un error al procesar la imagen del pase.');
        }
      };
      qrImage.src = blobURL;
    } catch (err) {
      console.error('Error en descarga:', err);
    }
  };

  const nombreMostrado = obtenerNombreReal(datosPersona);
  const valorQRPrincipal = datosPersona ? `ESRN005-${tipoUsuario.toUpperCase()}-${datosPersona.dni || dni}-${nombreMostrado}` : '';
  const textoRolTarjeta = tipoUsuario === 'egresado' ? 'EGRESADO' : tipoUsuario === 'docente' ? 'DOCENTE' : 'INVITADO VIP';

  const gruposInvitados = invitados.reduce((acc, inv) => {
    if (!inv.nombre) return acc;
    const claveGrupo = inv.grupal ? 'Grupo General' : `Individual-${inv.nombre}`;
    if (!acc[claveGrupo]) acc[claveGrupo] = [];
    acc[claveGrupo].push(inv);
    return acc;
  }, {});

  return (
    <div className="max-w-md mx-auto px-4 space-y-4">
      {/* Tarjeta de Bienvenida e Instructivo Unificado */}
      <div className="bg-gradient-to-r from-[#6B1D2F] to-[#8a253c] text-white rounded-xl shadow-md p-5 text-center">
        <h2 className="text-xl font-bold mb-1">¡Bienvenidos al Acto de Colación 2026! 🎉</h2>
        <p className="text-xs text-rose-100 leading-relaxed">
          {tipoUsuario === 'egresado' 
            ? 'Ingresá tu DNI, descargá tu QR personal justo abajo de tu nombre, cargá tus 4 invitados revisando bien los datos y tildá si entran en grupo o individual.'
            : tipoUsuario === 'docente'
            ? 'Ingresá tu DNI docente para consultar tu estado y descargar tu pase QR nominal.'
            : 'Ingresá tu DNI VIP para consultar y descargar tu pase institucional.'}
        </p>
      </div>

      {/* Formulario Principal con Selector de Rol */}
      <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-[#6B1D2F]">
        <h3 className="text-lg font-bold text-[#6B1D2F] mb-1 text-center">Portal de Acceso por DNI</h3>
        <p className="text-xs text-gray-500 text-center mb-4">Seleccioná tu rol y consultá tu pase</p>

        {/* Selector de Pestañas */}
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
            {/* Tarjeta de Identidad y QR Justo Abajo del Nombre */}
            <div className="p-4 bg-gray-50 rounded-lg border text-center space-y-3">
              <div>
                <h3 className="font-bold text-lg text-gray-800">{nombreMostrado || 'Asistente ESRN N° 005'}</h3>
                <p className="text-xs text-gray-500">DNI: {datosPersona.dni || dni}</p>
                <p className="text-[11px] uppercase tracking-wider text-[#6B1D2F] font-semibold mt-1">
                  {textoRolTarjeta}
                </p>
              </div>

              {/* Botón de descarga del QR personal justo abajo del nombre */}
              <button 
                type="button"
                onClick={() => descargarTarjeta1080x1920(nombreMostrado, `DNI: ${datosPersona.dni || dni}`, textoRolTarjeta)}
                className="w-full py-2.5 bg-[#6B1D2F] hover:bg-opacity-90 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow cursor-pointer"
              >
                <Download className="w-4 h-4" /> Descargar Mi QR Personal
              </button>
            </div>

            {/* QR Oculto para canvas */}
            <div className="hidden" ref={qrRef}>
              <QRCodeSVG value={valorQRPrincipal} size={300} level="H" includeMargin={true} />
            </div>

            {tipoUsuario === 'egresado' && (
              <>
                {/* Campo de WhatsApp / Celular Resaltado en Verde Fuerte */}
                <div className="border-2 border-emerald-500 bg-emerald-50 p-4 rounded-xl space-y-2 shadow-sm">
                  <label className="block text-xs font-bold text-emerald-900 uppercase tracking-wide">📱 Tu Celular / WhatsApp</label>
                  <input 
                    type="text"
                    placeholder="Ej: 2994444444"
                    value={celular}
                    onChange={(e) => setCelular(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-emerald-500 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-700 outline-none font-semibold text-emerald-900"
                  />
                  <p className="text-[11px] text-emerald-800 font-medium">Necesario para recibir notificaciones institucionales y avisos de plazas extra.</p>
                </div>

                {/* Formulario de Invitados Resaltado en Bordó */}
                <div className="border-2 border-[#6B1D2F] bg-rose-50/40 p-4 rounded-xl space-y-3 shadow-sm">
                  {/* Advertencia en Amarillo Intenso */}
                  <div className="bg-amber-100 border-2 border-amber-400 p-3 rounded-lg shadow-xs">
                    <p className="text-xs font-bold text-amber-900">⚠️ Recomendación Importante</p>
                    <p className="text-[11px] text-amber-900 mt-0.5 font-medium">
                      Por favor, <strong>revise bien los datos</strong> de los invitados antes de guardar. Si tilda la casilla lateral, ingresarán juntos en grupo; si la deja sin tilde, ingresarán de forma individual con su propio QR.
                    </p>
                  </div>

                  <h4 className="font-bold text-sm text-[#6B1D2F]">Carga de Invitados (Máximo 4)</h4>
                  {invitados.map((inv, idx) => (
                    <div key={inv.id} className="p-3 bg-white border border-[#6B1D2F]/30 rounded-lg space-y-2 shadow-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-[#6B1D2F]">Invitado #{idx + 1}</span>
                        <label className="flex items-center gap-1.5 text-xs text-gray-700 font-medium cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={inv.grupal}
                            onChange={(e) => actualizarInvitado(idx, 'grupal', e.target.checked)}
                            className="rounded text-[#6B1D2F] focus:ring-[#6B1D2F]"
                          />
                          <span>Entrada Grupal</span>
                        </label>
                      </div>
                      <input 
                        type="text"
                        placeholder="Nombre y Apellido"
                        value={inv.nombre}
                        onChange={(e) => actualizarInvitado(idx, 'nombre', e.target.value)}
                        className="w-full px-2.5 py-1.5 border rounded text-xs bg-white"
                      />
                      <input 
                        type="text"
                        placeholder="DNI"
                        value={inv.dni}
                        onChange={(e) => actualizarInvitado(idx, 'dni', e.target.value)}
                        className="w-full px-2.5 py-1.5 border rounded text-xs bg-white"
                      />
                    </div>
                  ))}
                </div>

                <button 
                  onClick={guardarDatosEstudiante}
                  className="w-full py-2 bg-[#6B1D2F] text-white rounded-lg text-sm font-medium hover:bg-opacity-90 shadow"
                >
                  Guardar Datos e Invitados
                </button>

                {/* Botones de Descarga de Pases QR para Invitados */}
                {Object.keys(gruposInvitados).length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider">Pases QR de Invitados:</h4>
                    {Object.entries(gruposInvitados).map(([grupo, lista], i) => (
                      <button 
                        key={i}
                        type="button"
                        onClick={() => descargarTarjeta1080x1920(
                          grupo.startsWith('Individual') ? lista[0].nombre : `Grupo de ${nombreMostrado} (${lista.length} pers.)`,
                          grupo.startsWith('Individual') ? `DNI: ${lista[0].dni}` : `Integrantes: ${lista.map(x => x.nombre).join(', ')}`,
                          'INVITADO FAMILIAR'
                        )}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow cursor-pointer"
                      >
                        <Download className="w-4 h-4" /> Descargar QR ({grupo.startsWith('Individual') ? lista[0].nombre : `Entrada Grupal (${lista.length} inv.)`})
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

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
          <p className="text-xs text-gray-400 mt-1">Listo para escanear QRs (Egresados, Grupos y Docentes)</p>
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
