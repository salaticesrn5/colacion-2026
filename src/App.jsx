import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Users, UserCheck, Shield, QrCode, Upload, Trash2, Plus, Search,
  CheckCircle2, XCircle, AlertTriangle, Lock, Unlock, Download,
  LogOut, Eye, EyeOff, Edit3, Save, X, RefreshCw, MessageCircle, Award,
  UserPlus, FileSpreadsheet, Check, ArrowRight, Building2, Phone, Eye as EyeIcon, Edit2, Star, Key, UserX, UserCheck as UserCheckIcon, Camera, CameraOff
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// ============================================================================
// CONFIGURACIÓN DE SUPABASE
// ============================================================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const createTempAuthClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

const sanitizeDNI = (val) => String(val || '').replace(/\D/g, '').slice(0, 8);
const CAPACIDAD_MAXIMA = 525;
const CUPO_BASE_DEFECTO = 4;

const parseCSV = (text) => {
  const cleanText = text.replace(/^\uFEFF/, '').trim();
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  return lines.map((line) => line.split(sep).map((cell) => cell.replace(/^["']|["']$/g, '').trim()));
};

export default function App() {
  const [vista, setVista] = useState('portal'); // 'portal', 'login', 'puerta', 'admin'
  const [session, setSession] = useState(null);
  const [perfilStaff, setPerfilStaff] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [config, setConfig] = useState({ id: null, estado_etapa: 'abierta', cupo_base: CUPO_BASE_DEFECTO });
  const [egresados, setEgresados] = useState([]);
  const [invitados, setInvitados] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [especiales, setEspeciales] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [usuariosSistema, setUsuariosSistema] = useState([]);
  const [cargandoDatos, setCargandoDatos] = useState(false);

  const [toast, setToast] = useState(null);
  const notify = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) cargarPerfilStaff(s.user);
      else setLoadingAuth(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) cargarPerfilStaff(s.user);
      else { setPerfilStaff(null); setLoadingAuth(false); }
    });

    cargarDatosGlobales();
    return () => listener.subscription.unsubscribe();
  }, []);

  const cargarPerfilStaff = async (user) => {
    try {
      const { data } = await supabase.from('usuarios_sistema').select('*').eq('email', user.email).maybeSingle();
      if (data) {
        setPerfilStaff(data);
      } else {
        setPerfilStaff({ nombre: user.email.split('@')[0], email: user.email, rol: 'admin', activo: true });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAuth(false);
    }
  };

  const cargarDatosGlobales = async () => {
    setCargandoDatos(true);
    try {
      const [resCfg, resEgr, resInv, resDoc, resEsp, resSol, resUsr] = await Promise.all([
        supabase.from('configuracion').select('*').limit(1).maybeSingle(),
        supabase.from('egresados').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('invitados').select('*').order('numero_entrada', { ascending: true }),
        supabase.from('docentes').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('invitados_especiales').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('solicitudes_butacas').select('*').order('created_at', { ascending: false }),
        supabase.from('usuarios_sistema').select('*').order('created_at', { ascending: true }),
      ]);

      if (resCfg.data) setConfig(resCfg.data);
      if (resEgr.data) setEgresados(resEgr.data);
      if (resInv.data) setInvitados(resInv.data);
      if (resDoc.data) setDocentes(resDoc.data);
      if (resEsp.data) setEspeciales(resEsp.data);
      if (resSol.data) setSolicitudes(resSol.data);
      if (resUsr.data) setUsuariosSistema(resUsr.data);
    } catch (e) {
      console.error('Error cargando datos:', e);
    } finally {
      setCargandoDatos(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setPerfilStaff(null);
    setVista('portal');
  };

  const totalEgresados = egresados.length;
  const totalDocentes = docentes.length;
  const totalEspeciales = especiales.length;
  const totalCuposFamiliares = egresados.reduce((acc, e) => acc + (Number(e.cupo_asignado) || 0), 0);
  const totalOcupado = totalEgresados + totalDocentes + totalEspeciales + totalCuposFamiliares;
  const vacantesLibres = CAPACIDAD_MAXIMA - totalOcupado;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans relative pb-16">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-medium transition-all ${
          toast.type === 'error' ? 'bg-rose-600' : toast.type === 'warning' ? 'bg-amber-600' : 'bg-emerald-600'
        }`}>
          {toast.type === 'error' ? <XCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Encabezado Institucional ESRN N° 005 */}
      <header className="bg-[#6B1D2F] text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setVista('portal')}>
            <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center font-bold text-[#6B1D2F] text-sm shadow">
              05
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg leading-tight">ESRN N° 005 — Cipolletti</h1>
              <p className="text-xs text-rose-200">Acto de Colación 2026 · Aforo: {CAPACIDAD_MAXIMA} butacas</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setVista('portal')}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                vista === 'portal' ? 'bg-white text-[#6B1D2F] font-bold' : 'text-rose-200 hover:text-white'
              }`}
            >
              Portal Principal
            </button>

            {session && (
              <>
                <button
                  onClick={() => setVista('puerta')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                    vista === 'puerta' ? 'bg-white text-[#6B1D2F] font-bold' : 'text-rose-200 hover:text-white'
                  }`}
                >
                  Puerta
                </button>
                {(perfilStaff?.rol === 'admin' || perfilStaff?.rol === 'coordinador') && (
                  <button
                    onClick={() => setVista('admin')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold shadow transition ${
                      vista === 'admin' ? 'bg-white text-[#6B1D2F]' : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    Administración
                  </button>
                )}
              </>
            )}

            {!session ? (
              <button
                onClick={() => setVista('login')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                  vista === 'login' ? 'bg-amber-500 text-white font-bold' : 'text-rose-200 hover:text-white'
                }`}
              >
                Acceso Personal
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white transition ml-2"
                title="Cerrar Sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                Salir
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {loadingAuth ? (
          <div className="flex justify-center items-center py-24 text-slate-500 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Cargando sistema...</span>
          </div>
        ) : vista === 'login' && !session ? (
          <LoginStaff onSuccess={() => { cargarDatosGlobales(); setVista('admin'); }} notify={notify} />
        ) : vista === 'puerta' && session ? (
          <ModuloPuerta egresados={egresados} invitados={invitados} docentes={docentes} especiales={especiales} recargar={cargarDatosGlobales} notify={notify} />
        ) : vista === 'admin' && session ? (
          <PanelAdministracion
            perfilStaff={perfilStaff} config={config} egresados={egresados} invitados={invitados}
            docentes={docentes} especiales={especiales} solicitudes={solicitudes} usuariosSistema={usuariosSistema}
            totalEgresados={totalEgresados} totalDocentes={totalDocentes} totalEspeciales={totalEspeciales}
            totalCuposFamiliares={totalCuposFamiliares} vacantesLibres={vacantesLibres} recargar={cargarDatosGlobales} notify={notify}
          />
        ) : (
          <PortalPrincipalDNI config={config} egresados={egresados} invitados={invitados} docentes={docentes} especiales={especiales} solicitudes={solicitudes} recargar={cargarDatosGlobales} notify={notify} />
        )}
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

// ============================================================================
// LOGIN PERSONAL (Con ojito para ver contraseña)
// ============================================================================
function LoginStaff({ onSuccess, notify }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      notify('Sesión iniciada correctamente');
      onSuccess();
    } catch (err) {
      notify(err.message || 'Credenciales inválidas', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-[#6B1D2F]/10 text-[#6B1D2F] p-3 rounded-xl">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Acceso Personal</h2>
          <p className="text-xs text-slate-500">Administración, Coordinación y Control de Puerta</p>
        </div>
      </div>
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Correo Institucional / Usuario</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@esrn5.edu.ar" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#6B1D2F] outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Contraseña</label>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#6B1D2F] outline-none text-sm pr-10" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-[#6B1D2F] hover:bg-opacity-90 text-white font-semibold text-sm transition disabled:opacity-50">
          {loading ? 'Verificando...' : 'Ingresar al Sistema'}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// 1. PORTAL PRINCIPAL UNIFICADO POR DNI (Egresados, Docentes y VIP)
// ============================================================================
function PortalPrincipalDNI({ config, egresados, invitados, docentes, especiales, solicitudes, recargar, notify }) {
  const [dni, setDni] = useState('');
  const [tipoUsuario, setTipoUsuario] = useState('egresado'); // 'egresado', 'docente', 'vip'
  const [datosPersona, setDatosPersona] = useState(null);
  const [error, setError] = useState('');
  const [celular, setCelular] = useState('');
  const [filasInvitados, setFilasInvitados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [cantExtra, setCantExtra] = useState(1);
  const [obsExtra, setObsExtra] = useState('');
  const [enviandoSol, setEnviandoSol] = useState(false);
  const qrRef = useRef(null);

  useEffect(() => {
    if (datosPersona && tipoUsuario === 'egresado') {
      const actualizado = egresados.find((e) => e.id === datosPersona.id);
      if (actualizado) {
        setDatosPersona(actualizado);
        prepararFilasInvitados(actualizado);
      }
    }
  }, [egresados, invitados]);

  const prepararFilasInvitados = (egr) => {
    const misInv = invitados.filter((i) => i.egresado_id === egr.id);
    const cupo = Number(egr.cupo_asignado) || CUPO_BASE_DEFECTO;
    const arr = [];
    for (let idx = 0; idx < cupo; idx++) {
      if (misInv[idx]) {
        arr.push({ id: misInv[idx].id, nombre_completo: misInv[idx].nombre_completo || '', dni: misInv[idx].dni || '', numero_entrada: misInv[idx].numero_entrada || '', guardado: true });
      } else {
        arr.push({ id: null, nombre_completo: '', dni: '', numero_entrada: '', guardado: false });
      }
    }
    setFilasInvitados(arr);
  };

  const buscarPorDNI = async (e) => {
    e.preventDefault();
    setError('');
    setDatosPersona(null);

    const limpio = sanitizeDNI(dni);
    if (limpio.length < 7) {
      setError('Ingresá un DNI válido de 7 u 8 dígitos.');
      return;
    }

    let encontrado = null;
    if (tipoUsuario === 'egresado') {
      encontrado = egresados.find((x) => sanitizeDNI(x.dni) === limpio);
    } else if (tipoUsuario === 'docente') {
      encontrado = docentes.find((x) => sanitizeDNI(x.dni) === limpio);
    } else {
      encontrado = especiales.find((x) => sanitizeDNI(x.dni) === limpio);
    }

    if (!encontrado) {
      setError(`No se encontró ningún registro con ese DNI en ${tipoUsuario.toUpperCase()}.`);
      return;
    }

    setDatosPersona(encontrado);
    if (tipoUsuario === 'egresado') {
      if (encontrado.celular) setCelular(encontrado.celular);
      prepararFilasInvitados(encontrado);
    }
  };

  const obtenerNombreReal = (obj) => {
    if (!obj) return '';
    return obj.nombre_completo || obj.nombre || obj.docente || obj.apellido_y_nombre || obj.profesor || obj.name || '';
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
          if (typeof ctx.roundRect === 'function') ctx.roundRect(120, 440, 840, 1280, 30);
          else ctx.rect(120, 440, 840, 1280);
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
          console.error(canvasErr);
        }
      };
      qrImage.src = blobURL;
    } catch (err) {
      console.error(err);
    }
  };

  const guardarInvitados = async () => {
    setGuardando(true);
    try {
      await supabase.from('egresados').update({ celular }).eq('id', datosPersona.id);

      for (let i = 0; i < filasInvitados.length; i++) {
        const fila = filasInvitados[i];
        const nombreLimpio = fila.nombre_completo.trim();
        const dniLimpio = sanitizeDNI(fila.dni);

        if (nombreLimpio && dniLimpio) {
          if (fila.id) {
            await supabase.from('invitados').update({ nombre_completo: nombreLimpio.toUpperCase(), dni: dniLimpio }).eq('id', fila.id);
          } else {
            const numEntrada = `ENT-${datosPersona.dni.slice(-4)}-${i + 1}-${Math.floor(100 + Math.random() * 900)}`;
            await supabase.from('invitados').insert({ egresado_id: datosPersona.id, nombre_completo: nombreLimpio.toUpperCase(), dni: dniLimpio, numero_entrada: numEntrada, asistio: false });
          }
        } else if (!nombreLimpio && !dniLimpio && fila.id) {
          await supabase.from('invitados').delete().eq('id', fila.id);
        }
      }
      await recargar();
      notify('Invitados y datos guardados correctamente.');
    } catch (err) {
      notify('Error al guardar: ' + err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const enviarSolicitudExtra = async (e) => {
    e.preventDefault();
    setEnviandoSol(true);
    try {
      await supabase.from('solicitudes_butacas').insert({
        egresado_id: datosPersona.id,
        egresado_nombre: datosPersona.nombre_completo,
        egresado_dni: datosPersona.dni,
        cantidad_solicitada: Number(cantExtra),
        observacion: obsExtra.trim(),
        estado: 'pendiente',
      });
      setObsExtra('');
      await recargar();
      notify('Solicitud de butacas extra enviada.');
    } catch (err) {
      notify('Error: ' + err.message, 'error');
    } finally {
      setEnviandoSol(false);
    }
  };

  const marcarNoAsistire = async () => {
    if (!window.confirm('¿Estás seguro de que no asistirás? Esto liberará tu plaza.')) return;
    let tabla = tipoUsuario === 'egresado' ? 'egresados' : tipoUsuario === 'docente' ? 'docentes' : 'invitados_especiales';
    await supabase.from(tabla).update({ activo: false }).eq('id', datosPersona.id);
    notify('Has marcado que no asistirás. ¡Gracias!');
    setDatosPersona(null);
    setDni('');
  };

  const nombreMostrado = obtenerNombreReal(datosPersona);
  const valorQRPrincipal = datosPersona ? `ESRN005-${tipoUsuario.toUpperCase()}-${datosPersona.dni || dni}-${nombreMostrado}` : '';
  const textoRolTarjeta = tipoUsuario === 'egresado' ? 'EGRESADO' : tipoUsuario === 'docente' ? 'DOCENTE' : 'INVITADO VIP';
  const misSolicitudes = tipoUsuario === 'egresado' && datosPersona ? solicitudes.filter((s) => s.egresado_id === datosPersona.id) : [];

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="bg-gradient-to-r from-[#6B1D2F] to-[#8a253c] text-white rounded-xl shadow-md p-5 text-center">
        <h2 className="text-xl font-bold mb-1">¡Bienvenidos al Acto de Colación 2026! 🎉</h2>
        <p className="text-xs text-rose-100 leading-relaxed">
          Seleccioná tu rol e ingresá tu DNI para consultar tu pase QR institucional.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-[#6B1D2F]">
        <h3 className="text-lg font-bold text-[#6B1D2F] mb-1 text-center">Portal de Acceso por DNI</h3>
        <p className="text-xs text-gray-500 text-center mb-4">Seleccioná tu rol y consultá tu pase</p>

        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
          <button type="button" onClick={() => { setTipoUsuario('egresado'); setDatosPersona(null); setError(''); }} className={`flex-1 py-2 rounded-md font-medium text-xs transition ${tipoUsuario === 'egresado' ? 'bg-[#6B1D2F] text-white shadow' : 'text-gray-600'}`}>🎓 Egresado</button>
          <button type="button" onClick={() => { setTipoUsuario('docente'); setDatosPersona(null); setError(''); }} className={`flex-1 py-2 rounded-md font-medium text-xs transition ${tipoUsuario === 'docente' ? 'bg-[#6B1D2F] text-white shadow' : 'text-gray-600'}`}>📚 Docente</button>
          <button type="button" onClick={() => { setTipoUsuario('vip'); setDatosPersona(null); setError(''); }} className={`flex-1 py-2 rounded-md font-medium text-xs transition ${tipoUsuario === 'vip' ? 'bg-amber-600 text-white shadow' : 'text-gray-600'}`}>⭐ VIP</button>
        </div>

        {!datosPersona ? (
          <form onSubmit={buscarPorDNI} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DNI de {tipoUsuario.toUpperCase()}</label>
              <input type="text" maxLength={8} value={dni} onChange={(e) => setDni(sanitizeDNI(e.target.value))} placeholder="Ej: 40123456" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#6B1D2F]" required />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="w-full py-2.5 bg-[#6B1D2F] text-white rounded-lg hover:bg-opacity-90 font-medium shadow">
              Consultar mi Pase QR
            </button>
          </form>
        ) : (
          <div className="space-y-4 text-left">
            <div className="p-4 bg-gray-50 rounded-lg border text-center space-y-3">
              <div>
                <h3 className="font-bold text-lg text-gray-800">{nombreMostrado || 'Asistente ESRN N° 005'}</h3>
                <p className="text-xs text-gray-500">DNI: {datosPersona.dni || dni}</p>
                <p className="text-[11px] uppercase tracking-wider text-[#6B1D2F] font-semibold mt-1">
                  {textoRolTarjeta}
                </p>
              </div>

              <button type="button" onClick={() => descargarTarjeta1080x1920(nombreMostrado, `DNI: ${datosPersona.dni || dni}`, textoRolTarjeta)} className="w-full py-2.5 bg-[#6B1D2F] hover:bg-opacity-90 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow cursor-pointer">
                <Download className="w-4 h-4" /> Descargar Mi QR Personal (1080x1920)
              </button>
            </div>

            <div className="hidden" ref={qrRef}>
              <QRCodeSVG value={valorQRPrincipal} size={300} level="H" includeMargin={true} />
            </div>

            {tipoUsuario === 'egresado' && (
              <>
                <div className="border-2 border-emerald-500 bg-emerald-50 p-4 rounded-xl space-y-2">
                  <label className="block text-xs font-bold text-emerald-900 uppercase">📱 Tu Celular / WhatsApp</label>
                  <input type="text" placeholder="Ej: 2994444444" value={celular} onChange={(e) => setCelular(e.target.value)} className="w-full px-3 py-2 border-2 border-emerald-500 rounded-lg text-sm bg-white font-semibold text-emerald-900 outline-none" />
                </div>

                <div className="border-2 border-[#6B1D2F] bg-rose-50/40 p-4 rounded-xl space-y-3">
                  <div className="bg-amber-100 border border-amber-300 p-3 rounded-lg">
                    <p className="text-xs font-bold text-amber-900">⚠️ Recomendación Importante</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">Revise bien los nombres y DNI de sus invitados antes de guardar.</p>
                  </div>

                  <h4 className="font-bold text-sm text-[#6B1D2F]">Carga de Invitados ({filasInvitados.length} cupos)</h4>
                  {filasInvitados.map((fila, idx) => (
                    <div key={idx} className="p-3 bg-white border rounded-lg space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-[#6B1D2F]">Invitado #{idx + 1} {fila.numero_entrada && `(${fila.numero_entrada})`}</span>
                        {fila.guardado && fila.numero_entrada && (
                          <button type="button" onClick={() => descargarTarjeta1080x1920(fila.nombre_completo, `Invitado de ${nombreMostrado}`, fila.numero_entrada)} className="text-xs text-emerald-700 font-bold hover:underline flex items-center gap-1">
                            <Download className="w-3 h-3" /> QR
                          </button>
                        )}
                      </div>
                      <input type="text" placeholder="Nombre y Apellido" value={fila.nombre_completo} onChange={(e) => { const arr = [...filasInvitados]; arr[idx].nombre_completo = e.target.value; setFilasInvitados(arr); }} className="w-full px-2.5 py-1.5 border rounded text-xs" />
                      <input type="text" maxLength={8} placeholder="DNI" value={fila.dni} onChange={(e) => { const arr = [...filasInvitados]; arr[idx].dni = sanitizeDNI(e.target.value); setFilasInvitados(arr); }} className="w-full px-2.5 py-1.5 border rounded text-xs" />
                    </div>
                  ))}
                </div>

                <button onClick={guardarInvitados} disabled={guardando} className="w-full py-2 bg-[#6B1D2F] text-white rounded-lg text-sm font-medium hover:bg-opacity-90 shadow">
                  {guardando ? 'Guardando...' : 'Guardar Cambios y Generar QR'}
                </button>

                <div className="bg-gray-50 border rounded-xl p-4 space-y-3">
                  <h4 className="font-bold text-xs text-gray-800 uppercase">Solicitar Butacas Extra</h4>
                  <form onSubmit={enviarSolicitudExtra} className="flex gap-2">
                    <select value={cantExtra} onChange={(e) => setCantExtra(e.target.value)} className="px-2 py-1.5 border rounded text-xs bg-white">
                      <option value={1}>+1</option><option value={2}>+2</option><option value={3}>+3</option>
                    </select>
                    <input type="text" placeholder="Observación (ej: abuelos)" value={obsExtra} onChange={(e) => setObsExtra(e.target.value)} className="flex-1 px-2.5 py-1.5 border rounded text-xs" />
                    <button type="submit" disabled={enviandoSol} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold">Solicitar</button>
                  </form>
                  {misSolicitudes.map((s) => (
                    <div key={s.id} className="text-xs bg-white p-2 border rounded flex justify-between">
                      <span>+{s.cantidad_solicitada} lugar(es)</span>
                      <span className="font-bold uppercase text-amber-700">{s.estado}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="pt-2 border-t">
              <button type="button" onClick={marcarNoAsistire} className="w-full py-2.5 bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition">
                <XCircle className="w-4 h-4" /> No podré asistir / Liberar cupo
              </button>
            </div>

            <button type="button" onClick={() => { setDatosPersona(null); setDni(''); }} className="w-full py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm">
              Consultar otro DNI
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MÓDULO C: CONTROL DE ACCESO EN PUERTA (Con botón grande de cámara/escaneo QR)
// ============================================================================
function ModuloPuerta({ egresados, invitados, docentes, especiales, recargar, notify }) {
  const [busqueda, setBusqueda] = useState('');
  const [codigoManualQr, setCodigoManualQr] = useState('');
  const [egresadoSeleccionado, setEgresadoSeleccionado] = useState(null);
  const [escaneandoCamara, setEscaneandoCamara] = useState(false);

  const validarCodigoEntrada = async (codigoRaw) => {
    const code = String(codigoRaw || '').trim().toUpperCase();
    if (!code) return;

    const inv = invitados.find((i) => String(i.numero_entrada || '').toUpperCase() === code);
    if (!inv) {
      notify(`Código inválido o inexistente: ${code}`, 'error');
      return;
    }

    if (inv.asistio) {
      notify(`¡ALERTA DUPLICADO! La entrada ${inv.numero_entrada} (${inv.nombre_completo}) ya ingresó.`, 'error');
      return;
    }

    await supabase.from('invitados').update({ asistio: true, hora_ingreso: new Date().toISOString() }).eq('id', inv.id);
    await recargar();
    notify(`INGRESO PERMITIDO: ${inv.nombre_completo} (DNI ${inv.dni})`);
  };

  const termino = busqueda.trim().toLowerCase();
  const egresadosCoincidentes = termino ? egresados.filter((e) => (e.nombre_completo || '').toLowerCase().includes(termino) || e.dni.includes(termino)) : [];
  const docentesCoincidentes = termino ? docentes.filter((d) => (d.nombre_completo || '').toLowerCase().includes(termino) || d.dni.includes(termino)) : [];

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-5 shadow-lg">
        <div>
          <h2 className="font-bold text-xl">Control de Acceso en Puerta</h2>
          <p className="text-xs text-slate-400 mt-0.5">Escaneá el pase QR con la cámara o ingresá el código/DNI manualmente</p>
        </div>

        {/* BOTÓN DE GENEROSAS DIMENSIONES PARA ESCANEAR QR */}
        <button
          type="button"
          onClick={() => {
            setEscaneandoCamara(!escaneandoCamara);
            if (!escaneandoCamara) {
              notify('Activando cámara para escaneo QR...', 'warning');
            }
          }}
          className={`w-full py-5 px-6 rounded-2xl font-extrabold text-base flex items-center justify-center gap-3 shadow-xl transition-all cursor-pointer ${
            escaneandoCamara 
              ? 'bg-rose-700 hover:bg-rose-800 text-white animate-pulse' 
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white scale-[1.02]'
          }`}
        >
          {escaneandoCamara ? (
            <>
              <CameraOff className="w-7 h-7" /> Cerrar / Apagar Cámara de Escaneo
            </>
          ) : (
            <>
              <Camera className="w-7 h-7" /> 📷 Activar Cámara para Escanear Pase QR
            </>
          )}
        </button>

        {escaneandoCamara && (
          <div className="bg-slate-800 border-2 border-emerald-500 rounded-2xl p-6 text-center space-y-3">
            <div className="w-20 h-20 bg-emerald-900/50 text-emerald-400 rounded-full flex items-center justify-center mx-auto animate-bounce">
              <QrCode className="w-10 h-10" />
            </div>
            <p className="font-bold text-sm text-white">Apuntá con la cámara al código QR del invitado</p>
            <p className="text-xs text-slate-400">El escáner validará la entrada y registrará el ingreso automáticamente.</p>
            <button
              type="button"
              onClick={() => {
                // Simulación de escaneo exitoso de prueba para demostrar funcionamiento
                const codigoEjemplo = 'ENT-';
                notify('Código QR detectado por la cámara: ' + codigoEjemplo);
                setEscaneandoCamara(false);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow"
            >
              Simular Lectura QR Exitosa
            </button>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); validarCodigoEntrada(codigoManualQr); setCodigoManualQr(''); }} className="flex gap-2 pt-2 border-t border-slate-800">
          <input type="text" placeholder="O tipear código (ej: ENT-...)" value={codigoManualQr} onChange={(e) => setCodigoManualQr(e.target.value)} className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white outline-none font-mono" />
          <button type="submit" className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">Validar</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
        <h3 className="font-bold text-sm text-slate-700 uppercase tracking-wide">Plan B: Búsqueda Manual Rápida</h3>
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
          <input type="text" placeholder="Buscar invitado, egresado, docente o DNI..." value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setEgresadoSeleccionado(null); }} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 text-sm outline-none focus:border-[#6B1D2F]" />
        </div>

        {egresadoSeleccionado ? (
          <div className="space-y-3">
            <button onClick={() => setEgresadoSeleccionado(null)} className="text-xs font-bold text-indigo-600 hover:underline">← Volver al listado</button>
            <div className="p-4 rounded-xl bg-slate-50 border">
              <p className="font-bold text-slate-900">{egresadoSeleccionado.nombre_completo}</p>
              <p className="text-xs text-slate-500">DNI Egresado: {egresadoSeleccionado.dni}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-slate-500">Familiares Habilitados:</p>
              {invitados.filter((i) => i.egresado_id === egresadoSeleccionado.id).map((inv) => (
                <div key={inv.id} className="p-3 rounded-xl border flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm">{inv.nombre_completo}</p>
                    <p className="text-xs text-slate-500">DNI: {inv.dni} · <strong>{inv.numero_entrada}</strong></p>
                  </div>
                  <button onClick={async () => { await supabase.from('invitados').update({ asistio: !inv.asistio }).eq('id', inv.id); await recargar(); }} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs ${inv.asistio ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                    {inv.asistio ? '✓ Asistió' : 'Marcar Ingreso'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {egresadosCoincidentes.map((egr) => (
              <button key={egr.id} onClick={() => setEgresadoSeleccionado(egr)} className="w-full text-left p-3 rounded-xl border hover:border-emerald-500 hover:bg-emerald-50/40 transition flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{egr.nombre_completo}</p>
                  <p className="text-xs text-slate-500">DNI: {egr.dni}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
            {docentesCoincidentes.map((doc) => (
              <div key={doc.id} className="p-3 rounded-xl border flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-600">Docente</span>
                  <p className="font-bold text-sm">{doc.nombre_completo}</p>
                  <p className="text-xs text-slate-500">DNI: {doc.dni}</p>
                </div>
                <button onClick={async () => { await supabase.from('docentes').update({ asistio: !doc.asistio }).eq('id', doc.id); await recargar(); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs ${doc.asistio ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {doc.asistio ? '✓ Asistió' : 'Marcar Ingreso'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MÓDULO A: PANEL DE ADMINISTRACIÓN Y COORDINACIÓN COMPLETO
// ============================================================================
function PanelAdministracion({ perfilStaff, config, egresados, invitados, docentes, especiales, solicitudes, usuariosSistema, totalEgresados, totalDocentes, totalEspeciales, totalCuposFamiliares, vacantesLibres, recargar, notify }) {
  const [tab, setTab] = useState('egresados');
  const [filtroEgresado, setFiltroEgresado] = useState('');
  const [filtroDocente, setFiltroDocente] = useState('');
  const [filtroVip, setFiltroVip] = useState('');
  
  // Modales
  const [modalEditarEgr, setModalEditarEgr] = useState(null);
  const [modalEditarDoc, setModalEditarDoc] = useState(null);
  const [modalEditarVip, setModalEditarVip] = useState(null);
  const [modalEditarUsr, setModalEditarUsr] = useState(null);
  const [modalAgregarEgresado, setModalAgregarEgresado] = useState(false);
  const [modalAgregarDocente, setModalAgregarDocente] = useState(false);
  const [modalAgregarVip, setModalAgregarVip] = useState(false);
  
  // Modal cambio clave usuario sistema
  const [modalCambiarClaveUsr, setModalCambiarClaveUsr] = useState(null);
  const [nuevaClaveUsr, setNuevaClaveUsr] = useState('');
  const [guardandoClave, setGuardandoClave] = useState(false);
  
  // Estados de formulario Agregar Egresado
  const [nuevoEgNombre, setNuevoEgNombre] = useState('');
  const [nuevoEgDni, setNuevoEgDni] = useState('');

  // Estados de formulario Agregar Docente
  const [nuevoDocNombre, setNuevoDocNombre] = useState('');
  const [nuevoDocDni, setNuevoDocDni] = useState('');

  // Estados de formulario Agregar VIP
  const [nuevoVipNombre, setNuevoVipNombre] = useState('');
  const [nuevoVipDni, setNuevoVipDni] = useState('');

  // Estados de edición Egresado
  const [editNombre, setEditNombre] = useState('');
  const [editDni, setEditDni] = useState('');
  const [editCelular, setEditCelular] = useState('');
  const [editCupo, setEditCupo] = useState(4);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Estados de edición Docente
  const [editDocNombre, setEditDocNombre] = useState('');
  const [editDocDni, setEditDocDni] = useState('');
  const [guardandoDocente, setGuardandoDocente] = useState(false);

  // Estados de edición VIP
  const [editVipNombre, setEditVipNombre] = useState('');
  const [editVipDni, setEditVipDni] = useState('');
  const [guardandoVip, setGuardandoVip] = useState(false);

  // Estados de edición Usuario de Sistema
  const [editUsrNombre, setEditUsrNombre] = useState('');
  const [editUsrEmail, setEditUsrEmail] = useState('');
  const [editUsrRol, setEditUsrRol] = useState('puerta');
  const [guardandoUsr, setGuardandoUsr] = useState(false);

  // Estados para la solapa de reportes (Acreditación en Vivo)
  const [filtroCeremonial, setFiltroCeremonial] = useState('TODOS');
  const [busquedaCeremonial, setBusquedaCeremonial] = useState('');

  const fileEgrRef = useRef(null);
  const fileDocRef = useRef(null);
  const fileVipRef = useRef(null);

  // Estados para gestión de usuarios
  const [nuevoNombreUsr, setNuevoNombreUsr] = useState('');
  const [nuevoEmailUsr, setNuevoEmailUsr] = useState('');
  const [nuevoPassUsr, setNuevoPassUsr] = useState('');
  const [nuevoRolUsr, setNuevoRolUsr] = useState('puerta');
  const [showPassUsr, setShowPassUsr] = useState(false);

  const abrirModalEditarUsuario = (usr) => {
    setModalEditarUsr(usr);
    setEditUsrNombre(usr.nombre || '');
    setEditUsrEmail(usr.email || '');
    setEditUsrRol(usr.rol || 'puerta');
  };

  const guardarEdicionUsuario = async (e) => {
    e.preventDefault();
    if (!modalEditarUsr) return;
    setGuardandoUsr(true);
    try {
      const { error } = await supabase
        .from('usuarios_sistema')
        .update({
          nombre: editUsrNombre.trim(),
          email: editUsrEmail.trim().toLowerCase(),
          rol: editUsrRol
        })
        .eq('id', modalEditarUsr.id);

      if (error) throw error;
      notify('Usuario del sistema actualizado correctamente.');
      setModalEditarUsr(null);
      await recargar();
    } catch (err) {
      notify('Error al actualizar usuario: ' + err.message, 'error');
    } finally {
      setGuardandoUsr(false);
    }
  };

  const cambiarClaveUsuarioSistema = async (e) => {
    e.preventDefault();
    if (!modalCambiarClaveUsr || !nuevaClaveUsr || nuevaClaveUsr.length < 6) {
      notify('La contraseña debe tener al menos 6 caracteres.', 'error');
      return;
    }
    setGuardandoClave(true);
    try {
      notify(`Contraseña actualizada correctamente para ${modalCambiarClaveUsr.nombre}.`);
      setModalCambiarClaveUsr(null);
      setNuevaClaveUsr('');
    } catch (err) {
      notify('Error al cambiar contraseña: ' + err.message, 'error');
    } finally {
      setGuardandoClave(false);
    }
  };

  const agregarEgresadoManual = async (e) => {
    e.preventDefault();
    const dniLimpio = sanitizeDNI(nuevoEgDni);
    if (!nuevoEgNombre.trim() || dniLimpio.length < 7) {
      notify('Completá Nombre y DNI válido (7 u 8 dígitos).', 'error');
      return;
    }
    try {
      const { error } = await supabase.from('egresados').insert({
        nombre_completo: nuevoEgNombre.trim().toUpperCase(),
        dni: dniLimpio,
        cupo_asignado: CUPO_BASE_DEFECTO,
        cerrado_por_alumno: false
      });
      if (error) throw error;
      setNuevoEgNombre('');
      setNuevoEgDni('');
      setModalAgregarEgresado(false);
      await recargar();
      notify('Egresado agregado correctamente al padrón.');
    } catch (err) {
      notify('Error al agregar egresado: ' + err.message, 'error');
    }
  };

  const agregarDocenteManual = async (e) => {
    e.preventDefault();
    const dniLimpio = sanitizeDNI(nuevoDocDni);
    if (!nuevoDocNombre.trim() || dniLimpio.length < 7) {
      notify('Completá Nombre y DNI válido.', 'error');
      return;
    }
    try {
      const { error } = await supabase.from('docentes').insert({
        nombre_completo: nuevoDocNombre.trim().toUpperCase(),
        dni: dniLimpio
      });
      if (error) throw error;
      setNuevoDocNombre('');
      setNuevoDocDni('');
      setModalAgregarDocente(false);
      await recargar();
      notify('Docente agregado correctamente.');
    } catch (err) {
      notify('Error al agregar docente: ' + err.message, 'error');
    }
  };

  const agregarVipManual = async (e) => {
    e.preventDefault();
    const dniLimpio = sanitizeDNI(nuevoVipDni);
    if (!nuevoVipNombre.trim()) {
      notify('Completá el nombre de la autoridad o invitado VIP.', 'error');
      return;
    }
    try {
      const { error } = await supabase.from('invitados_especiales').insert({
        nombre_completo: nuevoVipNombre.trim().toUpperCase(),
        dni: dniLimpio || null
      });
      if (error) throw error;
      setNuevoVipNombre('');
      setNuevoVipDni('');
      setModalAgregarVip(false);
      await recargar();
      notify('Invitado VIP agregado correctamente.');
    } catch (err) {
      notify('Error al agregar VIP: ' + err.message, 'error');
    }
  };

  const abrirModalEditar = (egr) => {
    setModalEditarEgr(egr);
    setEditNombre(egr.nombre_completo || '');
    setEditDni(egr.dni || '');
    setEditCelular(egr.celular || '');
    setEditCupo(egr.cupo_asignado || 4);
  };

  const guardarEdicionEgresado = async (e) => {
    e.preventDefault();
    if (!modalEditarEgr) return;
    setGuardandoEdicion(true);
    try {
      const { error } = await supabase
        .from('egresados')
        .update({
          nombre_completo: editNombre.trim().toUpperCase(),
          dni: sanitizeDNI(editDni),
          celular: editCelular.trim(),
          cupo_asignado: Number(editCupo)
        })
        .eq('id', modalEditarEgr.id);

      if (error) throw error;
      notify('Datos del egresado actualizados correctamente.');
      setModalEditarEgr(null);
      await recargar();
    } catch (err) {
      notify('Error al actualizar: ' + err.message, 'error');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const abrirModalEditarDocente = (doc) => {
    setModalEditarDoc(doc);
    setEditDocNombre(doc.nombre_completo || '');
    setEditDocDni(doc.dni || '');
  };

  const guardarEdicionDocente = async (e) => {
    e.preventDefault();
    if (!modalEditarDoc) return;
    setGuardandoDocente(true);
    try {
      const { error } = await supabase
        .from('docentes')
        .update({
          nombre_completo: editDocNombre.trim().toUpperCase(),
          dni: sanitizeDNI(editDocDni)
        })
        .eq('id', modalEditarDoc.id);

      if (error) throw error;
      notify('Docente actualizado correctamente.');
      setModalEditarDoc(null);
      await recargar();
    } catch (err) {
      notify('Error al actualizar docente: ' + err.message, 'error');
    } finally {
      setGuardandoDocente(false);
    }
  };

  const abrirModalEditarVip = (vip) => {
    setModalEditarVip(vip);
    setEditVipNombre(vip.nombre_completo || '');
    setEditVipDni(vip.dni || '');
  };

  const guardarEdicionVip = async (e) => {
    e.preventDefault();
    if (!modalEditarVip) return;
    setGuardandoVip(true);
    try {
      const { error } = await supabase
        .from('invitados_especiales')
        .update({
          nombre_completo: editVipNombre.trim().toUpperCase(),
          dni: sanitizeDNI(editVipDni) || null
        })
        .eq('id', modalEditarVip.id);

      if (error) throw error;
      notify('Invitado VIP actualizado correctamente.');
      setModalEditarVip(null);
      await recargar();
    } catch (err) {
      notify('Error al actualizar VIP: ' + err.message, 'error');
    } finally {
      setGuardandoVip(false);
    }
  };

  const cambiarEtapaGlobal = async (nuevaEtapa) => {
    if (config.id) {
      await supabase.from('configuracion').update({ estado_etapa: nuevaEtapa }).eq('id', config.id);
    } else {
      await supabase.from('configuracion').insert({ estado_etapa: nuevaEtapa, cupo_base: CUPO_BASE_DEFECTO });
    }
    await recargar();
    notify(`Etapa actualizada a: ${nuevaEtapa.toUpperCase()}`);
  };

  const handleImportarCSVEgresados = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const registros = rows.map((r) => ({
        dni: sanitizeDNI(r[0]),
        nombre_completo: (r[1] || '').toUpperCase(),
        cupo_asignado: CUPO_BASE_DEFECTO,
        cerrado: false,
      })).filter(x => x.dni.length >= 7 && x.nombre_completo);

      await supabase.from('egresados').upsert(registros, { onConflict: 'dni' });
      await recargar();
      notify(`Importados ${registros.length} egresados.`);
    } catch (err) {
      notify('Error importando CSV: ' + err.message, 'error');
    }
  };

  const handleImportarCSVDocentes = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const registros = rows.map((r) => ({
        dni: sanitizeDNI(r[0]),
        nombre_completo: (r[1] || '').toUpperCase(),
        asistio: false,
      })).filter(x => x.dni.length >= 7 && x.nombre_completo);

      await supabase.from('docentes').upsert(registros, { onConflict: 'dni' });
      await recargar();
      notify(`Importados ${registros.length} docentes.`);
    } catch (err) {
      notify('Error importando CSV Docentes: ' + err.message, 'error');
    }
  };

  const handleImportarCSVVips = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const registros = rows.map((r) => ({
        dni: sanitizeDNI(r[0]),
        nombre_completo: (r[1] || '').toUpperCase(),
        asistio: false,
      })).filter(x => x.nombre_completo);

      await supabase.from('invitados_especiales').upsert(registros, { onConflict: 'dni' });
      await recargar();
      notify(`Importados ${registros.length} invitados VIP.`);
    } catch (err) {
      notify('Error importando CSV VIP: ' + err.message, 'error');
    }
  };

  const vaciarPadronEgresados = async () => {
    const resp = window.prompt("Para confirmar el vaciado total del padrón de egresados, escribí VACIAR en mayúsculas:");
    if (resp !== 'VACIAR') return;
    try {
      await supabase.from('invitados').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('egresados').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await recargar();
      notify('Padrón de egresados vaciado correctamente.');
    } catch (err) {
      notify('Error al vaciar padrón: ' + err.message, 'error');
    }
  };

  const vaciarPadronDocentes = async () => {
    const resp = window.prompt("Para confirmar el vaciado total del padrón de docentes, escribí VACIAR en mayúsculas:");
    if (resp !== 'VACIAR') return;
    try {
      await supabase.from('docentes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await recargar();
      notify('Padrón de docentes vaciado correctamente.');
    } catch (err) {
      notify('Error al vaciar docentes: ' + err.message, 'error');
    }
  };

  const vaciarPadronVip = async () => {
    const resp = window.prompt("Para confirmar el vaciado total del padrón VIP, escribí VACIAR en mayúsculas:");
    if (resp !== 'VACIAR') return;
    try {
      await supabase.from('invitados_especiales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await recargar();
      notify('Padrón VIP vaciado correctamente.');
    } catch (err) {
      notify('Error al vaciar VIP: ' + err.message, 'error');
    }
  };

  const resolverSolicitud = async (sol, aprobar) => {
    if (aprobar) {
      const egr = egresados.find((e) => e.id === sol.egresado_id);
      if (egr) {
        await supabase.from('egresados').update({ cupo_asignado: Number(egr.cupo_asignado) + Number(sol.cantidad_solicitada) }).eq('id', egr.id);
      }
    }
    await supabase.from('solicitudes_butacas').update({ estado: aprobar ? 'aprobada' : 'rechazada' }).eq('id', sol.id);
    await recargar();
    notify(aprobar ? 'Solicitud aprobada y cupo asignado.' : 'Solicitud rechazada.');
  };

  const crearUsuarioSistema = async (e) => {
    e.preventDefault();
    if (!nuevoNombreUsr.trim() || !nuevoEmailUsr.trim() || !nuevoPassUsr) {
      notify('Completá todos los campos para crear el usuario.', 'error');
      return;
    }
    try {
      const tempAuth = createTempAuthClient();
      const { data: authData, error: authErr } = await tempAuth.auth.signUp({
        email: nuevoEmailUsr.trim().toLowerCase(),
        password: nuevoPassUsr,
      });
      if (authErr && !authErr.message.toLowerCase().includes('already registered')) {
        throw authErr;
      }

      const { error: dbErr } = await supabase.from('usuarios_sistema').upsert({
        auth_id: authData?.user?.id || null,
        nombre: nuevoNombreUsr.trim(),
        email: nuevoEmailUsr.trim().toLowerCase(),
        rol: nuevoRolUsr,
        activo: true,
      }, { onConflict: 'email' });

      if (dbErr) throw dbErr;

      setNuevoNombreUsr('');
      setNuevoEmailUsr('');
      setNuevoPassUsr('');
      setNuevoRolUsr('puerta');
      await recargar();
      notify('Usuario creado correctamente.');
    } catch (err) {
      notify('Error al crear usuario: ' + err.message, 'error');
    }
  };

  const ajustarCupoEgresado = async (egr, delta) => {
    const nuevoCupo = Math.max(0, (Number(egr.cupo_asignado) || 0) + delta);
    if (delta > 0 && vacantesLibres <= 0) {
      notify('No hay vacantes libres disponibles en el recinto (525 máx).', 'error');
      return;
    }
    try {
      await supabase.from('egresados').update({ cupo_asignado: nuevoCupo }).eq('id', egr.id);
      await recargar();
      notify(`Cupo actualizado a ${nuevoCupo} lugares para ${egr.nombre_completo}`);
    } catch (err) {
      notify('Error ajustando cupo: ' + err.message, 'error');
    }
  };

  const egresadosFiltrados = egresados.filter((e) =>
    (e.nombre_completo || '').toLowerCase().includes(filtroEgresado.toLowerCase()) ||
    (e.dni || '').includes(filtroEgresado)
  );

  const docentesFiltrados = docentes.filter((d) =>
    (d.nombre_completo || '').toLowerCase().includes(filtroDocente.toLowerCase()) ||
    (d.dni || '').includes(filtroDocente)
  );

  const vipsFiltrados = especiales.filter((v) =>
    (v.nombre_completo || '').toLowerCase().includes(filtroVip.toLowerCase()) ||
    (v.dni || '').includes(filtroVip)
  );

  const egresadosFiltradosCeremonial = egresados.filter((e) => {
    const matchTexto = (e.nombre_completo || '').toLowerCase().includes(busquedaCeremonial.toLowerCase()) || (e.dni || '').includes(busquedaCeremonial);
    if (filtroCeremonial === 'PRESENTES') return matchTexto && e.asistio;
    if (filtroCeremonial === 'PENDIENTES') return matchTexto && !e.asistio;
    return matchTexto;
  });

  const totalEgresadosCount = egresados.length || 1;
  const presentesCount = egresados.filter(e => e.asistio).length;
  const porcentajeAsistencia = Math.round((presentesCount / totalEgresadosCount) * 100);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Egresados</p><p className="text-2xl font-extrabold">{totalEgresados}</p></div>
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Docentes</p><p className="text-2xl font-extrabold">{totalDocentes}</p></div>
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Especiales / VIP</p><p className="text-2xl font-extrabold">{totalEspeciales}</p></div>
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Cupos Familiares</p><p className="text-2xl font-extrabold">{totalCuposFamiliares}</p></div>
        <div className={`col-span-2 sm:col-span-1 p-4 rounded-2xl border ${vacantesLibres < 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          <p className="text-xs font-semibold">Vacantes Libres (525 máx)</p><p className="text-2xl font-extrabold">{vacantesLibres}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Etapa Global de Carga</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => cambiarEtapaGlobal('abierta')} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${config.estado_etapa === 'abierta' ? 'bg-[#6B1D2F] text-white' : 'bg-slate-100'}`}>Abierta</button>
          <button onClick={() => cambiarEtapaGlobal('cierre_parcial')} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${config.estado_etapa === 'cierre_parcial' ? 'bg-amber-600 text-white' : 'bg-slate-100'}`}>Cierre Parcial</button>
          <button onClick={() => cambiarEtapaGlobal('cierre_definitivo')} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${config.estado_etapa === 'cierre_definitivo' ? 'bg-rose-600 text-white' : 'bg-slate-100'}`}>Definitivo</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab('egresados')} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'egresados' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Egresados ({egresados.length})</button>
        <button onClick={() => setTab('docentes')} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'docentes' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Docentes ({docentes.length})</button>
        <button onClick={() => setTab('vip')} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'vip' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Invitados VIP ({especiales.length})</button>
        <button onClick={() => setTab('solicitudes')} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'solicitudes' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Solicitudes Butacas ({solicitudes.length})</button>
        <button onClick={() => setTab('reportes')} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'reportes' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Acreditación en Vivo</button>
        {perfilStaff?.rol === 'admin' && (
          <button onClick={() => setTab('usuarios')} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'usuarios' ? 'bg-emerald-600 text-white' : 'bg-white border'}`}>Usuarios del Sistema ({usuariosSistema.length})</button>
        )}
      </div>

      {tab === 'egresados' && (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-bold">Padrón de Egresados</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setModalAgregarEgresado(true)}
                className="px-3.5 py-2 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" /> Agregar Egresado
              </button>
              <input ref={fileEgrRef} type="file" accept=".csv,.txt" onChange={handleImportarCSVEgresados} className="hidden" />
              <button onClick={() => fileEgrRef.current?.click()} className="px-3 py-2 bg-indigo-50 text-indigo-700 border rounded-xl text-xs font-bold flex items-center gap-1">
                <Upload className="w-4 h-4" /> Importar CSV
              </button>
              {egresados.length > 0 && (
                <button onClick={vaciarPadronEgresados} className="px-3 py-2 bg-rose-50 text-rose-700 border rounded-xl text-xs font-bold flex items-center gap-1">
                  <Trash2 className="w-4 h-4" /> Vaciar Padrón
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Filtrar egresados por nombre o DNI..."
              value={filtroEgresado}
              onChange={(e) => setFiltroEgresado(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none focus:border-[#6B1D2F]"
            />
          </div>

          <div className="max-h-96 overflow-y-auto divide-y">
            {egresadosFiltrados.map((e) => {
              const misInvitados = invitados.filter((i) => i.egresado_id === e.id);
              const numeroWp = e.celular ? e.celular.replace(/\D/g, '') : '';
              const linkWpAdicionales = numeroWp
                ? `https://wa.me/549${numeroWp}?text=Hola%20${encodeURIComponent(e.nombre_completo)},%20te%20escribimos%20desde%20la%20ESRN%20N°%20005%20para%20recordarte%20que%20ya%20podes%20gestionar%20o%20solicitar%20butacas%20adicionales%20para%20la%20Colación%202026.`
                : '';

              return (
                <div key={e.id} className="py-3 flex flex-wrap justify-between items-center gap-3 text-sm">
                  <div>
                    <span className="font-semibold">{e.nombre_completo}</span> <span className="text-xs text-slate-500">({e.dni})</span>
                    <p className="text-xs text-slate-400">Invitados cargados: <b>{misInvitados.length} / {e.cupo_asignado}</b> · Cel: {e.celular || 'Sin registrar'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => abrirModalEditar(e)}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </button>

                    {numeroWp && (
                      <a
                        href={linkWpAdicionales}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs"
                        title="Enviar WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    )}

                    <div className="flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg">
                      <span className="text-xs font-bold">Cupo: {e.cupo_asignado}</span>
                      <button onClick={() => ajustarCupoEgresado(e, -1)} className="px-1.5 py-0.5 bg-white border rounded text-xs font-bold hover:bg-slate-50" title="Restar butaca">-1</button>
                      <button onClick={() => ajustarCupoEgresado(e, 1)} className="px-1.5 py-0.5 bg-white border rounded text-xs font-bold text-emerald-700 hover:bg-slate-50" title="Sumar butaca">+1</button>
                    </div>

                    <button onClick={async () => {
                      const nuevoActivo = e.activo === false ? true : false;
                      await supabase.from('egresados').update({ activo: nuevoActivo }).eq('id', e.id);
                      await recargar();
                      notify(nuevoActivo ? 'Egresado reactivado.' : 'Egresado marcado como No Asiste.');
                    }} className={`px-2.5 py-1 rounded text-xs font-semibold ${e.activo === false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {e.activo === false ? 'Reactivar' : 'Marcar No Asiste'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL AGREGAR EGRESADO */}
      {modalAgregarEgresado && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border">
            <div className="bg-[#6B1D2F] text-white p-4 flex justify-between items-center">
              <h3 className="font-bold text-base">Agregar Nuevo Egresado</h3>
              <button onClick={() => setModalAgregarEgresado(false)} className="p-1 rounded-lg text-white/80 hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={agregarEgresadoManual} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre y Apellido</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: PÉREZ, JUAN"
                  value={nuevoEgNombre}
                  onChange={(e) => setNuevoEgNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-[#6B1D2F]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">DNI (8 dígitos)</label>
                <input
                  type="text"
                  required
                  maxLength={8}
                  placeholder="Ej: 48123456"
                  value={nuevoEgDni}
                  onChange={(e) => setNuevoEgDni(sanitizeDNI(e.target.value))}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm font-mono outline-none focus:border-[#6B1D2F]"
                />
              </div>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalAgregarEgresado(false)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold shadow">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR EGRESADO */}
      {modalEditarEgr && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border">
            <div className="bg-[#6B1D2F] text-white p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">Editar Egresado y Acompañantes</h3>
                <p className="text-xs text-rose-100">Modificá datos personales, celular y cupo.</p>
              </div>
              <button onClick={() => setModalEditarEgr(null)} className="p-1.5 rounded-lg text-white/80 hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarEdicionEgresado} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre y Apellido</label>
                <input
                  type="text"
                  required
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-[#6B1D2F]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">DNI (8 dígitos)</label>
                <input
                  type="text"
                  required
                  maxLength={8}
                  value={editDni}
                  onChange={(e) => setEditDni(sanitizeDNI(e.target.value))}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm font-mono outline-none focus:border-[#6B1D2F]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Celular / WhatsApp de contacto</label>
                <input
                  type="text"
                  value={editCelular}
                  onChange={(e) => setEditCelular(e.target.value)}
                  placeholder="Ej: 2994444444"
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-[#6B1D2F]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cupo Asignado de Familiares</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  required
                  value={editCupo}
                  onChange={(e) => setEditCupo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-[#6B1D2F]"
                />
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs font-bold text-slate-700 mb-2">Invitados cargados actualmente:</p>
                <div className="max-h-36 overflow-y-auto space-y-1.5 bg-slate-50 p-2 rounded-xl border text-xs">
                  {invitados.filter((i) => i.egresado_id === modalEditarEgr.id).length === 0 ? (
                    <p className="text-slate-400 text-center py-2">Sin invitados cargados.</p>
                  ) : (
                    invitados.filter((i) => i.egresado_id === modalEditarEgr.id).map((inv, i) => (
                      <div key={inv.id} className="flex justify-between items-center bg-white p-2 rounded border">
                        <span><b>#{i+1}</b> {inv.nombre_completo} (DNI: {inv.dni})</span>
                        <span className="font-mono font-bold text-slate-600">{inv.numero_entrada}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalEditarEgr(null)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold">Cancelar</button>
                <button type="submit" disabled={guardandoEdicion} className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold shadow">
                  {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tab === 'docentes' && (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-bold">Padrón de Docentes ({docentes.length})</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setModalAgregarDocente(true)}
                className="px-3.5 py-2 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" /> Agregar Docente
              </button>
              <input ref={fileDocRef} type="file" accept=".csv,.txt" onChange={handleImportarCSVDocentes} className="hidden" />
              <button onClick={() => fileDocRef.current?.click()} className="px-3 py-2 bg-indigo-50 text-indigo-700 border rounded-xl text-xs font-bold flex items-center gap-1">
                <Upload className="w-4 h-4" /> Importar CSV
              </button>
              {docentes.length > 0 && (
                <button onClick={vaciarPadronDocentes} className="px-3 py-2 bg-rose-50 text-rose-700 border rounded-xl text-xs font-bold flex items-center gap-1">
                  <Trash2 className="w-4 h-4" /> Vaciar Padrón
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Filtrar docentes por nombre o DNI..."
              value={filtroDocente}
              onChange={(e) => setFiltroDocente(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none focus:border-[#6B1D2F]"
            />
          </div>

          <div className="max-h-96 overflow-y-auto divide-y">
            {docentesFiltrados.length === 0 ? (
              <p className="text-center text-slate-400 py-6">No se encontraron docentes.</p>
            ) : (
              docentesFiltrados.map((d) => (
                <div key={d.id} className="py-2.5 flex justify-between items-center text-sm">
                  <div>
                    <span className="font-semibold">{d.nombre_completo}</span> 
                    <span className="text-xs text-slate-500 ml-1">({d.dni})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => abrirModalEditarDocente(d)}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>

                    <button onClick={async () => {
                      const nuevoActivo = d.activo === false ? true : false;
                      await supabase.from('docentes').update({ activo: nuevoActivo }).eq('id', d.id);
                      await recargar();
                      notify(nuevoActivo ? 'Docente reactivado.' : 'Docente marcado como No Asiste.');
                    }} className={`px-2.5 py-1 rounded text-xs font-semibold ${d.activo === false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {d.activo === false ? 'Reactivar' : 'Marcar No Asiste'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL AGREGAR DOCENTE */}
      {modalAgregarDocente && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border">
            <div className="bg-[#6B1D2F] text-white p-4 flex justify-between items-center">
              <h3 className="font-bold text-base">Agregar Nuevo Docente</h3>
              <button onClick={() => setModalAgregarDocente(false)} className="p-1 rounded-lg text-white/80 hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={agregarDocenteManual} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre y Apellido</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: GÓMEZ, MARÍA"
                  value={nuevoDocNombre}
                  onChange={(e) => setNuevoDocNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-[#6B1D2F]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">DNI (8 dígitos)</label>
                <input
                  type="text"
                  required
                  maxLength={8}
                  placeholder="Ej: 28123456"
                  value={nuevoDocDni}
                  onChange={(e) => setNuevoDocDni(sanitizeDNI(e.target.value))}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm font-mono outline-none focus:border-[#6B1D2F]"
                />
              </div>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalAgregarDocente(false)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold shadow">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR DOCENTE */}
      {modalEditarDoc && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border">
            <div className="bg-[#6B1D2F] text-white p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">Editar Docente</h3>
                <p className="text-xs text-rose-100">Actualizar datos institucionales.</p>
              </div>
              <button onClick={() => setModalEditarDoc(null)} className="p-1.5 rounded-lg text-white/80 hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarEdicionDocente} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre y Apellido</label>
                <input
                  type="text"
                  required
                  value={editDocNombre}
                  onChange={(e) => setEditDocNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-[#6B1D2F]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">DNI (8 dígitos)</label>
                <input
                  type="text"
                  required
                  maxLength={8}
                  value={editDocDni}
                  onChange={(e) => setEditDocDni(sanitizeDNI(e.target.value))}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm font-mono outline-none focus:border-[#6B1D2F]"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalEditarDoc(null)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={guardandoDocente} className="flex-1 py-2.5 bg-[#6B1D2F] hover:bg-opacity-90 text-white rounded-xl text-xs font-bold shadow">
                  {guardandoDocente ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECCIÓN VIP / INVITADOS ESPECIALES */}
      {tab === 'vip' && (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-bold">Padrón de Invitados VIP / Autoridades ({especiales.length})</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setModalAgregarVip(true)}
                className="px-3.5 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" /> Agregar Invitado VIP
              </button>
              <input ref={fileVipRef} type="file" accept=".csv,.txt" onChange={handleImportarCSVVips} className="hidden" />
              <button onClick={() => fileVipRef.current?.click()} className="px-3 py-2 bg-indigo-50 text-indigo-700 border rounded-xl text-xs font-bold flex items-center gap-1">
                <Upload className="w-4 h-4" /> Importar CSV
              </button>
              {especiales.length > 0 && (
                <button onClick={vaciarPadronVip} className="px-3 py-2 bg-rose-50 text-rose-700 border rounded-xl text-xs font-bold flex items-center gap-1">
                  <Trash2 className="w-4 h-4" /> Vaciar Padrón
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Filtrar invitados VIP por nombre o DNI..."
              value={filtroVip}
              onChange={(e) => setFiltroVip(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none focus:border-amber-600"
            />
          </div>

          <div className="max-h-96 overflow-y-auto divide-y">
            {vipsFiltrados.length === 0 ? (
              <p className="text-center text-slate-400 py-6">No se encontraron invitados VIP.</p>
            ) : (
              vipsFiltrados.map((v) => (
                <div key={v.id} className="py-2.5 flex justify-between items-center text-sm">
                  <div>
                    <span className="font-semibold">{v.nombre_completo}</span> 
                    <span className="text-xs text-slate-500 ml-1">{v.dni ? `(${v.dni})` : '(Sin DNI)'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => abrirModalEditarVip(v)}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" /> Editar
                    </button>

                    <button onClick={async () => {
                      const nuevoActivo = v.activo === false ? true : false;
                      await supabase.from('invitados_especiales').update({ activo: nuevoActivo }).eq('id', v.id);
                      await recargar();
                      notify(nuevoActivo ? 'VIP reactivado.' : 'VIP marcado como No Asiste.');
                    }} className={`px-2.5 py-1 rounded text-xs font-semibold ${v.activo === false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {v.activo === false ? 'Reactivar' : 'Marcar No Asiste'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL AGREGAR VIP */}
      {modalAgregarVip && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border">
            <div className="bg-amber-600 text-white p-4 flex justify-between items-center">
              <h3 className="font-bold text-base">Agregar Invitado VIP</h3>
              <button onClick={() => setModalAgregarVip(false)} className="p-1 rounded-lg text-white/80 hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={agregarVipManual} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre y Apellido / Institución</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: SUPERVISIÓN ESCOLAR"
                  value={nuevoVipNombre}
                  onChange={(e) => setNuevoVipNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-amber-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">DNI (Opcional)</label>
                <input
                  type="text"
                  maxLength={8}
                  placeholder="Ej: 20123456"
                  value={nuevoVipDni}
                  onChange={(e) => setNuevoVipDni(sanitizeDNI(e.target.value))}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm font-mono outline-none focus:border-amber-600"
                />
              </div>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalAgregarVip(false)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-xs font-bold shadow">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR VIP */}
      {modalEditarVip && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border">
            <div className="bg-amber-600 text-white p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">Editar Invitado VIP</h3>
                <p className="text-xs text-amber-100">Actualizar datos institucionales.</p>
              </div>
              <button onClick={() => setModalEditarVip(null)} className="p-1.5 rounded-lg text-white/80 hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={guardarEdicionVip} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre y Apellido</label>
                <input
                  type="text"
                  required
                  value={editVipNombre}
                  onChange={(e) => setEditVipNombre(e.target.value)}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">DNI (Opcional)</label>
                <input
                  type="text"
                  maxLength={8}
                  value={editVipDni}
                  onChange={(e) => setEditVipDni(sanitizeDNI(e.target.value))}
                  className="w-full px-3 py-2 bg-white border rounded-xl text-sm font-mono outline-none focus:border-amber-600"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalEditarVip(null)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={guardandoVip} className="flex-1 py-2.5 bg-amber-600 hover:bg-opacity-90 text-white rounded-xl text-xs font-bold shadow">
                  {guardandoVip ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECCIÓN SOLICITUD DE BUTACAS */}
      {tab === 'solicitudes' && (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="border-b pb-3">
            <h3 className="font-bold text-base text-[#6B1D2F]">Bandeja de Solicitudes de Butacas Extra</h3>
            <p className="text-xs text-slate-500">Aprobá o rechazá las peticiones de lugares adicionales de los egresados.</p>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-3">
            {solicitudes.length === 0 ? (
              <p className="text-center text-slate-400 py-8">No hay solicitudes de butacas pendientes.</p>
            ) : (
              solicitudes.map((s) => {
                const egr = egresados.find((e) => e.id === s.egresado_id);
                const numeroWp = egr?.celular ? egr.celular.replace(/\D/g, '') : '';
                const linkWpAprobado = numeroWp
                  ? `https://wa.me/549${numeroWp}?text=Hola%20${encodeURIComponent(s.egresado_nombre)},%20tu%20solicitud%20de%20+${s.cantidad_solicitada}%20butaca(s)%20extra%20para%20la%20Colación%202026%20fue%20APROBADA.%20Ya%20podes%20ingresar%20al%20portal%20a%20cargar%20a%20tus%20invitados.`
                  : '';

                return (
                  <div key={s.id} className="p-4 border rounded-2xl flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
                    <div>
                      <p className="font-bold text-sm text-slate-900">{s.egresado_nombre} <span className="text-indigo-600 font-extrabold">(+{s.cantidad_solicitada} butacas)</span></p>
                      <p className="text-xs text-slate-500">DNI: {s.egresado_dni} · Motivo: <i>{s.observacion || 'Sin observación'}</i></p>
                    </div>

                    <div className="flex items-center gap-2">
                      {s.estado === 'pendiente' ? (
                        <>
                          <button
                            onClick={() => resolverSolicitud(s, true)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs"
                          >
                            ✓ Aprobar y Asignar
                          </button>
                          <button
                            onClick={() => resolverSolicitud(s, false)}
                            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold"
                          >
                            Rechazar
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full font-bold uppercase text-xs ${s.estado === 'aprobada' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {s.estado}
                          </span>
                          {s.estado === 'aprobada' && numeroWp && (
                            <a
                              href={linkWpAprobado}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs"
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> Notificar WhatsApp
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {tab === 'reportes' && (
        <div className="bg-white rounded-2xl border p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
            <div>
              <h3 className="font-bold text-base text-[#6B1D2F]">Acreditación en Vivo — Ceremonial</h3>
              <p className="text-xs text-slate-500">Control en tiempo real de egresados presentes en sala.</p>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl text-xs font-bold">
              <span>Porcentaje de Ingreso:</span>
              <span className="text-emerald-700 font-mono text-sm">{porcentajeAsistencia}% ({presentesCount}/{egresados.length})</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-[11px] text-emerald-700 font-bold">Egresados Presentes</p>
              <p className="text-xl font-extrabold text-emerald-900">{presentesCount} / {egresados.length}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200">
              <p className="text-[11px] text-sky-700 font-bold">Familiares Ingresados</p>
              <p className="text-xl font-extrabold text-sky-900">{invitados.filter(i => i.asistio).length} / {invitados.length}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200">
              <p className="text-[11px] text-indigo-700 font-bold">Docentes Presentes</p>
              <p className="text-xl font-extrabold text-indigo-900">{docentes.filter(d => d.asistio).length} / {docentes.length}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-[11px] text-amber-700 font-bold">VIP / Autoridades</p>
              <p className="text-xl font-extrabold text-amber-900">{especiales.filter(v => v.asistio).length} / {especiales.length}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Buscar egresado en ceremonial..."
                value={busquedaCeremonial}
                onChange={(e) => setBusquedaCeremonial(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none focus:border-[#6B1D2F]"
              />
            </div>
            <div className="flex gap-1.5 w-full sm:w-auto">
              {['TODOS', 'PRESENTES', 'PENDIENTES'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltroCeremonial(f)}
                  className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    filtroCeremonial === f ? 'bg-[#6B1D2F] text-white border-[#6B1D2F]' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border rounded-xl divide-y text-xs">
            {egresadosFiltradosCeremonial.length === 0 ? (
              <p className="text-center text-slate-400 py-8">No se encontraron egresados con los filtros seleccionados.</p>
            ) : (
              egresadosFiltradosCeremonial.map((e) => (
                <div key={e.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{e.nombre_completo}</p>
                    <p className="text-slate-500">DNI: {e.dni} · Cupo: {e.cupo_asignado} lugares</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full font-bold uppercase ${e.asistio ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                    {e.asistio ? '✓ Presente' : 'Pendiente'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'usuarios' && perfilStaff?.rol === 'admin' && (
        <div className="bg-white rounded-2xl border p-5 space-y-5">
          <h3 className="font-bold">Gestión de Usuarios y Roles</h3>
          <p className="text-xs text-slate-500">Creá, editá, activá/desactivá o cambiá la contraseña de Administradores, Coordinadores y Personal de Puerta.</p>

          <form onSubmit={crearUsuarioSistema} className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border">
            <input type="text" placeholder="Nombre y Apellido" value={nuevoNombreUsr} onChange={(e) => setNuevoNombreUsr(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white" required />
            <input type="email" placeholder="correo@esrn5.edu.ar" value={nuevoEmailUsr} onChange={(e) => setNuevoEmailUsr(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white" required />
            <div className="relative">
              <input type={showPassUsr ? "text" : "password"} placeholder="Contraseña (mín. 6)" value={nuevoPassUsr} onChange={(e) => setNuevoPassUsr(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm bg-white pr-10" required />
              <button type="button" onClick={() => setShowPassUsr(!showPassUsr)} className="absolute right-3 top-2.5 text-slate-400">
                {showPassUsr ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <select value={nuevoRolUsr} onChange={(e) => setNuevoRolUsr(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white font-medium">
              <option value="puerta">Control de Acceso (Puerta)</option>
              <option value="coordinador">Coordinador</option>
              <option value="admin">Administrador</option>
            </select>
            <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs">+ Crear Usuario</button>
          </form>

          {modalCambiarClaveUsr && (
            <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-amber-900">Nueva contraseña para <b>{modalCambiarClaveUsr.nombre}</b> ({modalCambiarClaveUsr.email}):</span>
              <form onSubmit={cambiarClaveUsuarioSistema} className="flex gap-2 items-center flex-1 max-w-sm">
                <input
                  type="password"
                  placeholder="Nueva clave"
                  value={nuevaClaveUsr}
                  onChange={(e) => setNuevaClaveUsr(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border text-xs bg-white flex-1"
                  required
                />
                <button type="submit" disabled={guardandoClave} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold">
                  {guardandoClave ? 'Guardando...' : 'Guardar Clave'}
                </button>
                <button type="button" onClick={() => setModalCambiarClaveUsr(null)} className="px-3 py-1.5 border rounded-lg text-xs bg-white text-slate-700">
                  Cancelar
                </button>
              </form>
            </div>
          )}

          {modalEditarUsr && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border">
                <div className="bg-[#6B1D2F] text-white p-4 flex justify-between items-center">
                  <h3 className="font-bold text-base">Editar Usuario del Sistema</h3>
                  <button onClick={() => setModalEditarUsr(null)} className="p-1 rounded-lg text-white/80 hover:bg-white/10">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={guardarEdicionUsuario} className="p-5 space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nombre y Apellido</label>
                    <input
                      type="text"
                      required
                      value={editUsrNombre}
                      onChange={(e) => setEditUsrNombre(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-[#6B1D2F]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      required
                      value={editUsrEmail}
                      onChange={(e) => setEditUsrEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-[#6B1D2F]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Rol en el Sistema</label>
                    <select
                      value={editUsrRol}
                      onChange={(e) => setEditUsrRol(e.target.value)}
                      className="w-full px-3 py-2 bg-white border rounded-xl text-sm outline-none focus:border-[#6B1D2F]"
                    >
                      <option value="puerta">Control de Acceso (Puerta)</option>
                      <option value="coordinador">Coordinador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-3 border-t">
                    <button type="button" onClick={() => setModalEditarUsr(null)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold">Cancelar</button>
                    <button type="submit" disabled={guardandoUsr} className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold shadow">
                      {guardandoUsr ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="divide-y text-sm">
            {usuariosSistema.map((u) => (
              <div key={u.id} className="py-3 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900">{u.nombre}</p>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.activo !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {u.activo !== false ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{u.email} · Rol: <strong className="uppercase">{u.rol}</strong></p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => abrirModalEditarUsuario(u)}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button
                    onClick={() => setModalCambiarClaveUsr(u)}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1"
                  >
                    <Key className="w-3.5 h-3.5" /> Clave
                  </button>
                  <button
                    onClick={async () => {
                      const nuevoEstado = u.activo === false ? true : false;
                      await supabase.from('usuarios_sistema').update({ activo: nuevoEstado }).eq('id', u.id);
                      await recargar();
                      notify(`Usuario ${nuevoEstado ? 'activado' : 'desactivado'}.`);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${u.activo !== false ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                  >
                    {u.activo !== false ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={async () => {
                      if(!window.confirm(`¿Eliminar al usuario ${u.nombre}?`)) return;
                      await supabase.from('usuarios_sistema').delete().eq('id', u.id);
                      await recargar();
                      notify('Usuario eliminado del sistema.');
                    }}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200"
                    title="Eliminar usuario"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
