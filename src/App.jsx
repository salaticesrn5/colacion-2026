import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Users, UserCheck, Shield, QrCode, Upload, Trash2, Plus, Search,
  CheckCircle2, XCircle, AlertTriangle, Lock, Unlock, Download,
  LogOut, Eye, EyeOff, Edit3, Save, X, RefreshCw, MessageCircle, Award,
  UserPlus, FileSpreadsheet, Check, ArrowRight, Building2, KeyRound, Power
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
const CUPO_BASE_DEFECTO = 4;

const getQrImageUrl = (code) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(code)}`;

// Logo institucional ESRN N° 005 (colocar archivo public/logo-esrn5.png) con respaldo automático
function LogoEscuela({ size = 'md' }) {
  const [imgError, setImgError] = useState(false);
  const dim = size === 'lg' ? 'w-16 h-16' : 'w-10 h-10';
  const iconDim = size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';

  if (imgError) {
    return (
      <div
        className={`${dim} flex items-center justify-center bg-[#800020]/30 border border-amber-300/40 rounded-xl shrink-0`}
      >
        <Award className={`${iconDim} text-amber-300`} />
      </div>
    );
  }

  return (
    <div
      className={`${dim} flex items-center justify-center bg-white/95 p-1 rounded-xl shadow-sm border border-amber-300/40 overflow-hidden shrink-0`}
    >
      <img
        src="/logo-esrn5.png"
        alt="Escudo ESRN N° 005"
        onError={() => setImgError(true)}
        className="w-full h-full object-contain"
      />
    </div>
  );
}

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
        if (data.activo === false) {
          await supabase.auth.signOut();
          setPerfilStaff(null);
          setSession(null);
          setVista('login');
          notify('Tu cuenta se encuentra desactivada. Contactá al Administrador.', 'error');
          return;
        }
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

  // Cálculo dinámico de aforo considerando solo Egresados y Docentes ACTIVOS
  const egresadosActivos = egresados.filter((e) => e.activo !== false);
  const docentesActivos = docentes.filter((d) => d.activo !== false);

  const totalEgresados = egresadosActivos.length;
  const totalDocentes = docentesActivos.length;
  const totalEspeciales = especiales.length;
  const totalCuposFamiliares = egresadosActivos.reduce(
    (acc, e) => acc + (Number(e.cupo_asignado) || 0),
    0
  );
  const totalOcupado =
    totalEgresados + totalDocentes + totalEspeciales + totalCuposFamiliares;
  const vacantesLibres = CAPACIDAD_MAXIMA - totalOcupado;

  return (
    <div className="min-h-screen bg-[#fdf8f9] text-slate-900 font-sans">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-medium transition-all ${
            toast.type === 'error'
              ? 'bg-rose-700'
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

      {/* HEADER INSTITUCIONAL EN COLOR BORDÓ */}
      <header className="bg-[#561122] text-white border-b border-[#3d0a16] sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <LogoEscuela size="md" />
            <div>
              <h1 className="font-bold text-base sm:text-lg leading-tight tracking-tight text-white">
                Colación 2026 — ESRN N° 005
              </h1>
              <p className="text-xs text-rose-200/90">
                Cipolletti · Aforo Máximo: {CAPACIDAD_MAXIMA} butacas · Tiempo Real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!session ? (
              <>
                <button
                  onClick={() => setVista('portal')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                    vista === 'portal'
                      ? 'bg-white text-[#561122] shadow-sm'
                      : 'bg-[#72182e] text-rose-100 hover:bg-[#881d38]'
                  }`}
                >
                  Portal Egresados
                </button>
                <button
                  onClick={() => setVista('login')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
                    vista === 'login'
                      ? 'bg-amber-400 text-[#3d0a16] shadow-sm'
                      : 'bg-[#72182e] text-rose-100 hover:bg-[#881d38]'
                  }`}
                >
                  Acceso Personal / Puerta
                </button>
              </>
            ) : (
              <>
                <span className="hidden sm:inline-flex items-center gap-1.5 bg-[#3d0a16]/90 border border-rose-300/30 text-rose-100 px-3 py-1 rounded-full text-xs font-medium">
                  <Shield className="w-3.5 h-3.5 text-amber-300" />
                  {perfilStaff?.nombre} ({perfilStaff?.rol?.toUpperCase()})
                </span>

                {(perfilStaff?.rol === 'admin' || perfilStaff?.rol === 'coordinador') && (
                  <button
                    onClick={() => setVista(vista === 'admin' ? 'puerta' : 'admin')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-[#3d0a16] transition shadow-sm"
                  >
                    {vista === 'admin' ? 'Vista Puerta' : 'Panel Gestión'}
                  </button>
                )}

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#8a1c37] hover:bg-[#a12241] border border-rose-300/20 text-white transition"
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
          <div className="flex justify-center items-center py-24 text-[#6B1D2F] gap-2">
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
// LOGIN PERSONAL (Con ícono de ojo para ver contraseña)
// ============================================================================
function LoginStaff({ onSuccess, notify }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
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
    <div className="max-w-md mx-auto mt-10 bg-white rounded-2xl shadow-sm border border-rose-200/80 p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-[#6B1D2F]/10 text-[#6B1D2F] p-3 rounded-xl">
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
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#6B1D2F] focus:border-[#6B1D2F] outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Contraseña
          </label>
          <div className="relative">
            <input
              type={verPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#6B1D2F] focus:border-[#6B1D2F] outline-none text-sm"
            />
            <button
              type="button"
              onClick={() => setVerPassword((v) => !v)}
              title={verPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-[#6B1D2F]"
            >
              {verPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-[#6B1D2F] hover:bg-[#561122] text-white font-semibold text-sm transition disabled:opacity-50 shadow-sm"
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
        if (actualizado.activo === false) {
          setEgresadoActivo(null);
          notify(
            'Tu registro figura como No Asiste / Inactivo. Si es un error, comunicate con Dirección.',
            'error'
          );
          return;
        }
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
    if (encontrado.activo === false) {
      notify(
        'Este DNI figura marcado como No Asiste / Inactivo. Consultá en Secretaría de la ESRN N° 005.',
        'error'
      );
      return;
    }
    setEgresadoActivo(encontrado);
    prepararFilasInvitados(encontrado);
  };

  const puedeEditar = () => {
    if (!egresadoActivo || egresadoActivo.activo === false) return false;
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

  // Pase QR descargable con identidad bordó institucional + logo de la escuela
  const descargarInvitacionPNG = (inv) => {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 440;
    const ctx = canvas.getContext('2d');

    // Fondo bordó institucional profundo
    ctx.fillStyle = '#4a0e1d';
    ctx.fillRect(0, 0, 720, 440);

    // Franja superior dorada
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 720, 14);

    // Franja inferior decorativa
    ctx.fillStyle = '#6B1D2F';
    ctx.fillRect(0, 340, 720, 100);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('ACTO DE COLACIÓN 2026 — ESRN N° 005', 32, 62);

    ctx.fillStyle = '#fecdd3';
    ctx.font = '15px sans-serif';
    ctx.fillText('CIPOLLETTI · PASE DE ACCESO NOMINAL · BUTACA SIN NUMERAR', 32, 88);

    ctx.fillStyle = '#fcd34d';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`N° ENTRADA: ${inv.numero_entrada}`, 32, 138);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(inv.nombre_completo.toUpperCase(), 32, 184);

    ctx.fillStyle = '#ffe4e6';
    ctx.font = '18px sans-serif';
    ctx.fillText(`DNI Invitado: ${inv.dni}`, 32, 218);

    ctx.fillStyle = '#fda4af';
    ctx.font = '15px sans-serif';
    ctx.fillText(`Egresado/a: ${egresadoActivo.nombre_completo}`, 32, 270);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText('Presentar este código QR junto con DNI físico en el ingreso al salón.', 32, 385);

    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(480, 118, 204, 204);
      ctx.drawImage(qrImg, 490, 128, 184, 184);

      // Intentar dibujar escudo institucional si está disponible
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(626, 26, 58, 58, 10);
        ctx.fill();
        ctx.drawImage(logoImg, 631, 31, 48, 48);
        finalizarDescarga();
      };
      logoImg.onerror = () => finalizarDescarga();
      logoImg.src = '/logo-esrn5.png';

      function finalizarDescarga() {
        const link = document.createElement('a');
        link.download = `Entrada_${inv.numero_entrada}_${inv.dni}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    };
    qrImg.src = getQrImageUrl(inv.numero_entrada);
  };

  if (!egresadoActivo) {
    return (
      <div className="max-w-lg mx-auto mt-8 bg-white rounded-2xl shadow-sm border border-rose-200/80 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <LogoEscuela size="lg" />
          <span className="mt-3 text-xs font-bold uppercase tracking-widest text-[#6B1D2F]">
            ESRN N° 005 · Cipolletti
          </span>
          <h2 className="text-2xl font-bold text-slate-900 mt-1">Portal de Egresados</h2>
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
              className="w-full text-center text-2xl font-bold tracking-widest px-4 py-3.5 rounded-xl border-2 border-slate-300 focus:border-[#6B1D2F] outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 rounded-xl bg-[#6B1D2F] hover:bg-[#561122] text-white font-bold text-base transition shadow-sm"
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

      <div className="bg-white rounded-2xl border border-rose-200/80 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#6B1D2F]">
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
        <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-[#4a0e1d] text-sm">
          <AlertTriangle className="w-5 h-5 text-[#6B1D2F] shrink-0 mt-0.5" />
          <div>
            <strong>Importante antes de guardar:</strong> revisá cuidadosamente el{' '}
            <strong>Nombre Completo</strong> y el <strong>DNI (8 dígitos sin puntos)</strong> de cada
            familiar para evitar demoras en el ingreso el día del acto.
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-rose-200/80 p-5 space-y-4">
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
                    <span className="ml-2 text-[#6B1D2F] bg-rose-100 px-2 py-0.5 rounded">
                      {fila.numero_entrada}
                    </span>
                  )}
                </span>
                {fila.guardado && fila.numero_entrada && (
                  <button
                    type="button"
                    onClick={() => descargarInvitacionPNG(fila)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6B1D2F] hover:bg-[#561122] text-white text-xs font-semibold transition"
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 text-sm outline-none focus:border-[#6B1D2F]"
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white disabled:bg-slate-100 text-sm outline-none focus:border-[#6B1D2F]"
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
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#6B1D2F] hover:bg-[#561122] text-white font-semibold text-sm transition"
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
        <div className="bg-white rounded-2xl border border-rose-200/80 p-5 space-y-4">
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
              className="px-4 py-2.5 rounded-xl bg-[#6B1D2F] hover:bg-[#561122] text-white font-semibold text-sm"
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
  const [filtroDoc, setFiltroDoc] = useState('');
  const fileDocRef = useRef(null);

  const [nuevoVipNombre, setNuevoVipNombre] = useState('');
  const [nuevoVipCargo, setNuevoVipCargo] = useState('');
  const [nuevoVipDni, setNuevoVipDni] = useState('');

  // Estados para Usuarios del Sistema (Alta, Edición con mail, Activar/Desactivar, Contraseña con ojito)
  const [usrNombre, setUsrNombre] = useState('');
  const [usrEmail, setUsrEmail] = useState('');
  const [usrPass, setUsrPass] = useState('');
  const [verUsrPass, setVerUsrPass] = useState(false);
  const [usrRol, setUsrRol] = useState('puerta');
  const [creandoUsr, setCreandoUsr] = useState(false);

  const [editandoUsrId, setEditandoUsrId] = useState(null);
  const [editUsrNombre, setEditUsrNombre] = useState('');
  const [editUsrEmail, setEditUsrEmail] = useState('');
  const [editUsrRol, setEditUsrRol] = useState('puerta');
  const [guardandoEdicionUsr, setGuardandoEdicionUsr] = useState(false);

  const [passModalUsr, setPassModalUsr] = useState(null);
  const [nuevaPassInput, setNuevaPassInput] = useState('');
  const [verNuevaPass, setVerNuevaPass] = useState(false);
  const [cambiandoPass, setCambiandoPass] = useState(false);

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
        if (egr.activo === false) continue;
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
        activo: true,
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

  // Desactivar / Activar Egresado (No Asiste -> libera su butaca + familiares)
  const toggleActivoEgresado = async (egr) => {
    const vaADesactivar = egr.activo !== false;
    const cuposLiberados = 1 + (Number(egr.cupo_asignado) || 0);

    if (vaADesactivar) {
      const ok = window.confirm(
        `¿Marcar a ${egr.nombre_completo} como NO ASISTE (Inactivo)?\n\nSe bloqueará su ingreso al portal y se liberarán ${cuposLiberados} butaca(s) (1 del egresado + ${egr.cupo_asignado} familiares) a las Vacantes Libres.`
      );
      if (!ok) return;
    }

    try {
      const { error } = await supabase
        .from('egresados')
        .update({
          activo: !vaADesactivar,
          cerrado: vaADesactivar ? true : false,
        })
        .eq('id', egr.id);

      if (error) throw error;
      await recargar();
      notify(
        vaADesactivar
          ? `${egr.nombre_completo} marcado como NO ASISTE. Se liberaron ${cuposLiberados} butaca(s).`
          : `${egr.nombre_completo} reactivado nuevamente.`
      );
    } catch (err) {
      notify('Error al cambiar estado del egresado: ' + err.message, 'error');
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
            activo: true,
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
    if (egr.activo === false) {
      notify('Activá primero al egresado para modificar su cupo.', 'warning');
      return;
    }
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
            activo: true,
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
        activo: true,
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

  // Desactivar / Activar Docente (No Asiste -> libera 1 butaca)
  const toggleActivoDocente = async (doc) => {
    const vaADesactivar = doc.activo !== false;
    try {
      const { error } = await supabase
        .from('docentes')
        .update({ activo: !vaADesactivar })
        .eq('id', doc.id);

      if (error) throw error;
      await recargar();
      notify(
        vaADesactivar
          ? `${doc.nombre_completo} marcado como NO ASISTE. Se liberó 1 butaca.`
          : `${doc.nombre_completo} reactivado nuevamente.`
      );
    } catch (err) {
      notify('Error al cambiar estado del docente: ' + err.message, 'error');
    }
  };

  const vaciarPadronDocentes = async () => {
    const confirmacion = window.prompt(
      'ATENCIÓN: Esta acción eliminará TODOS los docentes y no docentes cargados actualmente.\n\nEscribí VACIAR en mayúsculas para confirmar:'
    );
    if (confirmacion !== 'VACIAR') return;

    try {
      const { error } = await supabase
        .from('docentes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      await recargar();
      notify('Padrón de docentes vaciado correctamente.');
    } catch (err) {
      notify('Error al vaciar docentes: ' + err.message, 'error');
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
            activo: true,
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

  const vaciarPadronVIP = async () => {
    const confirmacion = window.prompt(
      'ATENCIÓN: Esta acción eliminará TODOS los Invitados Especiales / VIP cargados actualmente.\n\nEscribí VACIAR en mayúsculas para confirmar:'
    );
    if (confirmacion !== 'VACIAR') return;

    try {
      const { error } = await supabase
        .from('invitados_especiales')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      await recargar();
      notify('Listado de Invitados Especiales (VIP) vaciado correctamente.');
    } catch (err) {
      notify('Error al vaciar VIP: ' + err.message, 'error');
    }
  };

  // ==========================================================================
  // GESTIÓN COMPLETA DE USUARIOS DEL SISTEMA (Con mail visible/editable y ojito)
  // ==========================================================================
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

  const iniciarEdicionUsuario = (u) => {
    setEditandoUsrId(u.id);
    setEditUsrNombre(u.nombre || '');
    setEditUsrEmail(u.email || '');
    setEditUsrRol(u.rol || 'puerta');
  };

  const guardarEdicionUsuario = async (u) => {
    const nombreLimpio = editUsrNombre.trim();
    const emailNuevo = editUsrEmail.trim().toLowerCase();
    const emailAnterior = String(u.email || '').trim().toLowerCase();

    if (!nombreLimpio || !emailNuevo || !emailNuevo.includes('@')) {
      notify('Completá un nombre y un correo electrónico válido.', 'error');
      return;
    }

    setGuardandoEdicionUsr(true);
    try {
      // Si cambió el correo electrónico, actualizar primero en auth.users vía RPC segura
      if (emailNuevo !== emailAnterior) {
        const { error: rpcErr } = await supabase.rpc('admin_actualizar_email', {
          old_email: emailAnterior,
          new_email: emailNuevo,
        });
        if (rpcErr) throw rpcErr;
      }

      const { error } = await supabase
        .from('usuarios_sistema')
        .update({
          nombre: nombreLimpio,
          email: emailNuevo,
          rol: editUsrRol,
        })
        .eq('id', u.id);

      if (error) throw error;
      setEditandoUsrId(null);
      await recargar();
      notify(`Datos de ${nombreLimpio} (${emailNuevo}) actualizados.`);
    } catch (err) {
      notify('Error al actualizar usuario: ' + err.message, 'error');
    } finally {
      setGuardandoEdicionUsr(false);
    }
  };

  const toggleActivoUsuario = async (u) => {
    if (u.email === perfilStaff?.email) {
      notify('No podés desactivar tu propia cuenta de Administrador en uso.', 'warning');
      return;
    }
    const nuevoEstado = u.activo === false ? true : false;
    try {
      const { error } = await supabase
        .from('usuarios_sistema')
        .update({ activo: nuevoEstado })
        .eq('id', u.id);

      if (error) throw error;
      await recargar();
      notify(
        nuevoEstado
          ? `Usuario ${u.nombre} ACTIVADO.`
          : `Usuario ${u.nombre} DESACTIVADO (bloqueado para ingresar).`
      );
    } catch (err) {
      notify('Error al cambiar estado del usuario: ' + err.message, 'error');
    }
  };

  const handleCambiarPasswordUsuario = async (e) => {
    e.preventDefault();
    if (!passModalUsr) return;
    if (nuevaPassInput.length < 6) {
      notify('La nueva contraseña debe tener al menos 6 caracteres.', 'error');
      return;
    }
    setCambiandoPass(true);
    try {
      const { error } = await supabase.rpc('admin_cambiar_password', {
        target_email: passModalUsr.email,
        nueva_password: nuevaPassInput,
      });
      if (error) throw error;

      notify(`Contraseña actualizada correctamente para ${passModalUsr.nombre}.`);
      setPassModalUsr(null);
      setNuevaPassInput('');
      setVerNuevaPass(false);
    } catch (err) {
      notify('Error cambiando contraseña: ' + err.message, 'error');
    } finally {
      setCambiandoPass(false);
    }
  };

  const eliminarUsuarioSistema = async (id) => {
    if (!window.confirm('¿Eliminar definitivamente este acceso del sistema?')) return;
    await supabase.from('usuarios_sistema').delete().eq('id', id);
    await recargar();
    notify('Usuario eliminado.');
  };

  const egresadosFiltrados = egresados.filter(
    (e) =>
      e.nombre_completo.toLowerCase().includes(filtroEgr.toLowerCase()) ||
      e.dni.includes(filtroEgr)
  );

  const docentesFiltrados = docentes.filter(
    (d) =>
      d.nombre_completo.toLowerCase().includes(filtroDoc.toLowerCase()) ||
      d.dni.includes(filtroDoc)
  );

  const pendientesCount = solicitudes.filter((s) => s.estado === 'pendiente').length;
  const egresadosActivosList = egresados.filter((e) => e.activo !== false);
  const docentesActivosList = docentes.filter((d) => d.activo !== false);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-rose-200/80">
          <p className="text-xs text-slate-500 font-medium">Egresados Activos</p>
          <p className="text-2xl font-extrabold text-[#561122] mt-1">
            {totalEgresados}
            {egresados.length !== totalEgresados && (
              <span className="text-xs font-normal text-slate-400 ml-1">
                / {egresados.length}
              </span>
            )}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-rose-200/80">
          <p className="text-xs text-slate-500 font-medium">Docentes Activos</p>
          <p className="text-2xl font-extrabold text-[#561122] mt-1">
            {totalDocentes}
            {docentes.length !== totalDocentes && (
              <span className="text-xs font-normal text-slate-400 ml-1">
                / {docentes.length}
              </span>
            )}
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-rose-200/80">
          <p className="text-xs text-slate-500 font-medium">Especiales / VIP</p>
          <p className="text-2xl font-extrabold text-[#561122] mt-1">{totalEspeciales}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-rose-200/80">
          <p className="text-xs text-slate-500 font-medium">Cupos Familiares</p>
          <p className="text-2xl font-extrabold text-[#561122] mt-1">{totalCuposFamiliares}</p>
        </div>
        <div
          className={`col-span-2 sm:col-span-1 p-4 rounded-2xl border ${
            vacantesLibres < 0
              ? 'bg-rose-50 border-rose-300 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <p className="text-xs font-semibold">Vacantes Libres (de {CAPACIDAD_MAXIMA})</p>
          <p className="text-2xl font-extrabold mt-1">{vacantesLibres}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-rose-200/80 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#6B1D2F]">
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
                ? 'bg-[#6B1D2F] text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            1. Carga Abierta
          </button>
          <button
            onClick={() => cambiarEtapaGlobal('cierre_parcial')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              config.estado_etapa === 'cierre_parcial'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            2. Cierre Parcial (Reubicar Vacantes)
          </button>
          <button
            onClick={() => cambiarEtapaGlobal('cierre_definitivo')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              config.estado_etapa === 'cierre_definitivo'
                ? 'bg-rose-800 text-white shadow-sm'
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

      {/* PESTAÑAS CON IDENTIDAD BORDÓ */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTab('solicitudes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'solicitudes'
              ? 'bg-[#6B1D2F] text-white shadow-sm'
              : 'bg-white border border-rose-200 text-slate-700 hover:bg-rose-50'
          }`}
        >
          Solicitudes y Vacantes ({pendientesCount})
        </button>
        <button
          onClick={() => setTab('egresados')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'egresados'
              ? 'bg-[#6B1D2F] text-white shadow-sm'
              : 'bg-white border border-rose-200 text-slate-700 hover:bg-rose-50'
          }`}
        >
          Egresados ({totalEgresados}/{egresados.length})
        </button>
        <button
          onClick={() => setTab('docentes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'docentes'
              ? 'bg-[#6B1D2F] text-white shadow-sm'
              : 'bg-white border border-rose-200 text-slate-700 hover:bg-rose-50'
          }`}
        >
          Docentes ({totalDocentes}/{docentes.length}) y VIP ({especiales.length})
        </button>
        <button
          onClick={() => setTab('reportes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            tab === 'reportes'
              ? 'bg-[#6B1D2F] text-white shadow-sm'
              : 'bg-white border border-rose-200 text-slate-700 hover:bg-rose-50'
          }`}
        >
          Acreditación en Vivo
        </button>
        {esAdmin && (
          <button
            onClick={() => setTab('usuarios')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              tab === 'usuarios'
                ? 'bg-[#6B1D2F] text-white shadow-sm'
                : 'bg-white border border-rose-200 text-slate-700 hover:bg-rose-50'
            }`}
          >
            Usuarios del Sistema ({usuariosSistema.length})
          </button>
        )}
      </div>

      {tab === 'egresados' && (
        <div className="bg-white rounded-2xl border border-rose-200/80 p-5 space-y-5">
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6B1D2F] hover:bg-[#561122] text-white text-xs font-bold"
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#6B1D2F] border border-rose-200 text-xs font-bold transition"
              >
                <Upload className="w-4 h-4" />
                Importar CSV Egresados
              </button>

              {egresados.length > 0 && (
                <button
                  type="button"
                  onClick={vaciarPadronEgresados}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 text-xs font-bold transition"
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
                  <th className="py-3 px-2">Invitados / Cupo</th>
                  <th className="py-3 px-2">Reubicar Cupo</th>
                  <th className="py-3 px-2">Asistencia / Estado</th>
                  <th className="py-3 px-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {egresadosFiltrados.map((egr) => {
                  const cargados = invitados.filter((i) => i.egresado_id === egr.id).length;
                  const estaActivo = egr.activo !== false;

                  return (
                    <tr
                      key={egr.id}
                      className={`hover:bg-rose-50/40 ${!estaActivo ? 'bg-slate-50/80 opacity-65' : ''}`}
                    >
                      <td className="py-3 px-2 font-semibold text-slate-900">
                        <span className={!estaActivo ? 'line-through text-slate-500' : ''}>
                          {egr.nombre_completo}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-600">{egr.dni}</td>
                      <td className="py-3 px-2">
                        {estaActivo ? (
                          <>
                            <strong>{cargados}</strong> / {egr.cupo_asignado}
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                            Liberados ({1 + (Number(egr.cupo_asignado) || 0)} lugares)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="inline-flex items-center gap-1">
                          <button
                            disabled={!estaActivo}
                            onClick={() => ajustarCupoEgresado(egr, -1)}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 font-bold text-xs"
                          >
                            -1
                          </button>
                          <button
                            disabled={!estaActivo}
                            onClick={() => ajustarCupoEgresado(egr, 1)}
                            className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 disabled:opacity-40 text-emerald-800 font-bold text-xs"
                          >
                            +1
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        {!estaActivo ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                            No Asiste (Inactivo)
                          </span>
                        ) : (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              egr.cerrado
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {egr.cerrado ? 'Cerrado' : 'Habilitado'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleActivoEgresado(egr)}
                            title={
                              estaActivo
                                ? 'Desactivar (No asiste — libera cupo propio y familiar)'
                                : 'Reactivar egresado'
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                              estaActivo
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {estaActivo ? 'Desactivar' : 'Activar'}
                          </button>

                          <button
                            onClick={async () => {
                              if (!window.confirm(`¿Eliminar definitivamente a ${egr.nombre_completo}?`))
                                return;
                              await supabase.from('egresados').delete().eq('id', egr.id);
                              await recargar();
                            }}
                            title="Eliminar del padrón"
                            className="text-rose-600 hover:text-rose-800 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
        <div className="bg-white rounded-2xl border border-rose-200/80 p-5 space-y-4">
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
          <div className="bg-white rounded-2xl border border-rose-200/80 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900">
                Padrón de Docentes ({totalDocentes} activos / {docentes.length})
              </h3>
              <div className="flex flex-wrap items-center gap-2">
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#6B1D2F] border border-rose-200 text-xs font-bold"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Importar CSV Docentes
                </button>

                {docentes.length > 0 && (
                  <button
                    type="button"
                    onClick={vaciarPadronDocentes}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 text-xs font-bold transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Vaciar Padrón
                  </button>
                )}
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
                className="px-3.5 py-2 rounded-xl bg-[#6B1D2F] hover:bg-[#561122] text-white text-xs font-bold"
              >
                + Agregar
              </button>
            </form>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar docente por nombre o DNI..."
                value={filtroDoc}
                onChange={(e) => setFiltroDoc(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs"
              />
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-sm">
              {docentesFiltrados.map((d) => {
                const estaActivo = d.activo !== false;
                return (
                  <div
                    key={d.id}
                    className={`py-2.5 flex items-center justify-between gap-2 ${
                      !estaActivo ? 'opacity-60' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p
                          className={`font-semibold text-slate-900 ${
                            !estaActivo ? 'line-through text-slate-500' : ''
                          }`}
                        >
                          {d.nombre_completo}
                        </p>
                        {!estaActivo && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            No Asiste
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">DNI: {d.dni}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleActivoDocente(d)}
                        title={
                          estaActivo
                            ? 'Desactivar (No asiste — libera 1 butaca)'
                            : 'Reactivar docente'
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                          estaActivo
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        {estaActivo ? 'Desactivar' : 'Activar'}
                      </button>

                      <button
                        onClick={async () => {
                          await supabase.from('docentes').delete().eq('id', d.id);
                          await recargar();
                        }}
                        title="Eliminar docente"
                        className="text-rose-600 hover:text-rose-800 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-rose-200/80 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900">
                Invitados Especiales / Autoridades ({especiales.length})
              </h3>
              {especiales.length > 0 && (
                <button
                  type="button"
                  onClick={vaciarPadronVIP}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 text-xs font-bold transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Vaciar Padrón
                </button>
              )}
            </div>

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
                  className="px-4 py-2 rounded-xl bg-[#6B1D2F] hover:bg-[#561122] text-white text-xs font-bold"
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
                    className="text-rose-600 hover:text-rose-800 p-1"
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
        <div className="bg-white rounded-2xl border border-rose-200/80 p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-xs text-emerald-700 font-bold">Egresados Presentes</p>
              <p className="text-2xl font-extrabold text-emerald-900">
                {egresadosActivosList.filter((e) => e.asistio).length} / {egresadosActivosList.length}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-sky-50 border border-sky-200">
              <p className="text-xs text-sky-700 font-bold">Familiares Ingresados</p>
              <p className="text-2xl font-extrabold text-sky-900">
                {invitados.filter((i) => i.asistio).length} / {invitados.length}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
              <p className="text-xs text-[#6B1D2F] font-bold">Docentes Presentes</p>
              <p className="text-2xl font-extrabold text-[#4a0e1d]">
                {docentesActivosList.filter((d) => d.asistio).length} / {docentesActivosList.length}
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
              Listado de Ceremonial — Egresados Activos Acreditados ("Asistió")
            </h4>
            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-sm">
              {egresadosActivosList.map((e) => (
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
        <div className="bg-white rounded-2xl border border-rose-200/80 p-5 space-y-5">
          <div>
            <h3 className="font-bold text-slate-900">Gestión de Usuarios y Roles</h3>
            <p className="text-xs text-slate-500">
              Creá, editá (nombre, correo y rol), activá/desactivá o cambiá la contraseña de Administradores, Coordinadores y Personal de Puerta.
            </p>
          </div>

          <form
            onSubmit={crearUsuarioSistema}
            className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-rose-50/50 p-4 rounded-xl border border-rose-200/80"
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
            <div className="relative">
              <input
                type={verUsrPass ? 'text' : 'password'}
                required
                minLength={6}
                placeholder="Contraseña (mín. 6)"
                value={usrPass}
                onChange={(e) => setUsrPass(e.target.value)}
                className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-300 bg-white text-sm"
              />
              <button
                type="button"
                onClick={() => setVerUsrPass((v) => !v)}
                title={verUsrPass ? 'Ocultar contraseña' : 'Ver contraseña'}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-[#6B1D2F]"
              >
                {verUsrPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
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
              className="px-4 py-2 rounded-xl bg-[#6B1D2F] hover:bg-[#561122] text-white font-bold text-xs"
            >
              {creandoUsr ? 'Creando...' : '+ Crear Usuario'}
            </button>
          </form>

          {passModalUsr && (
            <form
              onSubmit={handleCambiarPasswordUsuario}
              className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="text-sm text-amber-950">
                Nueva contraseña para <strong>{passModalUsr.nombre}</strong> ({passModalUsr.email}):
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <input
                    type={verNuevaPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    value={nuevaPassInput}
                    onChange={(e) => setNuevaPassInput(e.target.value)}
                    className="pl-3 pr-9 py-2 rounded-xl border border-amber-400 bg-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setVerNuevaPass((v) => !v)}
                    title={verNuevaPass ? 'Ocultar contraseña' : 'Ver contraseña'}
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-[#6B1D2F]"
                  >
                    {verNuevaPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={cambiandoPass}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  {cambiandoPass ? 'Guardando...' : 'Guardar Clave'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPassModalUsr(null);
                    setNuevaPassInput('');
                    setVerNuevaPass(false);
                  }}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-100 text-sm">
            {usuariosSistema.map((u) => {
              const estaEditando = editandoUsrId === u.id;
              const estaActivo = u.activo !== false;

              return (
                <div
                  key={u.id}
                  className={`py-3.5 flex flex-wrap items-center justify-between gap-3 ${
                    !estaActivo ? 'opacity-60' : ''
                  }`}
                >
                  {estaEditando ? (
                    <div className="flex flex-wrap items-center gap-2 flex-1">
                      <input
                        type="text"
                        placeholder="Nombre y Apellido"
                        value={editUsrNombre}
                        onChange={(e) => setEditUsrNombre(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium"
                      />
                      <input
                        type="email"
                        placeholder="Correo electrónico"
                        value={editUsrEmail}
                        onChange={(e) => setEditUsrEmail(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm min-w-[220px]"
                      />
                      <select
                        value={editUsrRol}
                        onChange={(e) => setEditUsrRol(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white"
                      >
                        <option value="puerta">Control de Acceso (Puerta)</option>
                        <option value="coordinador">Coordinador</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <button
                        type="button"
                        disabled={guardandoEdicionUsr}
                        onClick={() => guardarEdicionUsuario(u)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#6B1D2F] hover:bg-[#561122] text-white text-xs font-bold"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {guardandoEdicionUsr ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoUsrId(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{u.nombre}</p>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                            estaActivo
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {estaActivo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {u.email} · Rol: <strong className="uppercase">{u.rol}</strong>
                      </p>
                    </div>
                  )}

                  {!estaEditando && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => iniciarEdicionUsuario(u)}
                        title="Modificar nombre, correo o rol"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPassModalUsr(u);
                          setNuevaPassInput('');
                          setVerNuevaPass(false);
                        }}
                        title="Cambiar contraseña"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Clave
                      </button>

                      {u.email !== perfilStaff?.email && (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleActivoUsuario(u)}
                            title={estaActivo ? 'Desactivar usuario' : 'Activar usuario'}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                              estaActivo
                                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {estaActivo ? 'Desactivar' : 'Activar'}
                          </button>

                          <button
                            type="button"
                            onClick={() => eliminarUsuarioSistema(u.id)}
                            title="Eliminar usuario"
                            className="text-rose-600 hover:text-rose-800 p-1.5"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
    if (egr && egr.activo === false) {
      notify(
        `¡PASE ANULADO! El egresado/a ${egr.nombre_completo} figura como NO ASISTE.`,
        'error'
      );
      return;
    }

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
        if (egr.activo === false) return false;
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
        (d) =>
          d.activo !== false &&
          (d.nombre_completo.toLowerCase().includes(termino) || d.dni.includes(termino))
      )
    : [];

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-[#561122] text-white rounded-2xl p-5 space-y-4 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Control de Acceso en Puerta</h2>
            <p className="text-xs text-rose-200">
              Escaneá el pase QR o buscá por Nombre, DNI o N° de Entrada
            </p>
          </div>
          {!escanerActivo ? (
            <button
              onClick={iniciarEscaner}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#3d0a16] font-bold text-sm"
            >
              <QrCode className="w-5 h-5" />
              Escanear QR
            </button>
          ) : (
            <button
              onClick={detenerEscaner}
              className="px-4 py-2.5 rounded-xl bg-rose-700 text-white font-bold text-xs"
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
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#3d0a16] border border-rose-300/30 text-sm text-white placeholder-rose-200/60 outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
          >
            Validar Pase
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-rose-200/80 p-4 space-y-4">
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
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-[#6B1D2F]"
          />
        </div>

        {egresadoSeleccionado ? (
          <div className="space-y-3">
            <button
              onClick={() => setEgresadoSeleccionado(null)}
              className="text-xs font-bold text-[#6B1D2F] hover:underline"
            >
              ← Volver a resultados
            </button>

            <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-[#6B1D2F]">
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
                  className="w-full text-left p-3.5 rounded-xl border border-slate-200 hover:border-[#6B1D2F] hover:bg-rose-50/40 transition flex items-center justify-between"
                >
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{egr.nombre_completo}</p>
                    <p className="text-xs text-slate-500">DNI Egresado: {egr.dni}</p>
                    {invCoincidente && (
                      <p className="text-xs text-[#6B1D2F] font-medium mt-0.5">
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
                  <span className="text-[10px] font-bold uppercase text-[#6B1D2F]">Docente</span>
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
