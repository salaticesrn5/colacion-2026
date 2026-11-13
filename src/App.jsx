import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Users, UserCheck, Shield, QrCode, Upload, Trash2, Plus, Search,
  CheckCircle2, XCircle, AlertTriangle, Lock, Unlock, Download,
  LogOut, Eye, Edit3, Save, X, RefreshCw, MessageCircle, Award,
  UserPlus, FileSpreadsheet, Check, ArrowRight, Building2
} from 'lucide-react';

// ============================================================================
// CONFIGURACIÓN DE SUPABASE (Usa tus variables de entorno de Vite/Vercel)
// ============================================================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente secundario aislado en memoria para crear usuarios sin cerrar tu sesión Admin
const createTempAuthClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

// ============================================================================
// UTILIDADES DE SANITIZACIÓN Y VALIDACIÓN (DNI 8 DÍGITOS ESTRICTO)
// ============================================================================
const sanitizeDNI = (val) => String(val || '').replace(/\D/g, '').slice(0, 8);

const CAPACIDAD_MAXIMA = 525;
const CUPO_BASE_DEFECTO = 3;

const getQrImageUrl = (code) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(code)}`;

// Parser robusto para archivos CSV (coma o punto y coma, con o sin comillas)
const parseCSV = (text) => {
  const cleanText = text.replace(/^\uFEFF/, '').trim();
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const rows = lines.map((line) =>
    line
      .split(sep)
      .map((cell) => cell.replace(/^["']|["']$/g, '').trim())
  );
  const firstRowLower = rows[0].join(' ').toLowerCase();
  if (
    firstRowLower.includes('dni') ||
    firstRowLower.includes('nombre') ||
    firstRowLower.includes('apellido') ||
    firstRowLower.includes('documento')
  ) {
    return rows.slice(1);
  }
  return rows;
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function App() {
  const [vista, setVista] = useState('portal');
  const [session, setSession] = useState(null);
  const [perfilStaff, setPerfilStaff] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [config, setConfig] = useState({
    id: null,
    estado_etapa: 'abierta',
    cupo_base: CUPO_BASE_DEFECTO,
  });

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
      if (s) {
        cargarPerfilStaff(s.user);
      } else {
        setLoadingAuth(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        cargarPerfilStaff(s.user);
      } else {
        setPerfilStaff(null);
        setLoadingAuth(false);
      }
    });

    cargarDatosGlobales();
    return () => listener.subscription.unsubscribe();
  }, []);

  const cargarPerfilStaff = async (user) => {
    try {
      const { data } = await supabase
        .from('usuarios_sistema')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      if (data) {
        setPerfilStaff(data);
        setVista(data.rol === 'puerta' ? 'puerta' : 'admin');
      } else {
        const fallbackAdmin = {
          nombre: user.email.split('@')[0],
          email: user.email,
          rol: 'admin',
          activo: true,
        };
        setPerfilStaff(fallbackAdmin);
        setVista('admin');
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
      const [
        resCfg,
        resEgr,
        resInv,
        resDoc,
        resEsp,
        resSol,
        resUsr,
      ] = await Promise.all([
        supabase.from('configuracion').select('*').limit(1).maybeSingle(),
        supabase.from('egresados').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('invitados').select('*').order('numero_entrada', { ascending: true }),
        supabase.from('docentes').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('invitados_especiales').select('*').order('created_at', { ascending: true }),
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
  const totalCuposFamiliares = egresados.reduce(
    (acc, e) => acc + (Number(e.cupo_asignado) || 0),
    0
  );
  const totalOcupado =
    totalEgresados + totalDocentes + totalEspeciales + totalCuposFamiliares;
  const vacantesLibres = CAPACIDAD_MAXIMA - totalOcupado;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-medium transition-all ${
            toast.type === 'error'
              ? 'bg-rose-600'
              : toast.type === 'warning'
              ? 'bg-amber-600'
              : 'bg-emerald-600'
          }`}
        >
          {toast.type === 'error' ? (
            <XCircle className="w-5 h-5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 border border-emerald-400/30 p-2 rounded-xl">
              <Award className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg leading-tight tracking-tight">
                Colación 2026 — ESRN N° 005
              </h1>
              <p className="text-xs text-slate-400">
                Aforo Máximo: {CAPACIDAD_MAXIMA} butacas · Tiempo Real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!session ? (
              <>
                <button
                  onClick={() => setVista('portal')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                    vista === 'portal'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Portal Egresados
                </button>
                <button
                  onClick={() => setVista('login')}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                    vista === 'login'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Acceso Personal / Puerta
                </button>
              </>
            ) : (
              <>
                <span className="hidden sm:inline-flex items-center gap-1.5 bg-emerald-950/80 border border-emerald-700/50 text-emerald-300 px-3 py-1 rounded-full text-xs font-medium">
                  <Shield className="w-3.5 h-3.5" />
                  {perfilStaff?.nombre} ({perfilStaff?.rol?.toUpperCase()})
                </span>

                {(perfilStaff?.rol === 'admin' || perfilStaff?.rol === 'coordinador') && (
                  <button
                    onClick={() => setVista(vista === 'admin' ? 'puerta' : 'admin')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition"
                  >
                    {vista === 'admin' ? 'Vista Puerta' : 'Panel Gestión'}
                  </button>
                )}

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Salir
                </button>
              </>
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
          <LoginStaff onSuccess={() => cargarDatosGlobales()} notify={notify} />
        ) : vista === 'puerta' && session ? (
          <ModuloPuerta
            egresados={egresados}
            invitados={invitados}
            docentes={docentes}
            especiales={especiales}
            recargar={cargarDatosGlobales}
            notify={notify}
          />
        ) : vista === 'admin' && session ? (
          <PanelAdministracion
            perfilStaff={perfilStaff}
            config={config}
            egresados={egresados}
            invitados={invitados}
            docentes={docentes}
            especiales={especiales}
            solicitudes={solicitudes}
            usuariosSistema={usuariosSistema}
            totalEgresados={totalEgresados}
            totalDocentes={totalDocentes}
            totalEspeciales={totalEspeciales}
            totalCuposFamiliares={totalCuposFamiliares}
            vacantesLibres={vacantesLibres}
            recargar={cargarDatosGlobales}
            notify={notify}
          />
        ) : (
          <PortalEgresados
            config={config}
            egresados={egresados}
            invitados={invitados}
            solicitudes={solicitudes}
            recargar={cargarDatosGlobales}
            notify={notify}
          />
        )}
      </main>
    </div>
  );
}

// ============================================================================
// LOGIN PERSONAL
// ============================================================================
function LoginStaff({ onSuccess, notify }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
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
        <div className="bg-indigo-100 text-indigo-600 p-3 rounded-xl">
          <Lock className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Acceso Personal</h2>
          <p className="text-xs text-slate-500">
            Administración, Coordinación y Control de Puerta
          </p>
        </div>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Correo Institucional / Usuario
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@esrn5.edu.ar"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Contraseña
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition disabled:opacity-50"
        >
          {loading ? 'Verificando...' : 'Ingresar al Sistema'}
        </button>
      </form>
    </div>
  );
}

