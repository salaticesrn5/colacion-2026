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
// MÓDULO C: CONTROL DE ACCESO EN PUERTA (Con Tarjeta Visual Gigante de Éxito)
// ============================================================================
function ModuloPuerta({ egresados, invitados, docentes, especiales, recargar, notify }) {
  const [busqueda, setBusqueda] = useState('');
  const [codigoManualQr, setCodigoManualQr] = useState('');
  const [egresadoSeleccionado, setEgresadoSeleccionado] = useState(null);
  const [escaneandoCamara, setEscaneandoCamara] = useState(false);
  const [resultadoIngreso, setResultadoIngreso] = useState(null); // Tarjeta visual en pantalla
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  const validarCodigoEntrada = async (codigoRaw) => {
    const raw = String(codigoRaw || '').trim();
    if (!raw) return;

    let code = raw.toUpperCase();

    // Si escanea el QR institucional completo (ej: ESRN005-DOCENTE-26620400-SANDRI...)
    if (code.includes('ESRN005-')) {
      const partes = code.split('-');
      for (let p of partes) {
        if (/^\d{7,8}$/.test(p)) {
          code = p;
          break;
        }
      }
    }

    // 1. Buscar en Invitados (Familiares)
    let inv = invitados.find((i) => String(i.numero_entrada || '').toUpperCase() === code || String(i.dni || '') === code);
    if (inv) {
      if (inv.asistio) {
        setResultadoIngreso({ tipo: 'error', titulo: '¡ALERTA DUPLICADO!', nombre: inv.nombre_completo, detalle: `Entrada ${inv.numero_entrada} (DNI ${inv.dni}) ya ingresó anteriormente.` });
        notify(`⚠️ ¡ALERTA DUPLICADO! La entrada ${inv.numero_entrada} ya ingresó.`, 'error');
        return;
      }
      await supabase.from('invitados').update({ asistio: true, hora_ingreso: new Date().toISOString() }).eq('id', inv.id);
      await recargar();
      setResultadoIngreso({ tipo: 'success', titulo: '✓ INGRESO PERMITIDO (FAMILIAR)', nombre: inv.nombre_completo, detalle: `DNI: ${inv.dni} · Entrada: ${inv.numero_entrada}` });
      notify(`✓ INGRESO PERMITIDO: ${inv.nombre_completo}`);
      return;
    }

    // 2. Buscar en Docentes
    let doc = docentes.find((d) => String(d.dni || '') === code || code.includes(String(d.dni || '')));
    if (doc) {
      if (doc.asistio) {
        setResultadoIngreso({ tipo: 'warning', titulo: '⚠️ DOCENTE YA INGRESÓ', nombre: doc.nombre_completo, detalle: `DNI: ${doc.dni}` });
        notify(`⚠️ ¡DOCENTE YA INGRESÓ! ${doc.nombre_completo}`, 'warning');
        return;
      }
      await supabase.from('docentes').update({ asistio: true }).eq('id', doc.id);
      await recargar();
      setResultadoIngreso({ tipo: 'success', titulo: '✓ INGRESO PERMITIDO (DOCENTE)', nombre: doc.nombre_completo, detalle: `DNI: ${doc.dni}` });
      notify(`✓ INGRESO PERMITIDO: ${doc.nombre_completo}`);
      return;
    }

    // 3. Buscar en VIP
    let vip = especiales.find((v) => String(v.dni || '') === code || code.includes(String(v.dni || '')) || String(v.nombre_completo || '').toUpperCase().includes(code));
    if (vip) {
      if (vip.asistio) {
        setResultadoIngreso({ tipo: 'warning', titulo: '⚠️ VIP YA INGRESÓ', nombre: vip.nombre_completo, detalle: 'Autoridad / Invitado Especial' });
        notify(`⚠️ ¡VIP YA INGRESÓ! ${vip.nombre_completo}`, 'warning');
        return;
      }
      await supabase.from('invitados_especiales').update({ asistio: true }).eq('id', vip.id);
      await recargar();
      setResultadoIngreso({ tipo: 'success', titulo: '✓ INGRESO PERMITIDO (VIP)', nombre: vip.nombre_completo, detalle: 'Autoridad / Invitado Especial' });
      notify(`✓ INGRESO PERMITIDO: ${vip.nombre_completo}`);
      return;
    }

    setResultadoIngreso({ tipo: 'error', titulo: '❌ CÓDIGO NO ENCONTRADO', nombre: raw, detalle: 'Verifique el padrón o busque manualmente por DNI.' });
    notify(`❌ Código o DNI no encontrado: ${raw}`, 'error');
  };

  const iniciarCamara = async () => {
    setEscaneandoCamara(true);
    setResultadoIngreso(null);
    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' }
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      if (window.BarcodeDetector) {
        const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
        scanIntervalRef.current = setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const scannedText = barcodes[0].rawValue;
                validarCodigoEntrada(scannedText);
              }
            } catch (err) {
              // Ignorar errores transitorios
            }
          }
        }, 400);
      }
    } catch (err) {
      console.error(err);
      notify('No se pudo acceder a la cámara trasera. Verifique los permisos.', 'error');
      setEscaneandoCamara(false);
    }
  };

  const apagarCamara = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setEscaneandoCamara(false);
  };

  useEffect(() => {
    return () => {
      apagarCamara();
    };
  }, []);

  const termino = busqueda.trim().toLowerCase();
  const egresadosCoincidentes = termino ? egresados.filter((e) => (e.nombre_completo || '').toLowerCase().includes(termino) || e.dni.includes(termino)) : [];
  const docentesCoincidentes = termino ? docentes.filter((d) => (d.nombre_completo || '').toLowerCase().includes(termino) || d.dni.includes(termino)) : [];

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {/* TARJETA PRINCIPAL DE ESCANEO RÁPIDO */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-4 shadow-xl text-center">
        <div>
          <h2 className="font-extrabold text-2xl text-white">Control de Puerta</h2>
          <p className="text-xs text-slate-300 mt-1">Utilizá la cámara trasera para escanear los pases QR al ingresar</p>
        </div>

        {/* BOTÓN GIGANTE PARA ACTIVAR CÁMARA TRASERA */}
        <button
          type="button"
          onClick={() => {
            if (escaneandoCamara) {
              apagarCamara();
            } else {
              iniciarCamara();
            }
          }}
          className={`w-full py-6 px-6 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-3 shadow-2xl transition-all cursor-pointer ${
            escaneandoCamara 
              ? 'bg-rose-700 hover:bg-rose-800 text-white animate-pulse' 
              : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white scale-[1.02]'
          }`}
        >
          {escaneandoCamara ? (
            <>
              <CameraOff className="w-8 h-8" /> Apagar Cámara
            </>
          ) : (
            <>
              <Camera className="w-8 h-8" /> 📷 ESCANEAR CÓDIGO QR
            </>
          )}
        </button>

        {/* TARJETA VISUAL GIGANTE DE CONFIRMACIÓN EN PANTALLA */}
        {resultadoIngreso && (
          <div className={`p-5 rounded-2xl border-4 text-left space-y-2 shadow-2xl transition-all animate-bounce ${
            resultadoIngreso.tipo === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-900' :
            resultadoIngreso.tipo === 'warning' ? 'bg-amber-50 border-amber-500 text-amber-900' :
            'bg-rose-50 border-rose-500 text-rose-900'
          }`}>
            <div className="flex justify-between items-start">
              <span className="font-extrabold text-sm uppercase tracking-wider">{resultadoIngreso.titulo}</span>
              <button onClick={() => setResultadoIngreso(null)} className="text-slate-500 hover:text-slate-800 font-bold px-2 py-0.5 rounded bg-white border text-xs">✕ Cerrar</button>
            </div>
            <p className="font-black text-xl leading-tight">{resultadoIngreso.nombre}</p>
            <p className="text-xs font-semibold opacity-90">{resultadoIngreso.detalle}</p>
          </div>
        )}

        {escaneandoCamara && (
          <div className="bg-slate-800 border-2 border-emerald-500 rounded-2xl p-4 space-y-3">
            <div className="relative w-full h-80 bg-black rounded-xl overflow-hidden border border-slate-700">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 border-4 border-emerald-500/40 rounded-xl pointer-events-none flex items-center justify-center">
                <div className="w-56 h-56 border-2 border-dashed border-emerald-400 rounded-lg animate-pulse" />
              </div>
            </div>
            <p className="font-bold text-xs text-emerald-400">Apuntá la cámara trasera al código QR del pase</p>
            <button
              type="button"
              onClick={() => {
                const primerInv = invitados[0]?.numero_entrada || 'ENT-1234-1-589';
                validarCodigoEntrada(primerInv);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow"
            >
              Simular Lectura Exitosa
            </button>
          </div>
        )}

        {/* INPUT DE TIPEO RÁPIDO OPCIONAL */}
        <form onSubmit={(e) => { e.preventDefault(); validarCodigoEntrada(codigoManualQr); setCodigoManualQr(''); }} className="flex gap-2 pt-2 border-t border-slate-800">
          <input type="text" placeholder="O tipear código ENT-... o DNI" value={codigoManualQr} onChange={(e) => setCodigoManualQr(e.target.value)} className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white outline-none font-mono" />
          <button type="submit" className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">Registrar</button>
        </form>
      </div>

      {/* PLAN B: BÚSQUEDA MANUAL */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
        <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Plan B: Búsqueda manual por Apellido o DNI</h3>
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
          <input type="text" placeholder="Escribí el nombre del egresado, docente o DNI..." value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setEgresadoSeleccionado(null); }} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 text-sm outline-none focus:border-[#6B1D2F]" />
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
                <button onClick={async () => { await supabase.from('docentes').update({ asistio: !doc.asistio }).eq('id', doc.id); await recargar(); }} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs ${doc.asistio ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
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