// ============================================================================
// MÓDULO B: PORTAL DE AUTOGESTIÓN DE EGRESADOS
// ============================================================================
function PortalEgresados({ config, egresados, invitados, solicitudes, recargar, notify }) {
  const [dniInput, setDniInput] = useState('');
  const [egresadoActivo, setEgresadoActivo] = useState(null);
  const [filasInvitados, setFilasInvitados] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const [cantExtra, setCantExtra] = useState(1);
  const [obsExtra, setObsExtra] = useState('');
  const [enviandoSol, setEnviandoSol] = useState(false);

  useEffect(() => {
    if (egresadoActivo) {
      const actualizado = egresados.find((e) => e.id === egresadoActivo.id);
      if (actualizado) {
        setEgresadoActivo(actualizado);
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
        arr.push({
          id: misInv[idx].id,
          nombre_completo: misInv[idx].nombre_completo || '',
          dni: misInv[idx].dni || '',
          numero_entrada: misInv[idx].numero_entrada || '',
          guardado: true,
        });
      } else {
        arr.push({
          id: null,
          nombre_completo: '',
          dni: '',
          numero_entrada: '',
          guardado: false,
        });
      }
    }
    setFilasInvitados(arr);
  };

  const buscarEgresado = (e) => {
    e.preventDefault();
    const limpio = sanitizeDNI(dniInput);
    if (limpio.length < 7) {
      notify('Ingresá un DNI válido de 7 u 8 dígitos numéricos sin puntos.', 'error');
      return;
    }
    const encontrado = egresados.find((eg) => sanitizeDNI(eg.dni) === limpio);
    if (!encontrado) {
      notify('El DNI ingresado no figura en el padrón de egresados 2026.', 'error');
      return;
    }
    setEgresadoActivo(encontrado);
    prepararFilasInvitados(encontrado);
  };

  const puedeEditar = () => {
    if (!egresadoActivo) return false;
    if (config.estado_etapa === 'cierre_definitivo') return false;
    if (config.estado_etapa === 'cierre_parcial') {
      return Boolean(egresadoActivo.habilitado_reubicacion) && !egresadoActivo.cerrado;
    }
    return !egresadoActivo.cerrado;
  };

  const handleCambioFila = (index, campo, valor) => {
    setFilasInvitados((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              [campo]: campo === 'dni' ? sanitizeDNI(valor) : valor,
            }
          : item
      )
    );
  };

  const guardarInvitados = async () => {
    if (!puedeEditar()) return;
    setGuardando(true);
    try {
      for (let i = 0; i < filasInvitados.length; i++) {
        const fila = filasInvitados[i];
        const nombreLimpio = fila.nombre_completo.trim();
        const dniLimpio = sanitizeDNI(fila.dni);

        if (nombreLimpio && dniLimpio.length < 7) {
          notify(`Revisá el DNI del Invitado #${i + 1}: debe tener 7 u 8 números.`, 'error');
          setGuardando(false);
          return;
        }

        if (nombreLimpio && dniLimpio) {
          if (fila.id) {
            await supabase
              .from('invitados')
              .update({
                nombre_completo: nombreLimpio.toUpperCase(),
                dni: dniLimpio,
              })
              .eq('id', fila.id);
          } else {
            const numEntrada = `ENT-${egresadoActivo.dni.slice(-4)}-${i + 1}-${Math.floor(
              100 + Math.random() * 900
            )}`;
            await supabase.from('invitados').insert({
              egresado_id: egresadoActivo.id,
              nombre_completo: nombreLimpio.toUpperCase(),
              dni: dniLimpio,
              numero_entrada: numEntrada,
              asistio: false,
            });
          }
        } else if (!nombreLimpio && !dniLimpio && fila.id) {
          await supabase.from('invitados').delete().eq('id', fila.id);
        }
      }
      await recargar();
      notify('Invitados guardados correctamente. Ya podés descargar las entradas con QR.');
    } catch (err) {
      notify('Error al guardar invitados: ' + err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarCierreEgresado = async () => {
    const ok = window.confirm(
      '¿Confirmás que ya no vas a hacer más cambios? Tus formularios quedarán cerrados y los cupos que no hayas usado volverán a disponibilidad general.'
    );
    if (!ok) return;
    try {
      await guardarInvitados();
      const cargadosReales = filasInvitados.filter(
        (f) => f.nombre_completo.trim() && sanitizeDNI(f.dni).length >= 7
      ).length;
      await supabase
        .from('egresados')
        .update({
          cerrado: true,
          habilitado_reubicacion: false,
          cupo_asignado: cargadosReales,
        })
        .eq('id', egresadoActivo.id);
      await recargar();
      notify('Carga confirmada y cerrada. ¡Nos vemos en la Colación!');
    } catch (err) {
      notify('Error al cerrar carga: ' + err.message, 'error');
    }
  };

  const enviarSolicitudExtra = async (e) => {
    e.preventDefault();
    setEnviandoSol(true);
    try {
      await supabase.from('solicitudes_butacas').insert({
        egresado_id: egresadoActivo.id,
        egresado_nombre: egresadoActivo.nombre_completo,
        egresado_dni: egresadoActivo.dni,
        cantidad_solicitada: Number(cantExtra),
        observacion: obsExtra.trim(),
        estado: 'pendiente',
      });
      setObsExtra('');
      await recargar();
      notify('Solicitud de butacas extra enviada a Coordinación.');
    } catch (err) {
      notify('Error al enviar solicitud: ' + err.message, 'error');
    } finally {
      setEnviandoSol(false);
    }
  };

  const descargarInvitacionPNG = (inv) => {
    const canvas = document.createElement('canvas');
    canvas.width = 700;
    canvas.height = 420;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 700, 420);

    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 0, 700, 14);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('ACTO DE COLACIÓN 2026 — ESRN N° 005', 32, 62);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText('PASE DE ACCESO NOMINAL · BUTACA SIN NUMERAR', 32, 90);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`N° ENTRADA: ${inv.numero_entrada}`, 32, 138);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(inv.nombre_completo.toUpperCase(), 32, 182);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '18px sans-serif';
    ctx.fillText(`DNI Invitado: ${inv.dni}`, 32, 215);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px sans-serif';
    ctx.fillText(`Egresado/a: ${egresadoActivo.nombre_completo}`, 32, 265);
    ctx.fillText('Presentar este código QR junto con DNI físico en puerta.', 32, 365);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(465, 115, 200, 200);
      ctx.drawImage(img, 475, 125, 180, 180);
      const link = document.createElement('a');
      link.download = `Entrada_${inv.numero_entrada}_${inv.dni}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = getQrImageUrl(inv.numero_entrada);
  };

  if (!egresadoActivo) {
    return (
      <div className="max-w-lg mx-auto mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex bg-emerald-100 text-emerald-700 p-3.5 rounded-2xl mb-3">
            <Users className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Portal de Egresados</h2>
          <p className="text-sm text-slate-600 mt-1">
            Ingresá tu DNI (sin puntos ni espacios) para gestionar tus invitados y descargar tus pases QR.
          </p>
        </div>

        <form onSubmit={buscarEgresado} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              DNI del Egresado/a (8 dígitos)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={dniInput}
              onChange={(e) => setDniInput(sanitizeDNI(e.target.value))}
              placeholder="Ej: 48123456"
              className="w-full text-center text-2xl font-bold tracking-widest px-4 py-3.5 rounded-xl border-2 border-slate-300 focus:border-emerald-500 outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base transition shadow-sm"
          >
            Ingresar con mi DNI
          </button>
        </form>
      </div>
    );
  }

  const misSolicitudes = solicitudes.filter((s) => s.egresado_id === egresadoActivo.id);
  const editable = puedeEditar();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {egresadoActivo.notificacion_portal && (
        <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-950 font-medium">
            {egresadoActivo.notificacion_portal}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
            Egresado/a Verificado
          </span>
          <h2 className="text-xl font-bold text-slate-900">
            {egresadoActivo.nombre_completo}
          </h2>
          <p className="text-sm text-slate-500">
            DNI: <strong className="text-slate-700">{egresadoActivo.dni}</strong> · Cupo asignado:{' '}
            <strong className="text-slate-900">{egresadoActivo.cupo_asignado} familiares</strong>
          </p>
        </div>
        <button
          onClick={() => {
            setEgresadoActivo(null);
            setDniInput('');
          }}
          className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          Cambiar DNI
        </button>
      </div>

      {!editable && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-center gap-3 text-amber-900 text-sm">
          <Lock className="w-5 h-5 shrink-0 text-amber-600" />
          <span>
            {config.estado_etapa === 'cierre_definitivo'
              ? 'El período de carga cerró definitivamente. Podés descargar tus invitaciones QR debajo.'
              : egresadoActivo.cerrado
              ? 'Ya confirmaste tu lista definitiva. Podés descargar tus entradas QR debajo.'
              : 'El sistema se encuentra en etapa de Cierre Parcial de reubicación de vacantes.'}
          </span>
        </div>
      )}

      {editable && (
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3 text-sky-950 text-sm">
          <AlertTriangle className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <strong>Importante antes de guardar:</strong> revisá cuidadosamente el{' '}
            <strong>Nombre Completo</strong> y el <strong>DNI (8 dígitos sin puntos)</strong> de cada
            familiar para evitar demoras en el ingreso el día del acto.
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h3 className="font-bold text-slate-900 text-base">
          Tus Invitados Familiares ({filasInvitados.length} lugares)
        </h3>

        <div className="space-y-3">
          {filasInvitados.map((fila, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Invitado #{idx + 1}{' '}
                  {fila.numero_entrada && (
                    <span className="ml-2 text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      {fila.numero_entrada}
                    </span>
                  )}
                </span>
                {fila.guardado && fila.numero_entrada && (
                  <button
                    type="button"
                    onClick={() => descargarInvitacionPNG(fila)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Descargar Pase QR
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    disabled={!editable}
                    placeholder="Nombre y Apellido completo del familiar"
                    value={fila.nombre_completo}
                    onChange={(e) => handleCambioFila(idx, 'nombre_completo', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    disabled={!editable}
                    placeholder="DNI (8 dígitos)"
                    value={fila.dni}
                    onChange={(e) => handleCambioFila(idx, 'dni', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={guardarInvitados}
              disabled={guardando}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition"
            >
              <Save className="w-4 h-4" />
              {guardando ? 'Guardando...' : 'Guardar Cambios y Generar QR'}
            </button>

            <button
              type="button"
              onClick={confirmarCierreEgresado}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold text-sm transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              Ya no hago más cambios
            </button>
          </div>
        )}
      </div>

      {config.estado_etapa !== 'cierre_definitivo' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-base">
            Solicitar más butacas (Sujeto a disponibilidad)
          </h3>
          <form onSubmit={enviarSolicitudExtra} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select
              value={cantExtra}
              onChange={(e) => setCantExtra(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value={1}>+1 butaca extra</option>
              <option value={2}>+2 butacas extra</option>
              <option value={3}>+3 butacas extra</option>
            </select>
            <input
              type="text"
              placeholder="Observación opcional (ej: abuelos)"
              value={obsExtra}
              onChange={(e) => setObsExtra(e.target.value)}
              className="sm:col-span-2 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
            <button
              type="submit"
              disabled={enviandoSol}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm"
            >
              {enviandoSol ? 'Enviando...' : 'Solicitar'}
            </button>
          </form>

          {misSolicitudes.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-bold uppercase text-slate-500">Tus pedidos realizados:</p>
              {misSolicitudes.map((sol) => (
                <div
                  key={sol.id}
                  className="flex items-center justify-between text-xs bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200"
                >
                  <span>
                    Pedido de <strong>+{sol.cantidad_solicitada} lugar(es)</strong>{' '}
                    {sol.observacion && `— "${sol.observacion}"`}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full font-bold uppercase ${
                      sol.estado === 'aprobada'
                        ? 'bg-emerald-100 text-emerald-700'
                        : sol.estado === 'rechazada'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {sol.estado}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MÓDULO A: PANEL DE ADMINISTRACIÓN Y COORDINACIÓN
// ============================================================================
function PanelAdministracion({
  perfilStaff,
  config,
  egresados,
  invitados,
  docentes,
  especiales,
  solicitudes,
  usuariosSistema,
  totalEgresados,
  totalDocentes,
  totalEspeciales,
  totalCuposFamiliares,
  vacantesLibres,
  recargar,
  notify,
}) {
  const [tab, setTab] = useState('egresados');
  const esAdmin = perfilStaff?.rol === 'admin';

  const [nuevoEgrNombre, setNuevoEgrNombre] = useState('');
  const [nuevoEgrDni, setNuevoEgrDni] = useState('');
  const [filtroEgr, setFiltroEgr] = useState('');
  const fileEgrRef = useRef(null);

  const [nuevoDocNombre, setNuevoDocNombre] = useState('');
  const [nuevoDocDni, setNuevoDocDni] = useState('');
  const fileDocRef = useRef(null);

  const [nuevoVipNombre, setNuevoVipNombre] = useState('');
  const [nuevoVipCargo, setNuevoVipCargo] = useState('');
  const [nuevoVipDni, setNuevoVipDni] = useState('');

  const [usrNombre, setUsrNombre] = useState('');
  const [usrEmail, setUsrEmail] = useState('');
  const [usrPass, setUsrPass] = useState('');
  const [usrRol, setUsrRol] = useState('puerta');
  const [creandoUsr, setCreandoUsr] = useState(false);

  const cambiarEtapaGlobal = async (nuevaEtapa) => {
    try {
      if (config.id) {
        await supabase
          .from('configuracion')
          .update({ estado_etapa: nuevaEtapa })
          .eq('id', config.id);
      } else {
        await supabase
          .from('configuracion')
          .insert({ estado_etapa: nuevaEtapa, cupo_base: CUPO_BASE_DEFECTO });
      }
      await recargar();
      notify(`Etapa actualizada a: ${nuevaEtapa.replace('_', ' ').toUpperCase()}`);
    } catch (err) {
      notify('Error cambiando etapa: ' + err.message, 'error');
    }
  };

  const recuperarVacantesNoUsadas = async () => {
    const ok = window.confirm(
      '¿Recuperar todos los cupos familiares que aún no tienen invitado cargado y sumarlos a las Vacantes Libres?'
    );
    if (!ok) return;
    try {
      for (const egr of egresados) {
        const cantCargada = invitados.filter((i) => i.egresado_id === egr.id).length;
        if (cantCargada < egr.cupo_asignado) {
          await supabase
            .from('egresados')
            .update({ cupo_asignado: cantCargada, cerrado: true })
            .eq('id', egr.id);
        }
      }
      await recargar();
      notify('Vacantes no utilizadas recuperadas a la bolsa disponible.');
    } catch (err) {
      notify('Error al recuperar vacantes: ' + err.message, 'error');
    }
  };

  const agregarEgresado = async (e) => {
    e.preventDefault();
    const dniLimpio = sanitizeDNI(nuevoEgrDni);
    if (!nuevoEgrNombre.trim() || dniLimpio.length < 7) {
      notify('Completá Nombre y DNI válido de 7 u 8 dígitos.', 'error');
      return;
    }
    try {
      const { error } = await supabase.from('egresados').insert({
        nombre_completo: nuevoEgrNombre.trim().toUpperCase(),
        dni: dniLimpio,
        cupo_asignado: CUPO_BASE_DEFECTO,
        cerrado: false,
        habilitado_reubicacion: false,
      });
      if (error) throw error;
      setNuevoEgrNombre('');
      setNuevoEgrDni('');
      await recargar();
      notify('Egresado agregado al padrón.');
    } catch (err) {
      notify('Error al agregar egresado: ' + err.message, 'error');
    }
  };

  const vaciarPadronEgresados = async () => {
    const confirmacion = window.prompt(
      'ATENCIÓN: Esta acción eliminará TODOS los egresados cargados actualmente para poder importar el padrón oficial limpio.\n\nEscribí VACIAR en mayúsculas para confirmar:'
    );
    if (confirmacion !== 'VACIAR') return;

    try {
      await supabase.from('invitados').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase
        .from('solicitudes_butacas')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('egresados').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await recargar();
      notify('Padrón de egresados vaciado correctamente.');
    } catch (err) {
      notify('Error al vaciar padrón: ' + err.message, 'error');
    }
  };

  const handleImportarCSVEgresados = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const registros = [];

      for (const r of rows) {
        if (r.length < 2) continue;
        const col0Digits = sanitizeDNI(r[0]);
        const col1Digits = sanitizeDNI(r[1]);
        let dni = '';
        let nombre = '';
        let cupo = CUPO_BASE_DEFECTO;

        if (col0Digits.length >= 7 && col0Digits.length <= 8 && !/[a-zA-Z]/.test(r[0])) {
          dni = col0Digits;
          nombre = r[1];
        } else if (col1Digits.length >= 7 && col1Digits.length <= 8) {
          nombre = r[0];
          dni = col1Digits;
        }
        if (r[2] && !isNaN(Number(r[2]))) {
          cupo = Number(r[2]);
        }

        if (dni && nombre) {
          registros.push({
            dni,
            nombre_completo: nombre.toUpperCase(),
            cupo_asignado: cupo,
            cerrado: false,
            habilitado_reubicacion: false,
          });
        }
      }

      if (registros.length === 0) {
        notify('No se encontraron filas válidas en el CSV.', 'error');
        return;
      }

      const { error } = await supabase
        .from('egresados')
        .upsert(registros, { onConflict: 'dni' });
      if (error) throw error;

      await recargar();
      notify(`¡Importación exitosa! Se cargaron ${registros.length} egresados.`);
    } catch (err) {
      notify('Error importando CSV: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const ajustarCupoEgresado = async (egr, delta) => {
    const nuevoCupo = Math.max(0, (Number(egr.cupo_asignado) || 0) + delta);
    if (delta > 0 && vacantesLibres <= 0) {
      notify('No hay vacantes libres disponibles en el recinto (525 máx).', 'error');
      return;
    }
    try {
      const updates = { cupo_asignado: nuevoCupo };
      if (delta > 0) {
        updates.cerrado = false;
        updates.habilitado_reubicacion = true;
        updates.notificacion_portal = `¡Buenas noticias! Se te asignaron lugares extra (cupo actual: ${nuevoCupo} familiares). Ya podés cargar tus nuevos invitados y descargar sus QR.`;
      }
      await supabase.from('egresados').update(updates).eq('id', egr.id);
      await recargar();
      notify(`Cupo actualizado a ${nuevoCupo} lugares para ${egr.nombre_completo}`);
    } catch (err) {
      notify('Error ajustando cupo: ' + err.message, 'error');
    }
  };

  const resolverSolicitud = async (sol, aprobar) => {
    try {
      if (aprobar) {
        const egr = egresados.find((e) => e.id === sol.egresado_id);
        if (!egr) {
          notify('No se encontró el egresado.', 'error');
          return;
        }
        if (vacantesLibres < sol.cantidad_solicitada) {
          notify('No alcanzan las vacantes libres para aprobar esa cantidad.', 'error');
          return;
        }
        const nuevoCupo = Number(egr.cupo_asignado) + Number(sol.cantidad_solicitada);
        await supabase
          .from('egresados')
          .update({
            cupo_asignado: nuevoCupo,
            cerrado: false,
            habilitado_reubicacion: true,
            notificacion_portal: `¡Buenas noticias! Se aprobó tu pedido de +${sol.cantidad_solicitada} butaca(s) extra. Ya podés cargar a tus nuevos invitados y descargar sus QR.`,
          })
          .eq('id', egr.id);
      }

      await supabase
        .from('solicitudes_butacas')
        .update({ estado: aprobar ? 'aprobada' : 'rechazada' })
        .eq('id', sol.id);

      await recargar();
      notify(aprobar ? 'Solicitud aprobada y cupo habilitado.' : 'Solicitud rechazada.');
    } catch (err) {
      notify('Error resolviendo solicitud: ' + err.message, 'error');
    }
  };

  const agregarDocente = async (e) => {
    e.preventDefault();
    const dniLimpio = sanitizeDNI(nuevoDocDni);
    if (!nuevoDocNombre.trim() || dniLimpio.length < 7) {
      notify('Ingresá Nombre y DNI válido de 7 u 8 números.', 'error');
      return;
    }
    try {
      const { error } = await supabase.from('docentes').insert({
        nombre_completo: nuevoDocNombre.trim().toUpperCase(),
        dni: dniLimpio,
        asistio: false,
      });
      if (error) throw error;
      setNuevoDocNombre('');
      setNuevoDocDni('');
      await recargar();
      notify('Docente agregado al padrón.');
    } catch (err) {
      notify('Error agregando docente: ' + err.message, 'error');
    }
  };

  const handleImportarCSVDocentes = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const registros = [];

      for (const r of rows) {
        if (r.length < 2) continue;
        const col0Digits = sanitizeDNI(r[0]);
        const col1Digits = sanitizeDNI(r[1]);
        let dni = '';
        let nombre = '';

        if (col0Digits.length >= 7 && col0Digits.length <= 8 && !/[a-zA-Z]/.test(r[0])) {
          dni = col0Digits;
          nombre = r[1];
        } else if (col1Digits.length >= 7 && col1Digits.length <= 8) {
          nombre = r[0];
          dni = col1Digits;
        }

        if (dni && nombre) {
          registros.push({
            dni,
            nombre_completo: nombre.toUpperCase(),
            asistio: false,
          });
        }
      }

      if (registros.length === 0) {
        notify('No se encontraron filas válidas en el CSV de docentes.', 'error');
        return;
      }

      const { error } = await supabase
        .from('docentes')
        .upsert(registros, { onConflict: 'dni' });
      if (error) throw error;

      await recargar();
      notify(`¡Importación exitosa! Se cargaron ${registros.length} docentes.`);
    } catch (err) {
      notify('Error importando docentes: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const agregarEspecial = async (e) => {
    e.preventDefault();
    if (!nuevoVipNombre.trim()) return;
    try {
      const { error } = await supabase.from('invitados_especiales').insert({
        nombre_completo: nuevoVipNombre.trim().toUpperCase(),
        cargo_institucion: nuevoVipCargo.trim() || 'Autoridad / Invitado Especial',
        dni: sanitizeDNI(nuevoVipDni) || null,
        asistio: false,
      });
      if (error) throw error;
      setNuevoVipNombre('');
      setNuevoVipCargo('');
      setNuevoVipDni('');
      await recargar();
      notify('Invitado Especial agregado.');
    } catch (err) {
      notify('Error agregando invitado especial: ' + err.message, 'error');
    }
  };

  const crearUsuarioSistema = async (e) => {
    e.preventDefault();
    if (!esAdmin) return;
    if (!usrNombre.trim() || !usrEmail.trim() || usrPass.length < 6) {
      notify('Completá nombre, correo y contraseña de al menos 6 caracteres.', 'error');
      return;
    }
    setCreandoUsr(true);
    try {
      const tempClient = createTempAuthClient();
      const { data: authData, error: authErr } = await tempClient.auth.signUp({
        email: usrEmail.trim().toLowerCase(),
        password: usrPass,
      });

      if (authErr && !authErr.message.toLowerCase().includes('already registered')) {
        throw authErr;
      }

      const { error: dbErr } = await supabase.from('usuarios_sistema').upsert(
        {
          auth_id: authData?.user?.id || null,
          nombre: usrNombre.trim(),
          email: usrEmail.trim().toLowerCase(),
          rol: usrRol,
          activo: true,
        },
        { onConflict: 'email' }
      );

      if (dbErr) throw dbErr;

      setUsrNombre('');
      setUsrEmail('');
      setUsrPass('');
      setUsrRol('puerta');
      await recargar();
      notify('Usuario del sistema creado correctamente.');
    } catch (err) {
      notify('Error al crear usuario: ' + err.message, 'error');
    } finally {
      setCreandoUsr(false);
    }
  };

  const eliminarUsuarioSistema = async (id) => {
    if (!window.confirm('¿Eliminar este acceso del sistema?')) return;
    await supabase.from('usuarios_sistema').delete().eq('id', id);
    await recargar();
    notify('Usuario eliminado.');
  };

  const egresadosFiltrados = egresados.filter(
    (e) =>
      e.nombre_completo.toLowerCase().includes(filtroEgr.toLowerCase()) ||
      e.dni.includes(filtroEgr)
  );

  const pendientesCount = solicitudes.filter((s) => s.estado === 'pendiente').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Egresados</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{totalEgresados}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Docentes</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{totalDocentes}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Especiales / VIP</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{totalEspeciales}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Cupos Familiares</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{totalCuposFamiliares}</p>
        </div>
        <div
          className={`col-span-2 sm:col-span-1 p-4 rounded-2xl border ${
            vacantesLibres < 0
              ? 'bg-rose-50 border-rose-300 text-rose-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          <p className="text-xs font-semibold">Vacantes Libres (de {CAPACIDAD_MAXIMA})</p>
          <p className="text-2xl font-extrabold mt-1">{vacantesLibres}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Etapa Global de Carga
          </p>
          <p className="text-xs text-slate-600">
            Controlá cuándo los egresados cargan o cuándo congelar para reubicar vacantes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => cambiarEtapaGlobal('abierta')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              config.estado_etapa === 'abierta'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            1. Carga Abierta
          </button>
          <button
            onClick={() => cambiarEtapaGlobal('cierre_parcial')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              config.estado_etapa === 'cierre_parcial'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            2. Cierre Parcial (Reubicar Vacantes)
          </button>
          <button
            onClick={() => cambiarEtapaGlobal('cierre_definitivo')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              config.estado_etapa === 'cierre_definitivo'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            3. Cierre Definitivo
          </button>
          {config.estado_etapa === 'cierre_parcial' && (
            <button
              onClick={recuperarVacantesNoUsadas}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition"
            >
              Recuperar Cupos Vacíos
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTab('solicitudes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'solicitudes'
              ? 'bg-emerald-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          Solicitudes y Vacantes ({pendientesCount})
        </button>
        <button
          onClick={() => setTab('egresados')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'egresados'
              ? 'bg-emerald-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          Egresados ({egresados.length})
        </button>
        <button
          onClick={() => setTab('docentes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'docentes'
              ? 'bg-emerald-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          Docentes ({docentes.length}) y VIP ({especiales.length})
        </button>
        <button
          onClick={() => setTab('reportes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'reportes'
              ? 'bg-emerald-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          Acreditación en Vivo
        </button>
        {esAdmin && (
          <button
            onClick={() => setTab('usuarios')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              tab === 'usuarios'
                ? 'bg-emerald-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Usuarios del Sistema ({usuariosSistema.length})
          </button>
        )}
      </div>

      {tab === 'egresados' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form onSubmit={agregarEgresado} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Nombre y Apellido"
                value={nuevoEgrNombre}
                onChange={(e) => setNuevoEgrNombre(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                placeholder="DNI (8 dígitos)"
                value={nuevoEgrDni}
                onChange={(e) => setNuevoEgrDni(sanitizeDNI(e.target.value))}
                className="w-36 px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                Agregar Egresado
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileEgrRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleImportarCSVEgresados}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileEgrRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition"
              >
                <Upload className="w-4 h-4" />
                Importar CSV Egresados
              </button>

              {egresados.length > 0 && (
                <button
                  type="button"
                  onClick={vaciarPadronEgresados}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition"
                >
                  <Trash2 className="w-4 h-4" />
                  Vaciar Padrón
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Buscar egresado por nombre o DNI..."
              value={filtroEgr}
              onChange={(e) => setFiltroEgr(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-3 px-2">Egresado</th>
                  <th className="py-3 px-2">DNI</th>
                  <th className="py-3 px-2">Invitados Cargados / Cupo</th>
                  <th className="py-3 px-2">Reubicar Cupo</th>
                  <th className="py-3 px-2">Estado</th>
                  <th className="py-3 px-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {egresadosFiltrados.map((egr) => {
                  const cargados = invitados.filter((i) => i.egresado_id === egr.id).length;
                  return (
                    <tr key={egr.id} className="hover:bg-slate-50">
                      <td className="py-3 px-2 font-semibold text-slate-900">
                        {egr.nombre_completo}
                      </td>
                      <td className="py-3 px-2 text-slate-600">{egr.dni}</td>
                      <td className="py-3 px-2">
                        <strong>{cargados}</strong> / {egr.cupo_asignado}
                      </td>
                      <td className="py-3 px-2">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => ajustarCupoEgresado(egr, -1)}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-bold text-xs"
                          >
                            -1
                          </button>
                          <button
                            onClick={() => ajustarCupoEgresado(egr, 1)}
                            className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-xs"
                          >
                            +1
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            egr.cerrado
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {egr.cerrado ? 'Cerrado' : 'Habilitado'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <button
                          onClick={async () => {
                            if (!window.confirm(`¿Eliminar a ${egr.nombre_completo}?`)) return;
                            await supabase.from('egresados').delete().eq('id', egr.id);
                            await recargar();
                          }}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'solicitudes' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-bold text-slate-900">Bandeja de Solicitudes de Butacas Extra</h3>
          {solicitudes.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Aún no hay solicitudes de butacas extra registradas.
            </p>
          ) : (
            <div className="space-y-3">
              {solicitudes.map((sol) => (
                <div
                  key={sol.id}
                  className="p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4"
                >
                  <div>
                    <p className="font-bold text-slate-900">
                      {sol.egresado_nombre}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        (DNI {sol.egresado_dni})
                      </span>
                    </p>
                    <p className="text-sm text-slate-700">
                      Solicita: <strong>+{sol.cantidad_solicitada} lugar(es)</strong>{' '}
                      {sol.observacion && `— "${sol.observacion}"`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {sol.estado === 'pendiente' ? (
                      <>
                        <button
                          onClick={() => resolverSolicitud(sol, true)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                        >
                          Aprobar y Habilitar
                        </button>
                        <button
                          onClick={() => resolverSolicitud(sol, false)}
                          className="px-3.5 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold"
                        >
                          Rechazar
                        </button>
                      </>
                    ) : (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                          sol.estado === 'aprobada'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {sol.estado}
                      </span>
                    )}

                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Hola ${sol.egresado_nombre}, te avisamos desde la organización de Colación 2026 ESRN 5 que tu pedido de +${sol.cantidad_solicitada} butaca(s) fue ${sol.estado.toUpperCase()}. Ya podés ingresar al portal con tu DNI para gestionar tus entradas QR.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Notificar por WhatsApp
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'docentes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900">Padrón de Docentes ({docentes.length})</h3>
              <div>
                <input
                  ref={fileDocRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleImportarCSVDocentes}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileDocRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Importar CSV Docentes
                </button>
              </div>
            </div>

            <form onSubmit={agregarDocente} className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Nombre y Apellido Docente"
                value={nuevoDocNombre}
                onChange={(e) => setNuevoDocNombre(e.target.value)}
                className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                placeholder="DNI (8 dígitos)"
                value={nuevoDocDni}
                onChange={(e) => setNuevoDocDni(sanitizeDNI(e.target.value))}
                className="w-32 px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
              >
                + Agregar
              </button>
            </form>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-sm">
              {docentes.map((d) => (
                <div key={d.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{d.nombre_completo}</p>
                    <p className="text-xs text-slate-500">DNI: {d.dni}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from('docentes').delete().eq('id', d.id);
                      await recargar();
                    }}
                    className="text-rose-500 hover:text-rose-700 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <h3 className="font-bold text-slate-900">
              Invitados Especiales / Autoridades ({especiales.length})
            </h3>

            <form onSubmit={agregarEspecial} className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="Nombre y Apellido"
                  value={nuevoVipNombre}
                  onChange={(e) => setNuevoVipNombre(e.target.value)}
                  className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="DNI (opcional)"
                  value={nuevoVipDni}
                  onChange={(e) => setNuevoVipDni(sanitizeDNI(e.target.value))}
                  className="w-32 px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Cargo / Institución (ej: Supervisión, Consejo Escolar)"
                  value={nuevoVipCargo}
                  onChange={(e) => setNuevoVipCargo(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
                >
                  + Agregar VIP
                </button>
              </div>
            </form>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-sm">
              {especiales.map((esp) => (
                <div key={esp.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{esp.nombre_completo}</p>
                    <p className="text-xs text-slate-500">
                      {esp.cargo_institucion} {esp.dni ? `· DNI ${esp.dni}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from('invitados_especiales').delete().eq('id', esp.id);
                      await recargar();
                    }}
                    className="text-rose-500 hover:text-rose-700 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'reportes' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-xs text-emerald-700 font-bold">Egresados Presentes</p>
              <p className="text-2xl font-extrabold text-emerald-900">
                {egresados.filter((e) => e.asistio).length} / {egresados.length}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-sky-50 border border-sky-200">
              <p className="text-xs text-sky-700 font-bold">Familiares Ingresados</p>
              <p className="text-2xl font-extrabold text-sky-900">
                {invitados.filter((i) => i.asistio).length} / {invitados.length}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200">
              <p className="text-xs text-indigo-700 font-bold">Docentes Presentes</p>
              <p className="text-2xl font-extrabold text-indigo-900">
                {docentes.filter((d) => d.asistio).length} / {docentes.length}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-700 font-bold">VIP / Autoridades</p>
              <p className="text-2xl font-extrabold text-amber-900">
                {especiales.filter((v) => v.asistio).length} / {especiales.length}
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 text-sm mb-2">
              Listado de Ceremonial — Egresados Acreditados ("Asistió")
            </h4>
            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-sm">
              {egresados.map((e) => (
                <div key={e.id} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="font-medium text-slate-900">
                    {e.nombre_completo} <span className="text-xs text-slate-400">({e.dni})</span>
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      e.asistio
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {e.asistio ? 'ASISTIÓ' : 'Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'usuarios' && esAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          <div>
            <h3 className="font-bold text-slate-900">Gestión de Usuarios y Roles</h3>
            <p className="text-xs text-slate-500">
              Creá cuentas para Coordinadores y personal de Control de Acceso (Puerta) sin cerrar tu sesión.
            </p>
          </div>

          <form
            onSubmit={crearUsuarioSistema}
            className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200"
          >
            <input
              type="text"
              required
              placeholder="Nombre y Apellido"
              value={usrNombre}
              onChange={(e) => setUsrNombre(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
            />
            <input
              type="email"
              required
              placeholder="correo@esrn5.edu.ar"
              value={usrEmail}
              onChange={(e) => setUsrEmail(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Contraseña (mín. 6)"
              value={usrPass}
              onChange={(e) => setUsrPass(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
            />
            <select
              value={usrRol}
              onChange={(e) => setUsrRol(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium"
            >
              <option value="puerta">Control de Acceso (Puerta)</option>
              <option value="coordinador">Coordinador</option>
              <option value="admin">Administrador</option>
            </select>
            <button
              type="submit"
              disabled={creandoUsr}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
            >
              {creandoUsr ? 'Creando...' : '+ Crear Usuario'}
            </button>
          </form>

          <div className="divide-y divide-slate-100 text-sm">
            {usuariosSistema.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900">{u.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {u.email} · Rol: <strong className="uppercase">{u.rol}</strong>
                  </p>
                </div>
                {u.email !== perfilStaff?.email && (
                  <button
                    onClick={() => eliminarUsuarioSistema(u.id)}
                    className="text-rose-500 hover:text-rose-700 p-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MÓDULO C: CONTROL DE ACCESO EN PUERTA
// ============================================================================
function ModuloPuerta({ egresados, invitados, docentes, especiales, recargar, notify }) {
  const [busqueda, setBusqueda] = useState('');
  const [codigoManualQr, setCodigoManualQr] = useState('');
  const [egresadoSeleccionado, setEgresadoSeleccionado] = useState(null);
  const [escanerActivo, setEscanerActivo] = useState(false);
  const videoRef = useRef(null);

  const validarCodigoEntrada = async (codigoRaw) => {
    const code = String(codigoRaw || '').trim().toUpperCase();
    if (!code) return;

    const inv = invitados.find(
      (i) => String(i.numero_entrada || '').toUpperCase() === code
    );
    if (!inv) {
      notify(`Código inválido o inexistente: ${code}`, 'error');
      return;
    }

    const egr = egresados.find((e) => e.id === inv.egresado_id);

    if (inv.asistio) {
      const hora = inv.hora_ingreso
        ? new Date(inv.hora_ingreso).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'registrada previamente';
      notify(
        `¡ALERTA DUPLICADO! La entrada ${inv.numero_entrada} (${inv.nombre_completo}) YA INGRESÓ (${hora}).`,
        'error'
      );
      return;
    }

    await supabase
      .from('invitados')
      .update({ asistio: true, hora_ingreso: new Date().toISOString() })
      .eq('id', inv.id);

    await recargar();
    notify(
      `INGRESO PERMITIDO: ${inv.nombre_completo} (DNI ${inv.dni}) — Invitado de ${
        egr?.nombre_completo || 'Egresado'
      }`
    );
  };

  const iniciarEscaner = async () => {
    setEscanerActivo(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const interval = setInterval(async () => {
          if (!videoRef.current || videoRef.current.paused) {
            clearInterval(interval);
            return;
          }
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              clearInterval(interval);
              detenerEscaner();
              validarCodigoEntrada(codes[0].rawValue);
            }
          } catch (_) {}
        }, 600);
      } else {
        notify(
          'Tu navegador no soporta escaneo directo; usá el lector rápido de código o el buscador por DNI/Nombre.',
          'warning'
        );
      }
    } catch (err) {
      setEscanerActivo(false);
      notify('No se pudo acceder a la cámara del dispositivo.', 'error');
    }
  };

  const detenerEscaner = () => {
    setEscanerActivo(false);
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  const toggleAsistenciaInvitado = async (inv) => {
    const nuevoEstado = !inv.asistio;
    await supabase
      .from('invitados')
      .update({
        asistio: nuevoEstado,
        hora_ingreso: nuevoEstado ? new Date().toISOString() : null,
      })
      .eq('id', inv.id);
    await recargar();
    notify(
      nuevoEstado
        ? `Asistencia registrada: ${inv.nombre_completo}`
        : `Asistencia desmarcada: ${inv.nombre_completo}`
    );
  };

  const toggleAsistenciaEgresado = async (egr) => {
    const nuevoEstado = !egr.asistio;
    await supabase
      .from('egresados')
      .update({ asistio: nuevoEstado })
      .eq('id', egr.id);
    await recargar();
    notify(
      nuevoEstado
        ? `Egresado acreditado: ${egr.nombre_completo}`
        : `Acreditación quitada: ${egr.nombre_completo}`
    );
  };

  const termino = busqueda.trim().toLowerCase();
  const egresadosCoincidentes = termino
    ? egresados.filter((egr) => {
        const matchEgr =
          egr.nombre_completo.toLowerCase().includes(termino) || egr.dni.includes(termino);
        const matchInv = invitados.some(
          (i) =>
            i.egresado_id === egr.id &&
            (i.nombre_completo.toLowerCase().includes(termino) ||
              i.dni.includes(termino) ||
              String(i.numero_entrada || '').toLowerCase().includes(termino))
        );
        return matchEgr || matchInv;
      })
    : [];

  const docentesCoincidentes = termino
    ? docentes.filter(
        (d) => d.nombre_completo.toLowerCase().includes(termino) || d.dni.includes(termino)
      )
    : [];

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Control de Acceso en Puerta</h2>
            <p className="text-xs text-slate-400">
              Escaneá el pase QR o buscá por Nombre, DNI o N° de Entrada
            </p>
          </div>
          {!escanerActivo ? (
            <button
              onClick={iniciarEscaner}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm"
            >
              <QrCode className="w-5 h-5" />
              Escanear QR
            </button>
          ) : (
            <button
              onClick={detenerEscaner}
              className="px-4 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs"
            >
              Cerrar Cámara
            </button>
          )}
        </div>

        {escanerActivo && (
          <div className="rounded-xl overflow-hidden bg-black aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            validarCodigoEntrada(codigoManualQr);
            setCodigoManualQr('');
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Código de entrada (ej: ENT-4693-1-812)"
            value={codigoManualQr}
            onChange={(e) => setCodigoManualQr(e.target.value)}
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-400 outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
          >
            Validar Pase
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Buscar invitado, egresado, docente o DNI..."
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setEgresadoSeleccionado(null);
            }}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        {egresadoSeleccionado ? (
          <div className="space-y-3">
            <button
              onClick={() => setEgresadoSeleccionado(null)}
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              ← Volver a resultados
            </button>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-emerald-700">
                  Egresado/a Titular
                </span>
                <p className="font-bold text-slate-900">{egresadoSeleccionado.nombre_completo}</p>
                <p className="text-xs text-slate-500">DNI: {egresadoSeleccionado.dni}</p>
              </div>
              <button
                onClick={() => toggleAsistenciaEgresado(egresadoSeleccionado)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                  egresados.find((e) => e.id === egresadoSeleccionado.id)?.asistio
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white border border-slate-300 text-slate-700'
                }`}
              >
                {egresados.find((e) => e.id === egresadoSeleccionado.id)?.asistio
                  ? '✓ Asistió'
                  : 'Marcar Asistió'}
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-slate-500">
                Familiares Habilitados del Grupo:
              </p>
              {invitados
                .filter((i) => i.egresado_id === egresadoSeleccionado.id)
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{inv.nombre_completo}</p>
                      <p className="text-xs text-slate-500">
                        DNI: {inv.dni} · <strong>{inv.numero_entrada}</strong>
                      </p>
                    </div>
                    <button
                      onClick={() => toggleAsistenciaInvitado(inv)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                        inv.asistio
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                      }`}
                    >
                      {inv.asistio ? '✓ Asistió' : 'Marcar Ingreso'}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {egresadosCoincidentes.map((egr) => {
              const invCoincidente = invitados.find(
                (i) =>
                  i.egresado_id === egr.id &&
                  (i.nombre_completo.toLowerCase().includes(termino) ||
                    i.dni.includes(termino) ||
                    String(i.numero_entrada || '').toLowerCase().includes(termino))
              );
              return (
                <button
                  key={egr.id}
                  onClick={() => setEgresadoSeleccionado(egr)}
                  className="w-full text-left p-3.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition flex items-center justify-between"
                >
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{egr.nombre_completo}</p>
                    <p className="text-xs text-slate-500">DNI Egresado: {egr.dni}</p>
                    {invCoincidente && (
                      <p className="text-xs text-emerald-700 font-medium mt-0.5">
                        Coincide invitado: {invCoincidente.nombre_completo} (DNI{' '}
                        {invCoincidente.dni})
                      </p>
                    )}
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              );
            })}

            {docentesCoincidentes.map((doc) => (
              <div
                key={doc.id}
                className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase text-indigo-600">Docente</span>
                  <p className="font-bold text-slate-900 text-sm">{doc.nombre_completo}</p>
                  <p className="text-xs text-slate-500">DNI: {doc.dni}</p>
                </div>
                <button
                  onClick={async () => {
                    await supabase
                      .from('docentes')
                      .update({ asistio: !doc.asistio })
                      .eq('id', doc.id);
                    await recargar();
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                    doc.asistio
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
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


