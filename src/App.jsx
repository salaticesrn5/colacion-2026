import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Users, UserCheck, Shield, QrCode, Upload, Trash2, Plus, Search,
  CheckCircle2, XCircle, AlertTriangle, Lock, Unlock, Download,
  LogOut, Eye, EyeOff, Edit3, Save, X, RefreshCw, MessageCircle, Award,
  UserPlus, FileSpreadsheet, Check, ArrowRight, Building2, Phone, Edit2, Star, Key, Camera, CameraOff, Printer, FileText, RotateCcw, Grid, LayoutDashboard, History
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';

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
const MSG_FALTA_COL_BUTACA = 'Falta crear la columna "ocupa_butaca" en la tabla docentes (Supabase). Ejecutá el SQL que te pasaron y volvé a intentar.';
const esErrorColumnaButaca = (err) => /ocupa_butaca/i.test(err?.message || '') || err?.code === 'PGRST204' || err?.code === '42703';
const aNumeroONulo = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const cupoBaseDe = (cfg) => { const b = aNumeroONulo(cfg?.cupo_base); return b === null ? CUPO_BASE_DEFECTO : b; };
const cupoDe = (egr, cfg) => { const a = aNumeroONulo(egr?.cupo_asignado); return a === null ? cupoBaseDe(cfg) : a; };

const parseCSV = (text) => {
  const limpio = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!limpio) return [];
  const primera = limpio.split(/\r?\n/)[0];
  const cuenta = (c) => primera.split(c).length - 1;
  const sep = cuenta(';') >= cuenta(',') && cuenta(';') >= cuenta('\t') && cuenta(';') > 0 ? ';' : cuenta('\t') > cuenta(',') ? '\t' : ',';
  const filas = [];
  let fila = [];
  let celda = '';
  let enComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (enComillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') { celda += '"'; i++; } else { enComillas = false; }
      } else {
        celda += ch;
      }
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === sep) {
      fila.push(celda.trim());
      celda = '';
    } else if (ch === '\n') {
      fila.push(celda.trim());
      filas.push(fila);
      fila = [];
      celda = '';
    } else if (ch !== '\r') {
      celda += ch;
    }
  }
  fila.push(celda.trim());
  filas.push(fila);
  return filas.filter((f) => f.some((c) => c !== ''));
};

const esDniTexto = (v) => /^\d{7,8}$/.test(String(v || '').replace(/[.\s]/g, ''));
const tieneLetras = (v) => /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(String(v || ''));

// Detecta solo la columna del DNI y las del nombre (aunque vengan Apellido y Nombre separados o en otro orden)
const analizarCSVPersonas = (texto, { dniObligatorio = true, detectarButaca = false } = {}) => {
  const res = { items: [], descartadas: 0, duplicadasEnArchivo: 0, unaPalabra: 0, sinButaca: 0, columnas: '', error: '' };
  const filas = parseCSV(texto);
  if (filas.length === 0) { res.error = 'El archivo está vacío.'; return res; }
  const pareceEncabezado = (f) => f.some((c) => /^(dni|documento|nombre|apellido|docente|agente|instituci|cargo|n[°º]|nro|num)/i.test(c)) || (dniObligatorio && !f.some(esDniTexto));
  let datos = filas;
  let encabezado = null;
  if (filas.length > 1 && pareceEncabezado(filas[0])) { encabezado = filas[0]; datos = filas.slice(1); }
  const nCols = Math.max(...datos.map((f) => f.length));
  let dniCol = -1;
  let mejor = 0;
  for (let c = 0; c < nCols; c++) {
    const n = datos.filter((f) => esDniTexto(f[c])).length;
    if (n > mejor) { mejor = n; dniCol = c; }
  }
  if (dniCol !== -1 && mejor < Math.max(1, Math.round(datos.length * 0.3))) dniCol = -1;
  if (dniCol === -1 && dniObligatorio) {
    res.error = 'No encontré una columna con DNI de 7 u 8 dígitos. Revisá el archivo (¿trae CUIL de 11 dígitos?).';
    return res;
  }
  // Columna opcional "Butaca" / "Ocupa butaca" / "Sin butaca" (solo docentes; requiere fila de encabezado)
  const butacaCol = detectarButaca && encabezado ? encabezado.findIndex((h) => /butaca/i.test(h)) : -1;
  const butacaInvertida = butacaCol !== -1 && /sin/i.test(encabezado[butacaCol]); // encabezado "Sin butaca": SI = no ocupa
  const esSi = (v) => /^(s|si|sí|x|1|true|verdadero)$/i.test(String(v || '').trim());
  const esNo = (v) => /^(n|no|0|false|falso|sin)$/i.test(String(v || '').trim());
  let colsNombre = [];
  if (encabezado) {
    colsNombre = encabezado.map((h, i) => ({ h, i })).filter(({ h, i }) => i !== dniCol && i !== butacaCol && /(apellido|nombre|docente|agente|persona|invitad|instituci)/i.test(h)).map(({ i }) => i);
  }
  if (colsNombre.length === 0) {
    const conLetras = [];
    for (let c = 0; c < nCols; c++) {
      if (c === dniCol || c === butacaCol) continue;
      const n = datos.filter((f) => tieneLetras(f[c])).length;
      if (n >= datos.length * 0.5) conLetras.push(c);
    }
    colsNombre = conLetras.slice(0, 2);
  }
  if (colsNombre.length === 0) { res.error = 'No encontré una columna con el nombre.'; return res; }
  const vistos = new Set();
  datos.forEach((f) => {
    const dni = dniCol === -1 ? '' : String(f[dniCol] || '').replace(/\D/g, '').slice(0, 8);
    const nombre = colsNombre.map((c) => f[c] || '').filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (nombre.length < 3 || (dniObligatorio && !esDniTexto(f[dniCol]))) { res.descartadas++; return; }
    if (dni) {
      if (vistos.has(dni)) { res.duplicadasEnArchivo++; return; }
      vistos.add(dni);
    }
    if (nombre.split(' ').length < 2) res.unaPalabra++;
    const sinButaca = butacaCol !== -1 && (butacaInvertida ? esSi(f[butacaCol]) : esNo(f[butacaCol]));
    if (sinButaca) res.sinButaca++;
    res.items.push({ dni, nombre, sinButaca });
  });
  res.columnas = `DNI: columna ${dniCol === -1 ? '(sin DNI)' : dniCol + 1} · Nombre: columna${colsNombre.length > 1 ? 's' : ''} ${colsNombre.map((c) => c + 1).join(' y ')}${butacaCol !== -1 ? ` · Butaca: columna ${butacaCol + 1} ("${encabezado[butacaCol]}")` : ''}${encabezado ? ' · primera fila ignorada (encabezado)' : ''}`;
  return res;
};

const descargarCSV = (nombreArchivo, filas) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const contenido = filas.map((f) => f.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};


// ¿El egresado tiene una solicitud de butacas extra aprobada (total o parcial)?
const tieneExtraAprobada = (egr, solicitudes) => (solicitudes || []).some((s) => s.egresado_id === egr.id && String(s.estado || '').toLowerCase() === 'aprobada');

// ¿Puede el egresado cargar o modificar invitados en la etapa actual?
const puedeEditarInvitados = (egr, { config, solicitudes }) => {
  const etapa = config?.estado_etapa || 'abierta';
  if (etapa === 'abierta') return true;
  if (etapa === 'cierre_parcial') return tieneExtraAprobada(egr, solicitudes);
  return false;
};

// Butacas familiares que ocupa un egresado activo según la etapa
const plazasFamiliaresDe = (egr, { config, invitados, solicitudes }) => {
  const cupo = cupoDe(egr, config);
  if (puedeEditarInvitados(egr, { config, solicitudes })) return cupo;
  const cargados = (invitados || []).filter((i) => i.egresado_id === egr.id).length;
  return Math.min(cupo, cargados);
};

export default function App() {
  const [vista, setVista] = useState('portal'); // 'portal', 'login', 'puerta', 'admin', 'reporte_papel'
  const [session, setSession] = useState(null);
  const [perfilStaff, setPerfilStaff] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const yaUbicadoRef = useRef(false);

  const [config, setConfig] = useState({ id: null, estado_etapa: 'abierta', cupo_base: CUPO_BASE_DEFECTO, filas: 15, butacas_por_fila: 35 });
  const whatsappActivo = config.whatsapp_activo !== false;
  const vipPortalActivo = config.portal_vip_activo !== false;
  const [egresados, setEgresados] = useState([]);
  const [invitados, setInvitados] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [especiales, setEspeciales] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [usuariosSistema, setUsuariosSistema] = useState([]);
  const [logsSistema, setLogsSistema] = useState([]);

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

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const puedeAdministrar = perfilStaff?.rol === 'admin' || perfilStaff?.rol === 'coordinador';
  // Los usuarios con rol "puerta" solo pueden usar el módulo de Puerta
  useEffect(() => {
    if (session && perfilStaff && !puedeAdministrar && (vista === 'admin' || vista === 'reporte_papel' || vista === 'login')) {
      setVista('puerta');
    }
  }, [session, perfilStaff, vista]);

  // Al cambiar de pantalla (portal / puerta) se trae una carga fresca, sin refresco automático permanente
  useEffect(() => {
    if (vista === 'puerta' || vista === 'portal') cargarDatosGlobales();
  }, [vista]);

  const registrarLog = async (accion, modulo, detalle) => {
    try {
      const { error } = await supabase.from('logs_sistema').insert({
        usuario: perfilStaff?.nombre || session?.user?.email || 'Sistema',
        accion,
        modulo,
        detalle
      });
      if (error) {
        console.error('Error registrando log:', error);
        notify('No se pudo guardar el registro de actividad: ' + error.message, 'error');
        return;
      }
      cargarDatosGlobales();
    } catch (e) {
      console.error('Error registrando log:', e);
    }
  };

  const cargarPerfilStaff = async (user) => {
    try {
      const { data, error } = await supabase
        .from('usuarios_sistema')
        .select('*')
        .eq('email', (user.email || '').toLowerCase())
        .maybeSingle();
      if (error) throw error;
      if (data && data.activo !== false) {
        // el rol se normaliza a minúsculas para que 'ADMIN' y 'admin' valgan igual
        const rol = String(data.rol || '').trim().toLowerCase();
        setPerfilStaff({ ...data, rol });
        // Un celular de Puerta que vuelve a abrir la página con la sesión iniciada va directo a Puerta
        if (rol !== 'admin' && rol !== 'coordinador' && !yaUbicadoRef.current) setVista((v) => (v === 'portal' ? 'puerta' : v));
        yaUbicadoRef.current = true;
      } else {
        // sin fila en usuarios_sistema, o desactivado: no hay acceso
        setPerfilStaff(null);
        notify(data ? 'Tu usuario está desactivado. Consultá con el administrador.' : 'Tu usuario no tiene permisos en este sistema.', 'error');
        await supabase.auth.signOut();
        setVista('portal');
      }
    } catch (err) {
      console.error(err);
      setPerfilStaff(null);
      notify('No se pudo verificar tu perfil. Probá ingresar de nuevo.', 'error');
      await supabase.auth.signOut();
      setVista('portal');
    } finally {
      setLoadingAuth(false);
    }
  };

  const cargarDatosGlobales = async () => {
    try {
      // Sin sesión (portal público) solo se trae la configuración: los padrones no viajan al navegador
      const { data: { session: sesionActual } } = await supabase.auth.getSession();
      if (!sesionActual) {
        const { data: cfg } = await supabase.from('configuracion').select('*').limit(1).maybeSingle();
        if (cfg) setConfig({ ...cfg, filas: cfg.filas || 15, butacas_por_fila: cfg.butacas_por_fila || 35 });
        setEgresados([]); setInvitados([]); setDocentes([]); setEspeciales([]); setSolicitudes([]); setUsuariosSistema([]); setLogsSistema([]);
        return;
      }
      const [resCfg, resEgr, resInv, resDoc, resEsp, resSol, resUsr, resLog] = await Promise.all([
        supabase.from('configuracion').select('*').limit(1).maybeSingle(),
        supabase.from('egresados').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('invitados').select('*').order('numero_entrada', { ascending: true }),
        supabase.from('docentes').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('invitados_especiales').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('solicitudes_butacas').select('*').order('created_at', { ascending: false }),
        supabase.from('usuarios_sistema').select('*').order('created_at', { ascending: true }),
        supabase.from('logs_sistema').select('*').order('created_at', { ascending: false }).limit(200),
      ]);

      if (resCfg.data) {
        setConfig({
          ...resCfg.data,
          filas: resCfg.data.filas || 15,
          butacas_por_fila: resCfg.data.butacas_por_fila || 35
        });
      }
      if (resEgr.data) setEgresados(resEgr.data);
      if (resInv.data) setInvitados(resInv.data);
      if (resDoc.data) setDocentes(resDoc.data);
      if (resEsp.data) setEspeciales(resEsp.data);
      if (resSol.data) setSolicitudes(resSol.data);
      if (resUsr.data) setUsuariosSistema(resUsr.data);
      if (resLog.data) setLogsSistema(resLog.data);
    } catch (e) {
      console.error('Error cargando datos:', e);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setPerfilStaff(null);
    setVista('portal');
    cargarDatosGlobales(); // sin sesión solo queda la configuración en memoria
  };

  const reiniciarAsistenciasGeneral = async () => {
    if (!window.confirm("¿Estás seguro de reiniciar todas las asistencias a 0?")) return;
    try {
      const verif = (r) => { if (r && r.error) throw r.error; };
      const reiniciar = async (tabla) => {
        const todos = (q) => q.neq('id', '00000000-0000-0000-0000-000000000000');
        let r = await todos(supabase.from(tabla).update({ asistio: false, hora_ingreso_real: null }));
        if (r.error && esErrorColumna(r.error, 'hora_ingreso_real')) r = await todos(supabase.from(tabla).update({ asistio: false }));
        verif(r);
      };
      await reiniciar('egresados');
      verif(await supabase.from('invitados').update({ asistio: false, hora_ingreso: null }).neq('id', '00000000-0000-0000-0000-000000000000'));
      await reiniciar('docentes');
      await reiniciar('invitados_especiales');
      await registrarLog('REINICIO_ASISTENCIAS', 'Puerta', 'Se reiniciaron todas las asistencias a cero.');
      await cargarDatosGlobales();
      notify('Todas las asistencias han sido reiniciadas a cero.');
    } catch (err) {
      notify('Error al reiniciar asistencias: ' + err.message, 'error');
    }
  };

  const borrarInvitadosEgresados = async () => {
    const resp = window.prompt("Para confirmar el borrado de todos los invitados, escribí BORRAR en mayúsculas:");
    if (resp !== 'BORRAR') return;
    try {
      const { error } = await supabase.from('invitados').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      await registrarLog('BORRADO_INVITADOS', 'Administración', 'Se borraron todos los invitados egresados.');
      await cargarDatosGlobales();
      notify('Invitados egresados borrados correctamente.');
    } catch (err) {
      notify('Error al borrar invitados: ' + err.message, 'error');
    }
  };

  // Quien figura como "No asiste" (activo = false) libera su plaza y la de sus invitados
  const egresadosActivos = egresados.filter((e) => e.activo !== false);
  const totalEgresados = egresadosActivos.length;
  const docentesActivos = docentes.filter((d) => d.activo !== false);
  const totalDocentes = docentesActivos.length; // todos los que asisten
  const totalDocentesConButaca = docentesActivos.filter((d) => d.ocupa_butaca !== false).length; // los que usan butaca
  const totalDocentesSinButaca = totalDocentes - totalDocentesConButaca;
  const totalEspeciales = especiales.filter((v) => v.activo !== false).length;
  // Plazas familiares: en etapa Abierta cuenta el cupo completo de cada egresado.
  // Desde el Cierre Parcial, a quien NO tiene plazas extra aprobadas solo se le cuentan los invitados cargados
  // (el resto del cupo queda libre para reasignar). En el Cierre Definitivo, a todos se les cuentan los cargados.
  const totalCuposFamiliares = egresadosActivos.reduce((acc, e) => acc + plazasFamiliaresDe(e, { config, invitados, solicitudes }), 0);
  const totalOcupado = totalEgresados + totalDocentesConButaca + totalEspeciales + totalCuposFamiliares;
  const CAPACIDAD = capacidadDe(config);
  const vacantesLibres = CAPACIDAD - totalOcupado;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans relative pb-24 overflow-x-hidden">
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-medium transition-all ${
          toast.type === 'error' ? 'bg-rose-600' : toast.type === 'warning' ? 'bg-amber-600' : 'bg-emerald-600'
        }`}>
          {toast.type === 'error' ? <XCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Encabezado Institucional ESRN N° 005 */}
      <header className="bg-[#6B1D2F] text-white shadow-md sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2.5 cursor-pointer min-w-0" onClick={() => setVista('portal')}>
            {config.escudo ? (
              <img src={config.escudo} alt="Escudo" className="w-9 h-9 bg-white rounded-full object-contain p-0.5 shadow shrink-0" />
            ) : (
              <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center font-bold text-[#6B1D2F] text-sm shadow shrink-0">05</div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-sm sm:text-lg leading-tight truncate">ESRN N° 005 — Cipolletti</h1>
              {session && perfilStaff ? (
                <p className="text-[11px] sm:text-xs text-rose-100 truncate" title={perfilStaff.email}>
                  👤 {perfilStaff.nombre || perfilStaff.email}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded font-bold uppercase text-[9px] sm:text-[10px] ${perfilStaff.rol === 'admin' ? 'bg-amber-400 text-amber-950' : perfilStaff.rol === 'coordinador' ? 'bg-sky-200 text-sky-900' : 'bg-emerald-200 text-emerald-900'}`}>{perfilStaff.rol === 'admin' ? 'Administrador' : perfilStaff.rol === 'coordinador' ? 'Coordinador' : 'Puerta'}</span>
                </p>
              ) : (
                <p className="text-[11px] sm:text-xs text-rose-200 truncate">Acto de Colación 2026</p>
              )}
            </div>
          </div>

          <nav className="flex flex-wrap items-center justify-end gap-1.5 max-w-full">
            <button
              onClick={() => setVista('portal')}
              className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                vista === 'portal' ? 'bg-white text-[#6B1D2F] font-bold' : 'text-rose-200 hover:text-white'
              }`}
            >
              Portal
            </button>

            {session && (
              <>
                <button
                  onClick={() => setVista('puerta')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                    vista === 'puerta' ? 'bg-white text-[#6B1D2F] font-bold' : 'text-rose-200 hover:text-white'
                  }`}
                >
                  Puerta
                </button>
                {puedeAdministrar && (
                  <button
                    onClick={() => setVista('admin')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold shadow transition ${
                      vista === 'admin' || vista === 'reporte_papel' ? 'bg-white text-[#6B1D2F]' : 'bg-amber-500 hover:bg-amber-600 text-white'
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
                className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                  vista === 'login' ? 'bg-amber-500 text-white font-bold' : 'text-rose-200 hover:text-white'
                }`}
              >
                Acceso Personal
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white transition"
                title="Cerrar Sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                Salir
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-5 sm:py-6">
        {(loadingAuth || (session && !perfilStaff)) ? (
          <div className="flex justify-center items-center py-24 text-slate-500 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Cargando sistema...</span>
          </div>
        ) : vista === 'login' && !session ? (
          <LoginStaff onSuccess={() => { cargarDatosGlobales(); setVista('admin'); }} notify={notify} />
        ) : vista === 'puerta' && session ? (
          <ModuloPuerta config={config} egresados={egresados} invitados={invitados} docentes={docentes} especiales={especiales} recargar={cargarDatosGlobales} notify={notify} perfilStaff={perfilStaff} />
        ) : vista === 'admin' && session && puedeAdministrar ? (
          <PanelAdministracion
            vipPortalActivo={vipPortalActivo}
            whatsappActivo={whatsappActivo}
            perfilStaff={perfilStaff} config={config} egresados={egresados} invitados={invitados}
            docentes={docentes} especiales={especiales} solicitudes={solicitudes} usuariosSistema={usuariosSistema} logsSistema={logsSistema}
            totalEgresados={totalEgresados} totalDocentes={totalDocentes} totalDocentesConButaca={totalDocentesConButaca} totalDocentesSinButaca={totalDocentesSinButaca} totalEspeciales={totalEspeciales}
            totalCuposFamiliares={totalCuposFamiliares} totalOcupado={totalOcupado} vacantesLibres={vacantesLibres} recargar={cargarDatosGlobales} notify={notify}
            abrirResumenPapel={() => setVista('reporte_papel')}
            reiniciarAsistenciasGeneral={reiniciarAsistenciasGeneral}
            borrarInvitadosEgresados={borrarInvitadosEgresados} registrarLog={registrarLog}
          />
        ) : vista === 'reporte_papel' && session && puedeAdministrar ? (
          <ReporteResumenPapel egresados={egresados} invitados={invitados} docentes={docentes} especiales={especiales} config={config} volver={() => setVista('admin')} />
        ) : (
          <PortalPrincipalDNI vipPortalActivo={vipPortalActivo} whatsappActivo={whatsappActivo} config={config} notify={notify} />
        )}
      </main>

      {whatsappActivo && (
      <a
        href="https://wa.me/5492996326617?text=Hola,%20necesito%20ayuda%20con%20el%20sistema%20de%20acceso%20de%20la%20Colación%20ESRN%20N°%20005."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 bg-green-600 hover:bg-green-700 text-white p-3.5 rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-110 cursor-pointer print:hidden"
        title="¿Necesitas ayuda? Escribinos por WhatsApp"
      >
        <Phone className="w-6 h-6" />
      </a>
      )}
    </div>
  );
}

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
      const m = String(err?.message || '');
      notify(/invalid login credentials/i.test(m) ? 'Email o contraseña incorrectos.'
        : /email not confirmed/i.test(m) ? 'El email todavía no está confirmado. Consultá con el administrador.'
        : /failed to fetch|network/i.test(m) ? 'No hay conexión. Revisá tu internet y volvé a intentar.'
        : (m || 'No se pudo iniciar sesión.'), 'error');
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

// Portal público: todo pasa por funciones de la base (RPC). El navegador NO descarga los padrones:
// solo recibe los datos de la persona cuyo DNI se ingresó.
const mensajeErrorRPC = (err) => {
  const m = String(err?.message || err || 'error desconocido');
  if (/could not find the function|PGRST202|404/i.test(m)) return 'El portal no está disponible en este momento (falta configurar la base). Avisale a la escuela.';
  if (/failed to fetch|network/i.test(m)) return 'No hay conexión. Revisá tu internet y volvé a intentar.';
  return m;
};

function PortalPrincipalDNI({ vipPortalActivo, whatsappActivo, config, notify }) {
  const [dni, setDni] = useState('');
  const [tipoUsuario, setTipoUsuario] = useState('egresado');
  useEffect(() => {
    // si se desactiva el acceso VIP mientras alguien lo tiene seleccionado, vuelve a Egresado
    if (!vipPortalActivo && tipoUsuario === 'vip') { setTipoUsuario('egresado'); setDatosPersona(null); setError(''); }
  }, [vipPortalActivo, tipoUsuario]);
  const [datosPersona, setDatosPersona] = useState(null);
  const [misInvitadosGuardados, setMisInvitadosGuardados] = useState([]);
  const [misSolicitudes, setMisSolicitudes] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [celular, setCelular] = useState('');
  const [filasInvitados, setFilasInvitados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [cantExtra, setCantExtra] = useState(1);
  const [obsExtra, setObsExtra] = useState('');
  const [enviandoSol, setEnviandoSol] = useState(false);
  const [avisoSolicitud, setAvisoSolicitud] = useState(false);
  const qrRef = useRef(null);

  const prepararFilasInvitados = (egr, misInv, sols) => {
    // Fuera de la etapa de carga solo se muestran los invitados ya cargados (los cupos sin usar quedan liberados)
    const habilitado = puedeEditarInvitados(egr, { config, solicitudes: sols });
    const cupo = habilitado ? Math.max(cupoDe(egr, config), misInv.length) : misInv.length;
    const arr = [];
    for (let idx = 0; idx < cupo; idx++) {
      if (misInv[idx]) {
        arr.push({ 
          id: misInv[idx].id, 
          nombre_completo: misInv[idx].nombre_completo || '', 
          dni: misInv[idx].dni || '', 
          numero_entrada: misInv[idx].numero_entrada || '', 
          es_grupal: esGrupal(misInv[idx]), 
          movilidad_reducida: tieneMovilidad(misInv[idx]),
          guardado: true 
        });
      } else {
        arr.push({ id: null, nombre_completo: '', dni: '', numero_entrada: '', es_grupal: false, movilidad_reducida: false, guardado: false });
      }
    }
    setFilasInvitados(arr);
    setEditando(misInv.length === 0 && habilitado);
  };

  // Carga en pantalla lo que devuelve la base para un egresado (persona + invitados + solicitudes)
  const aplicarDatosEgresado = (data) => {
    const persona = data.persona;
    const invs = Array.isArray(data.invitados) ? data.invitados : [];
    const sols = Array.isArray(data.solicitudes) ? data.solicitudes : [];
    setDatosPersona(persona);
    setMisInvitadosGuardados(invs);
    setMisSolicitudes(sols);
    if (persona?.celular) setCelular(persona.celular);
    prepararFilasInvitados(persona, invs, sols);
  };

  // Si en Administración cambian la etapa mientras el egresado está en pantalla, se reacomodan los cupos
  useEffect(() => {
    if (datosPersona && tipoUsuario === 'egresado') prepararFilasInvitados(datosPersona, misInvitadosGuardados, misSolicitudes);
  }, [config.estado_etapa]);

  const buscarPorDNI = async (e) => {
    e.preventDefault();
    setError('');
    setDatosPersona(null);

    const limpio = sanitizeDNI(dni);
    if (limpio.length < 7) {
      setError('Ingresá un DNI válido de 7 u 8 dígitos.');
      return;
    }
    if (tipoUsuario === 'vip' && !vipPortalActivo) {
      setError('El acceso de invitados VIP por este portal no está habilitado.');
      return;
    }

    setBuscando(true);
    try {
      const { data, error: errRpc } = await supabase.rpc('portal_consultar', { p_tipo: tipoUsuario, p_dni: limpio });
      if (errRpc) throw errRpc;
      if (!data || !data.encontrado) {
        setError(data?.motivo === 'vip_desactivado'
          ? 'El acceso de invitados VIP por este portal no está habilitado.'
          : `No se encontró ningún registro con ese DNI en ${tipoUsuario.toUpperCase()}.`);
        return;
      }
      if (data.persona?.activo === false) {
        setError('Figurás como que no asistirás al acto. Si cambiaste de opinión, comunicate con la escuela.');
        return;
      }
      if (tipoUsuario === 'egresado') aplicarDatosEgresado(data);
      else setDatosPersona(data.persona);
    } catch (err) {
      setError(mensajeErrorRPC(err));
    } finally {
      setBuscando(false);
    }
  };

  const obtenerNombreReal = (obj) => {
    if (!obj) return '';
    return obj.nombre_completo || obj.nombre || obj.docente || obj.apellido_y_nombre || obj.profesor || obj.name || '';
  };

  const guardarInvitados = async () => {
    if (!puedeEditarInvitados(datosPersona, { config, solicitudes: misSolicitudes })) {
      notify('La carga de invitados está cerrada. Si necesitás un cambio, comunicate con la escuela.', 'error');
      return;
    }
    if (whatsappActivo && (!celular || celular.trim().length < 6)) {
      notify('El número de celular/WhatsApp es obligatorio para continuar.', 'error');
      return;
    }

    // Validación previa (la base vuelve a controlar todo): nombre Y DNI juntos, sin DNI repetidos
    const dnisVistos = new Set();
    for (let i = 0; i < filasInvitados.length; i++) {
      const nombre = (filasInvitados[i].nombre_completo || '').trim();
      const dniFila = sanitizeDNI(filasInvitados[i].dni || '');
      if ((nombre && !dniFila) || (!nombre && dniFila)) {
        notify(`Invitado #${i + 1}: completá el nombre y el DNI (o dejá los dos vacíos).`, 'error');
        return;
      }
      if (dniFila) {
        if (dnisVistos.has(dniFila)) {
          notify(`Invitado #${i + 1}: el DNI ${dniFila} está repetido en el formulario.`, 'error');
          return;
        }
        dnisVistos.add(dniFila);
      }
    }

    setGuardando(true);
    try {
      // Se manda todo junto: la base guarda todo o nada
      const payload = filasInvitados
        .filter((f) => f.id || (f.nombre_completo || '').trim() || (f.dni || '').trim())
        .map((f) => ({ id: f.id || null, nombre_completo: (f.nombre_completo || '').trim(), dni: sanitizeDNI(f.dni || ''), es_grupal: f.es_grupal === true, movilidad_reducida: f.movilidad_reducida === true }));
      const { data, error: errRpc } = await supabase.rpc('portal_guardar_invitados', { p_dni: sanitizeDNI(datosPersona.dni || dni), p_celular: celular, p_invitados: payload });
      if (errRpc) throw errRpc;
      aplicarDatosEgresado(data);
      setEditando(false);
      notify('Invitados y datos guardados correctamente.');
    } catch (err) {
      console.error(err);
      notify(`No se pudieron guardar los invitados. ${mensajeErrorRPC(err)}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  // Paso 1: al apretar "Solicitar" se muestra el aviso (las plazas no están garantizadas)
  const pedirSolicitudExtra = (e) => {
    e.preventDefault();
    if (misSolicitudes.length > 0) {
      notify('Ya enviaste una solicitud de butacas extra. Solo se puede pedir una vez.', 'error');
      return;
    }
    const cel = (celular || datosPersona?.celular || '').trim();
    if (whatsappActivo && cel.length < 6) {
      notify('Antes de pedir butacas extra, cargá tu celular / WhatsApp y guardá los datos: por ahí te avisamos si se aprueba.', 'error');
      return;
    }
    setAvisoSolicitud(true);
  };

  // Paso 2: confirmado el aviso, se envía (la base controla que sea una sola por egresado)
  const enviarSolicitudExtra = async () => {
    setAvisoSolicitud(false);
    setEnviandoSol(true);
    try {
      const { data, error: errRpc } = await supabase.rpc('portal_solicitar_extra', {
        p_dni: sanitizeDNI(datosPersona.dni || dni),
        p_cantidad: Number(cantExtra),
        p_observacion: obsExtra.trim(),
        p_celular: (celular || datosPersona.celular || '').trim(),
      });
      if (errRpc) throw errRpc;
      setObsExtra('');
      aplicarDatosEgresado(data);
      notify('Solicitud de butacas extra enviada.');
    } catch (err) {
      notify('Error: ' + mensajeErrorRPC(err), 'error');
    } finally {
      setEnviandoSol(false);
    }
  };

  const marcarNoAsistire = async () => {
    const aviso = tipoUsuario === 'egresado'
      ? '¿Estás seguro de que no asistirás?\n\nSe liberará tu butaca y también las de tus invitados: tus pases y los de tu grupo dejarán de servir para ingresar.'
      : '¿Estás seguro de que no asistirás? Esto liberará tu plaza.';
    if (!window.confirm(aviso)) return;
    const { error: errRpc } = await supabase.rpc('portal_no_asistire', { p_tipo: tipoUsuario, p_dni: sanitizeDNI(datosPersona.dni || dni) });
    if (errRpc) { notify('No se pudo registrar: ' + mensajeErrorRPC(errRpc), 'error'); return; }
    notify('Has marcado que no asistirás. ¡Gracias!');
    setDatosPersona(null);
    setDni('');
  };

  const nombreMostrado = obtenerNombreReal(datosPersona);
  const personaPase = datosPersona ? { ...datosPersona, dni: datosPersona.dni || dni, nombre_completo: nombreMostrado } : null;
  const valorQRPrincipal = !personaPase ? '' : tipoUsuario === 'egresado' ? valorQREgresado(personaPase) : tipoUsuario === 'docente' ? valorQRDocente(personaPase) : valorQRVip(personaPase);
  const textoRolTarjeta = tipoUsuario === 'egresado' ? 'EGRESADO' : tipoUsuario === 'docente' ? 'DOCENTE' : 'INVITADO VIP';
  const miSolicitud = tipoUsuario === 'egresado' && datosPersona ? (misSolicitudes[0] || null) : null;
  const etapaCarga = config.estado_etapa || 'abierta';
  const cargaHabilitada = tipoUsuario === 'egresado' && datosPersona ? puedeEditarInvitados(datosPersona, { config, solicitudes: misSolicitudes }) : false;
  const miGrupo = misInvitadosGuardados.filter(esGrupal);
  const hayGuardados = misInvitadosGuardados.length > 0;
  const descargarMiPase = () => {
    if (!personaPase) return;
    if (tipoUsuario === 'egresado') paseEgresado(personaPase, config);
    else if (tipoUsuario === 'docente') paseDocente(personaPase, config);
    else paseVip(personaPase, config);
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="bg-gradient-to-r from-[#6B1D2F] to-[#8a253c] text-white rounded-xl shadow-md p-5 text-center">
        {config.escudo && <img src={config.escudo} alt="Escudo institucional" className="w-20 h-20 mx-auto mb-2 bg-white rounded-full object-contain p-1.5 shadow" />}
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
          {vipPortalActivo && (
            <button type="button" onClick={() => { setTipoUsuario('vip'); setDatosPersona(null); setError(''); }} className={`flex-1 py-2 rounded-md font-medium text-xs transition ${tipoUsuario === 'vip' ? 'bg-amber-600 text-white shadow' : 'text-gray-600'}`}>⭐ VIP</button>
          )}
        </div>

        {!datosPersona ? (
          <form onSubmit={buscarPorDNI} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DNI de {tipoUsuario.toUpperCase()}</label>
              <input type="text" maxLength={8} value={dni} onChange={(e) => setDni(sanitizeDNI(e.target.value))} placeholder="Ej: 40123456" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#6B1D2F]" required />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={buscando} className="w-full py-2.5 bg-[#6B1D2F] text-white rounded-lg hover:bg-opacity-90 font-medium shadow disabled:opacity-60">
              {buscando ? 'Buscando...' : 'Continuar'}
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

              {tipoUsuario === 'egresado' && textoCurso(datosPersona) && (
                <p className="text-xs font-semibold text-slate-600">{textoCurso(datosPersona)}</p>
              )}
              <button type="button" onClick={descargarMiPase} className={`w-full py-2.5 hover:bg-opacity-90 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow cursor-pointer ${tipoUsuario === 'vip' ? 'bg-amber-700' : tipoUsuario === 'docente' ? 'bg-slate-700' : 'bg-[#6B1D2F]'}`}>
                <Download className="w-4 h-4" /> {tipoUsuario === 'egresado' ? 'Descargar QR de Egresado' : tipoUsuario === 'docente' ? 'Descargar QR de Docente' : 'Descargar QR VIP'}
              </button>
              <p className="text-[11px] font-bold text-slate-600">📍 {tipoUsuario === 'egresado' ? ACCESO_TEXTO.egresados : ACCESO_TEXTO.abajo}</p>
              {tipoUsuario === 'egresado' && (
                <p className="text-[11px] text-slate-500 text-center">Este QR es <b>solo para vos</b>. Tus invitados marcados <b>en grupo</b> entran juntos con el <b>QR del Grupo Familiar</b>, y los <b>individuales</b> con su propio QR.</p>
              )}
            </div>

            {tipoUsuario === 'egresado' && miGrupo.length > 0 && (
              <div className="p-4 rounded-lg border-2 text-center space-y-2" style={{ borderColor: colorFamiliaDe(datosPersona) }}>
                <p className="font-bold text-sm" style={{ color: colorFamiliaDe(datosPersona) }}>👨‍👩‍👧 Pase del Grupo Familiar ({miGrupo.length} persona{miGrupo.length === 1 ? '' : 's'})</p>
                <ul className="text-xs text-slate-700 space-y-0.5">
                  {miGrupo.map((g) => <li key={g.id}>{g.nombre_completo}{tieneMovilidad(g) ? ' ♿' : ''}</li>)}
                </ul>
                <button type="button" onClick={() => paseGrupo(datosPersona, miGrupo, config)} className="w-full py-2.5 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow cursor-pointer" style={{ backgroundColor: colorFamiliaDe(datosPersona) }}>
                  <Download className="w-4 h-4" /> Descargar QR del Grupo Familiar
                </button>
                <p className="text-[11px] font-bold text-slate-600">📍 {accesoFamiliaDe(datosPersona)}</p>
                <p className="text-[11px] text-slate-500">Un solo QR para todo el grupo: con escanearlo una vez ingresan todos los que figuran en la lista.</p>
              </div>
            )}

            <div className="hidden" ref={qrRef}>
              <QRCodeSVG value={valorQRPrincipal} size={300} level="H" includeMargin={true} />
            </div>

            {tipoUsuario === 'egresado' && (
              <>
                <div className="border-2 border-emerald-500 bg-emerald-50 p-4 rounded-xl space-y-2">
                  <label className="block text-xs font-bold text-emerald-900 uppercase">📱 Tu Celular{whatsappActivo ? ' / WhatsApp' : ''} {whatsappActivo ? <span className="text-rose-600">* Obligatorio</span> : <span className="text-slate-500">(opcional)</span>}</label>
                  <input 
                    type="text" 
                    maxLength={15}
                    placeholder="Ej: 2994444444" 
                    value={celular} 
                    onChange={(e) => setCelular(sanitizeDNI(e.target.value))} 
                    disabled={!editando}
                    required
                    className={`w-full px-3 py-2 border-2 border-emerald-500 rounded-lg text-sm font-semibold text-emerald-900 outline-none ${!editando ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white'}`} 
                  />
                </div>

                <div className="border-2 border-[#6B1D2F] bg-rose-50/40 p-4 rounded-xl space-y-3">
                  {cargaHabilitada ? (
                    <div className="bg-amber-100 border border-amber-300 p-3 rounded-lg">
                      <p className="text-xs font-bold text-amber-900">⚠️ Atención: Revise bien sus datos</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">Verifique nombre y DNI antes de guardar. Una vez guardado, asegúrese de revisar la exactitud de la información.</p>
                    </div>
                  ) : (
                    <div className="bg-slate-100 border border-slate-300 p-3 rounded-lg">
                      <p className="text-xs font-bold text-slate-800">🔒 La carga de invitados está cerrada</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">Podés descargar los pases de los invitados que ya cargaste. Si necesitás un cambio, comunicate con la escuela.</p>
                    </div>
                  )}

                  <h4 className="font-bold text-sm text-[#6B1D2F]">{cargaHabilitada ? `Carga de Invitados (${filasInvitados.length} cupos)` : `Tus invitados (${filasInvitados.length})`}</h4>
                  {filasInvitados.length === 0 && <p className="text-xs text-slate-500">No cargaste invitados.</p>}
                  {filasInvitados.map((fila, idx) => (
                    <div key={idx} className="p-3 bg-white border rounded-lg space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-[#6B1D2F]">Invitado #{idx + 1}</span>
                        {fila.guardado && fila.numero_entrada && !editando && (() => {
                          const guardadoInv = misInvitadosGuardados.find((i) => i.id === fila.id);
                          if (!guardadoInv) return null;
                          return esGrupal(guardadoInv) ? (
                            <span className="text-[11px] font-bold text-slate-500 text-right">Entra con el QR del grupo</span>
                          ) : (
                            <button 
                              type="button" 
                              onClick={() => paseInvitado(guardadoInv, datosPersona, config)} 
                              className="text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                              style={{ backgroundColor: colorFamiliaDe(datosPersona) }}
                            >
                              <Download className="w-3.5 h-3.5" /> QR individual
                            </button>
                          );
                        })()}
                      </div>

                      <input 
                        type="text" 
                        placeholder="Nombre y Apellido" 
                        value={fila.nombre_completo} 
                        onChange={(e) => { const arr = [...filasInvitados]; arr[idx].nombre_completo = e.target.value; setFilasInvitados(arr); }} 
                        disabled={!editando}
                        className={`w-full px-2.5 py-1.5 border rounded text-xs ${!editando ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white'}`} 
                      />

                      <input 
                        type="text" 
                        maxLength={8} 
                        placeholder="DNI (Solo números)" 
                        value={fila.dni} 
                        onChange={(e) => { const arr = [...filasInvitados]; arr[idx].dni = sanitizeDNI(e.target.value); setFilasInvitados(arr); }} 
                        disabled={!editando}
                        className={`w-full px-2.5 py-1.5 border rounded text-xs font-mono ${!editando ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white'}`} 
                      />

                      <div className="flex items-center gap-2 pt-1">
                        <input 
                          type="checkbox" 
                          id={`grupal-${idx}`}
                          checked={fila.es_grupal}
                          disabled={!editando}
                          onChange={(e) => { const arr = [...filasInvitados]; arr[idx].es_grupal = e.target.checked; setFilasInvitados(arr); }}
                          className="w-4 h-4 text-[#6B1D2F] rounded border-gray-300 focus:ring-[#6B1D2F] cursor-pointer"
                        />
                        <label htmlFor={`grupal-${idx}`} className="text-[11px] font-semibold text-slate-700 cursor-pointer">
                          Ingresa en grupo (con el QR del grupo familiar)
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id={`movilidad-${idx}`}
                          checked={fila.movilidad_reducida === true}
                          disabled={!editando}
                          onChange={(e) => { const arr = [...filasInvitados]; arr[idx].movilidad_reducida = e.target.checked; setFilasInvitados(arr); }}
                          className="w-4 h-4 text-[#6B1D2F] rounded border-gray-300 focus:ring-[#6B1D2F] cursor-pointer"
                        />
                        <label htmlFor={`movilidad-${idx}`} className="text-[11px] font-semibold text-slate-700 cursor-pointer">
                          ♿ Tiene movilidad reducida
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                {cargaHabilitada && (editando ? (
                  <div className="flex gap-2">
                    {hayGuardados && (
                      <button type="button" onClick={() => prepararFilasInvitados(datosPersona, misInvitadosGuardados, misSolicitudes)} disabled={guardando} className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold cursor-pointer">Cancelar</button>
                    )}
                    <button onClick={guardarInvitados} disabled={guardando} className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-lg text-sm font-bold hover:bg-opacity-95 shadow cursor-pointer">
                      {guardando ? 'Guardando...' : 'Guardar y Generar QR'}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setEditando(true)} className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold shadow cursor-pointer">
                    ✏️ Editar invitados
                  </button>
                ))}

                <div className="bg-gray-50 border rounded-xl p-4 space-y-3">
                  <h4 className="font-bold text-xs text-gray-800 uppercase">Solicitar Butacas Extra</h4>
                  {miSolicitud ? (() => {
                    const est = String(miSolicitud.estado || '').toLowerCase();
                    const aprob = Number(miSolicitud.cantidad_aprobada ?? miSolicitud.cantidad_solicitada) || 0;
                    return (
                      <div className={`text-xs p-3 border rounded-lg space-y-1 ${est === 'aprobada' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : est === 'rechazada' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                        <p className="font-bold">
                          {est === 'aprobada'
                            ? `✓ Solicitud aprobada: +${aprob} butaca(s)${aprob < Number(miSolicitud.cantidad_solicitada) ? ` (pediste ${miSolicitud.cantidad_solicitada})` : ''}`
                            : est === 'rechazada'
                              ? '✕ Solicitud no aprobada'
                              : `⏳ Solicitud enviada: +${miSolicitud.cantidad_solicitada} butaca(s), pendiente de revisión`}
                        </p>
                        {est === 'aprobada' && cargaHabilitada && <p>Ya podés cargar a tus invitados adicionales arriba (apretá "Editar invitados").</p>}
                        {est !== 'aprobada' && <p className="opacity-80">Solo se puede enviar una solicitud por egresado.</p>}
                      </div>
                    );
                  })() : etapaCarga === 'cierre_definitivo' ? (
                    <p className="text-xs text-slate-500">La carga está cerrada: ya no se reciben solicitudes.</p>
                  ) : (
                    <>
                      <form onSubmit={pedirSolicitudExtra} className="flex flex-col sm:flex-row gap-2">
                        <select value={cantExtra} onChange={(e) => setCantExtra(e.target.value)} className="px-2 py-2 border rounded-xl text-xs bg-white">
                          <option value={1}>+1</option><option value={2}>+2</option><option value={3}>+3</option>
                        </select>
                        <input type="text" placeholder="Observación (ej: abuelos)" value={obsExtra} onChange={(e) => setObsExtra(e.target.value)} className="w-full sm:flex-1 px-3 py-2 border rounded-xl text-xs bg-white outline-none" />
                        <button type="submit" disabled={enviandoSol} className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow shrink-0 cursor-pointer">{enviandoSol ? 'Enviando...' : 'Solicitar'}</button>
                      </form>
                      <p className="text-[11px] text-slate-500">Se puede enviar <b>una sola solicitud</b> por egresado.</p>
                    </>
                  )}
                </div>

                {avisoSolicitud && (
                  <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-4 border-t-4 border-indigo-600">
                      <h3 className="font-extrabold text-base text-slate-900">Antes de enviar tu solicitud</h3>
                      <p className="text-sm text-slate-700">Estás pidiendo <b>+{cantExtra} butaca(s)</b>{obsExtra.trim() ? <> ({obsExtra.trim()})</> : null}.</p>
                      <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1.5">
                        <li><b>Las plazas adicionales no están garantizadas</b>: dependen de la disponibilidad de la sala.</li>
                        <li>La escuela puede aprobarla completa, en parte o no aprobarla.</li>
                        <li>{whatsappActivo ? <>En caso de aprobarse, vas a recibir una <b>notificación por WhatsApp</b> para volver a ingresar y cargar a tus invitados.</> : <>En caso de aprobarse, la escuela te va a avisar para que vuelvas a ingresar y cargues a tus invitados.</>}</li>
                        <li>Se puede enviar <b>una sola solicitud</b>.</li>
                      </ul>
                      <div className="flex gap-2 pt-2 border-t">
                        <button type="button" onClick={() => setAvisoSolicitud(false)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold cursor-pointer">Cancelar</button>
                        <button type="button" onClick={enviarSolicitudExtra} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow cursor-pointer">Entendido, enviar</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="pt-2 border-t">
              <button type="button" onClick={marcarNoAsistire} className="w-full py-2.5 bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer">
                <XCircle className="w-4 h-4" /> No podré asistir / Liberar cupo
              </button>
            </div>

            <button type="button" onClick={() => { setDatosPersona(null); setDni(''); }} className="w-full py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm cursor-pointer">
              Consultar otro DNI
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const normalizarTexto = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const coincideTexto = (campos, consulta) => {
  const q = normalizarTexto(consulta);
  if (!q) return false;
  const digitos = String(consulta).replace(/\D/g, '');
  return campos.some((c) => {
    const valor = String(c || '');
    return normalizarTexto(valor).includes(q) || (digitos.length >= 3 && valor.replace(/\D/g, '').includes(digitos));
  });
};

// Las tildes dentro del QR hacen que algunos lectores no lo puedan leer; la Puerta identifica por DNI, no por nombre
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// QR del valor indicado (sin depender de un QR oculto en pantalla)
const svgQRComoTexto = (valor) =>
  renderToStaticMarkup(<QRCodeSVG value={valor} size={300} level="H" includeMargin={true} />).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');

// ============================================================================
// PASES: colores por rol y orientación, accesos a la sala y tarjeta 1080x1920
// ============================================================================
const COLOR_PASE = {
  egresado: '#6B1D2F', // bordó institucional
  cn: '#15803D',       // familiares de Ciencias Naturales (TM)
  edu: '#1D4ED8',      // familiares de Educación (TT)
  familia: '#475569',  // familiares sin orientación cargada
  docente: '#374151',  // gris oscuro
  vip: '#A16207',      // dorado
};

// Por dónde entra cada uno (para cambiar un texto, se cambia solo acá)
const ACCESO_TEXTO = {
  egresados: 'INGRESO POR DETRÁS DE LA ÚLTIMA FILA',
  arriba: 'INGRESO POR EL ACCESO DE ARRIBA',
  abajo: 'INGRESO POR EL ACCESO DE ABAJO',
  aConfirmar: 'ACCESO A CONFIRMAR CON LA ESCUELA',
};

const ORIENTACIONES = [
  { valor: 'CIENCIAS NATURALES', etiqueta: 'Ciencias Naturales (TM)' },
  { valor: 'EDUCACION', etiqueta: 'Educación (TT)' },
];

const tipoOrientacion = (egr) => {
  const o = String(egr?.orientacion || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (o.includes('natural')) return 'cn';
  if (o.includes('educ')) return 'edu';
  return null;
};
const etiquetaOrientacion = (egr) => ({ cn: 'Cs. Naturales', edu: 'Educación' }[tipoOrientacion(egr)] || '');
const accesoFamiliaDe = (egr) => ({ cn: ACCESO_TEXTO.abajo, edu: ACCESO_TEXTO.arriba }[tipoOrientacion(egr)] || ACCESO_TEXTO.aConfirmar);
const colorFamiliaDe = (egr) => COLOR_PASE[tipoOrientacion(egr)] || COLOR_PASE.familia;
const textoCurso = (egr) => [egr?.division, etiquetaOrientacion(egr)].filter(Boolean).join(' · ');
const esGrupal = (inv) => inv?.es_grupal === true;
const tieneMovilidad = (p) => p?.movilidad_reducida === true;

// Texto que va dentro de cada QR (sin tildes: algunos lectores fallan con ellas)
const valorQREgresado = (egr) => `ESRN005-EGRESADO-${egr.dni}-${sinTildes(egr.nombre_completo)}`;
const valorQRGrupo = (egr) => `ESRN005-GRUPO-${egr.dni}-${sinTildes(egr.nombre_completo)}`;
const valorQRDocente = (doc) => `ESRN005-DOCENTE-${doc.dni}-${sinTildes(doc.nombre_completo)}`;
const valorQRVip = (vip) => `ESRN005-VIP-${vip.dni || ''}-${sinTildes(vip.nombre_completo)}`;

const cargarImagen = (src) => new Promise((resolve) => {
  if (!src) { resolve(null); return; }
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

// Achica la letra hasta que el texto entre en el ancho indicado
const ajustarFuente = (ctx, texto, peso, tamMax, anchoMax, tamMin = 18) => {
  let t = tamMax;
  ctx.font = `${peso} ${t}px sans-serif`;
  while (t > tamMin && ctx.measureText(texto).width > anchoMax) {
    t -= 2;
    ctx.font = `${peso} ${t}px sans-serif`;
  }
  return t;
};

const rectRedondeado = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
};

const descargarPase = async ({ nombre, subtitulo, rol, valor, color = COLOR_PASE.egresado, acceso, ubicacion = '', integrantes = [], movilidad = false, escudo, archivo }) => {
  if (!valor) {
    alert('No se pudo generar la imagen del QR.');
    return;
  }
  try {
    const svgData = svgQRComoTexto(valor);
    const blobURL = window.URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }));
    const [qrImage, escudoImg] = await Promise.all([cargarImagen(blobURL), cargarImagen(escudo)]);
    window.URL.revokeObjectURL(blobURL);
    if (!qrImage) throw new Error('No se pudo dibujar el QR');

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';

    // Fondo y franja superior del color del pase
    ctx.fillStyle = '#F3F4F6';
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1080, 400);

    let yTitulo = 160;
    if (escudoImg) {
      const caja = 150;
      const escala = Math.min(caja / escudoImg.width, caja / escudoImg.height);
      const w = escudoImg.width * escala;
      const h = escudoImg.height * escala;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(540, 115, 92, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(escudoImg, 540 - w / 2, 115 - h / 2, w, h);
      yTitulo = 270;
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText('ESRN N° 005 — CIPOLLETTI', 540, yTitulo);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '26px sans-serif';
    ctx.fillText('Acto de Colación 2026 — Pase Oficial de Ingreso', 540, yTitulo + 55);

    // Tarjeta blanca
    ctx.fillStyle = '#FFFFFF';
    rectRedondeado(ctx, 90, 440, 900, 1400, 30);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#E5E7EB';
    ctx.stroke();

    // Nombre, subtítulo y rol
    ctx.fillStyle = '#111827';
    ajustarFuente(ctx, String(nombre || '').toUpperCase(), 'bold', 46, 820, 24);
    ctx.fillText(String(nombre || '').toUpperCase(), 540, 535);
    if (subtitulo) {
      ctx.fillStyle = '#4B5563';
      ajustarFuente(ctx, subtitulo, 'normal', 30, 820, 20);
      ctx.fillText(subtitulo, 540, 588);
    }
    ctx.font = 'bold 30px sans-serif';
    const anchoRol = ctx.measureText(rol).width + 70;
    ctx.fillStyle = color;
    rectRedondeado(ctx, 540 - anchoRol / 2, 620, anchoRol, 58, 29);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(rol, 540, 660);

    // QR (siempre negro sobre blanco: así lo leen todos los celulares)
    const tamQR = integrantes.length > 6 ? 420 : 460;
    ctx.drawImage(qrImage, 540 - tamQR / 2, 700, tamQR, tamQR);
    let y = 700 + tamQR + 20;

    if (movilidad) {
      ctx.fillStyle = '#FEF3C7';
      rectRedondeado(ctx, 230, y, 620, 60, 30);
      ctx.fill();
      ctx.fillStyle = '#92400E';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('♿ MOVILIDAD REDUCIDA', 540, y + 41);
      y += 80;
    }

    if (acceso) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = color;
      rectRedondeado(ctx, 130, y, 820, 84, 18);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      rectRedondeado(ctx, 130, y, 820, 84, 18);
      ctx.stroke();
      ctx.fillStyle = color;
      ajustarFuente(ctx, acceso, 'bold', 32, 780, 20);
      ctx.fillText(acceso, 540, y + 54);
      y += 110;
    }

    if (ubicacion) {
      const textoUbic = `UBICACIÓN: ${ubicacion}`;
      ctx.fillStyle = '#111827';
      ajustarFuente(ctx, textoUbic, 'bold', 28, 820, 18);
      ctx.fillText(textoUbic, 540, y + 6);
      y += 50;
    }

    if (integrantes.length > 0) {
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(`INTEGRANTES DEL GRUPO (${integrantes.length})`, 540, y + 10);
      y += 30;
      const limite = 1760;
      let alto = 42;
      let tam = 30;
      if (y + integrantes.length * alto > limite) { alto = 34; tam = 25; }
      const entran = Math.max(1, Math.floor((limite - y) / alto));
      const mostrar = integrantes.length > entran ? integrantes.slice(0, entran - 1) : integrantes;
      ctx.fillStyle = '#374151';
      mostrar.forEach((p) => {
        y += alto;
        const linea = `• ${String(p.nombre_completo || '').toUpperCase()}${tieneMovilidad(p) ? '  ♿' : ''}`;
        ajustarFuente(ctx, linea, 'normal', tam, 800, 18);
        ctx.fillText(linea, 540, y);
      });
      if (mostrar.length < integrantes.length) {
        y += alto;
        ctx.font = `italic ${tam}px sans-serif`;
        ctx.fillText(`y ${integrantes.length - mostrar.length} más`, 540, y);
      }
    } else {
      ctx.fillStyle = '#374151';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('Pase Autorizado para Ingreso', 540, Math.max(y + 40, 1500));
    }

    ctx.fillStyle = '#6B7280';
    ctx.font = '24px sans-serif';
    ctx.fillText('Presentar en puerta (digital o impreso)', 540, 1805);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '24px sans-serif';
    ctx.fillText('ESRN N° 005 — Cipolletti · Colación 2026', 540, 1885);

    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `Pase-${String(archivo || nombre || 'QR').replace(/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error(err);
    alert('No se pudo generar el pase: ' + (err.message || err));
  }
};

// Atajos para cada tipo de pase (los usan el portal y Administración). Reciben la configuración (escudo y sectores).
const paseEgresado = (egr, config) => descargarPase({
  nombre: egr.nombre_completo,
  subtitulo: [`DNI: ${egr.dni}`, textoCurso(egr)].filter(Boolean).join(' · '),
  rol: 'EGRESADO/A', valor: valorQREgresado(egr), color: COLOR_PASE.egresado,
  acceso: ACCESO_TEXTO.egresados, ubicacion: ubicacionPara({ tipo: 'egresado' }, config),
  escudo: config?.escudo, archivo: `Egresado-${egr.nombre_completo}`,
});
const paseGrupo = (egr, integrantes, config) => descargarPase({
  nombre: egr.nombre_completo,
  subtitulo: [`Grupo familiar · ${integrantes.length} persona(s)`, textoCurso(egr)].filter(Boolean).join(' · '),
  rol: 'GRUPO FAMILIAR', valor: valorQRGrupo(egr), color: colorFamiliaDe(egr),
  acceso: accesoFamiliaDe(egr), ubicacion: ubicacionPara({ tipo: 'invitado', egr }, config),
  integrantes, escudo: config?.escudo, archivo: `Grupo-Familiar-${egr.nombre_completo}`,
});
const paseInvitado = (inv, egr, config) => descargarPase({
  nombre: inv.nombre_completo,
  subtitulo: `Invitado/a de ${egr?.nombre_completo || 'egresado/a'}`,
  rol: 'INVITADO INDIVIDUAL', valor: inv.numero_entrada, color: colorFamiliaDe(egr),
  acceso: accesoFamiliaDe(egr), ubicacion: ubicacionPara({ tipo: 'invitado', egr, movilidad: tieneMovilidad(inv) }, config),
  movilidad: tieneMovilidad(inv), escudo: config?.escudo, archivo: `Invitado-${inv.nombre_completo}`,
});
const paseDocente = (doc, config) => descargarPase({
  nombre: doc.nombre_completo, subtitulo: `DNI: ${doc.dni}`,
  rol: 'DOCENTE', valor: valorQRDocente(doc), color: COLOR_PASE.docente,
  acceso: ACCESO_TEXTO.abajo, ubicacion: doc.ocupa_butaca === false ? '' : ubicacionPara({ tipo: 'docente' }, config),
  escudo: config?.escudo, archivo: `Docente-${doc.nombre_completo}`,
});
const paseVip = (vip, config) => descargarPase({
  nombre: vip.nombre_completo, subtitulo: vip.dni ? `DNI: ${vip.dni}` : 'Autoridad / Invitado especial',
  rol: 'INVITADO VIP', valor: valorQRVip(vip), color: COLOR_PASE.vip,
  acceso: ACCESO_TEXTO.abajo, ubicacion: ubicacionPara({ tipo: 'vip', movilidad: tieneMovilidad(vip) }, config),
  movilidad: tieneMovilidad(vip), escudo: config?.escudo, archivo: `VIP-${vip.nombre_completo}`,
});

// ============================================================================
// SALA: croquis del Teatro CCC, capacidad y sectores asignables por grupo
// ============================================================================
// Butacas numeradas de mayor (izquierda) a 1 (derecha), mirando al escenario.
// Cada fila tiene tramos [desde, hasta] de butacas que existen.
const FILAS_TEATRO = [
  { fila: 'F1', bloque: 'delantero', tramos: [[16, 25], [1, 9]], cortesia: true },
  ...['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'].map((f) => ({ fila: f, bloque: 'delantero', tramos: [[1, 25]] })),
  { fila: 'F10', bloque: 'delantero', tramos: [[16, 25], [1, 10]] }, // área técnica: 11 a 15
  { fila: 'F11', bloque: 'delantero', tramos: [[17, 25], [1, 9]] },  // área técnica: 10 a 16
  ...Array.from({ length: 10 }, (_, k) => ({ fila: `F${12 + k}`, bloque: 'trasero', tramos: [[22, 26], [6, 21], [1, 5]] })),
];
const numeroFila = (f) => Number(String(f || '').replace(/\D/g, '')) || 0;
const existeButaca = (filaObj, n) => filaObj.tramos.some(([a, b]) => n >= a && n <= b);
const butacasDeFila = (filaObj) => filaObj.tramos.reduce((acc, [a, b]) => acc + (b - a + 1), 0);
const BUTACAS_CROQUIS = FILAS_TEATRO.reduce((acc, f) => acc + butacasDeFila(f), 0); // 517
const BUTACAS_CORTESIA = butacasDeFila(FILAS_TEATRO[0]); // 19

const GRUPOS_SALA = [
  { valor: 'egresados', etiqueta: 'Egresados', color: COLOR_PASE.egresado },
  { valor: 'familias_cn', etiqueta: 'Familias de Cs. Naturales (TM)', color: COLOR_PASE.cn },
  { valor: 'familias_edu', etiqueta: 'Familias de Educación (TT)', color: COLOR_PASE.edu },
  { valor: 'familias', etiqueta: 'Familias (cualquier orientación)', color: '#0F766E' },
  { valor: 'docentes', etiqueta: 'Docentes', color: COLOR_PASE.docente },
  { valor: 'vip', etiqueta: 'VIP / Autoridades', color: COLOR_PASE.vip },
  { valor: 'movilidad', etiqueta: 'Movilidad reducida', color: '#D97706' },
  { valor: 'reservado', etiqueta: 'Reservado / No usar', color: '#94A3B8' },
];
const grupoSalaInfo = (v) => GRUPOS_SALA.find((g) => g.valor === v) || GRUPOS_SALA[GRUPOS_SALA.length - 1];

const salaConfigDe = (config) => {
  const s = config?.sala_config && typeof config.sala_config === 'object' ? config.sala_config : {};
  return { capacidad: aNumeroONulo(s.capacidad), sectores: Array.isArray(s.sectores) ? s.sectores : [] };
};
// Capacidad que usa todo el sistema: la guardada en Aforo y Sala, o 525 si todavía no se guardó ninguna
const capacidadDe = (config) => salaConfigDe(config).capacidad ?? CAPACIDAD_MAXIMA;

// Butacas reales que abarca un sector (respeta pasillos, área técnica y huecos del croquis)
const butacasDeSector = (sec) => {
  const fd = Math.min(numeroFila(sec.filaDesde), numeroFila(sec.filaHasta));
  const fh = Math.max(numeroFila(sec.filaDesde), numeroFila(sec.filaHasta));
  const bd = Math.min(Number(sec.butacaDesde) || 1, Number(sec.butacaHasta) || 26);
  const bh = Math.max(Number(sec.butacaDesde) || 1, Number(sec.butacaHasta) || 26);
  const lista = [];
  FILAS_TEATRO.forEach((f) => {
    const nf = numeroFila(f.fila);
    if (nf < fd || nf > fh) return;
    for (let n = bd; n <= bh; n++) if (existeButaca(f, n)) lista.push(`${f.fila}-${n}`);
  });
  return lista;
};
const describirSector = (sec) => {
  const filas = numeroFila(sec.filaDesde) === numeroFila(sec.filaHasta) ? `Fila ${sec.filaDesde}` : `Filas ${sec.filaDesde} a ${sec.filaHasta}`;
  const todas = (Number(sec.butacaDesde) || 1) <= 1 && (Number(sec.butacaHasta) || 26) >= 25;
  return todas ? filas : `${filas}, butacas ${sec.butacaDesde} a ${sec.butacaHasta}`;
};
const textoSectores = (lista) => lista.map((s) => (s.nombre ? `${s.nombre} (${describirSector(s)})` : describirSector(s))).join(' · ');

// Ubicación (sector) que corresponde mostrar a cada persona. Devuelve '' si no hay sectores asignados.
const ubicacionPara = ({ tipo, egr, movilidad }, config) => {
  const { sectores } = salaConfigDe(config);
  if (sectores.length === 0) return '';
  const de = (g) => sectores.filter((s) => s.grupo === g);
  let grupos;
  if (tipo === 'egresado') grupos = ['egresados'];
  else if (tipo === 'docente') grupos = ['docentes'];
  else if (tipo === 'vip') grupos = ['vip'];
  else grupos = [{ cn: 'familias_cn', edu: 'familias_edu' }[tipoOrientacion(egr)], 'familias'].filter(Boolean);
  if (movilidad && de('movilidad').length) return `${textoSectores(de('movilidad'))} (movilidad reducida)`;
  for (const g of grupos) if (de(g).length) return textoSectores(de(g));
  return '';
};

// Hora real de ingreso (columna hora_ingreso_real). Si la columna todavía no existe, la Puerta no se frena.
const TABLAS_HORA_REAL = ['egresados', 'docentes', 'invitados_especiales'];
const tablasSinHoraReal = new Set();
const esErrorColumna = (err, columna) => new RegExp(columna, 'i').test(err?.message || '') || err?.code === 'PGRST204' || err?.code === '42703';

const CONFIG_INGRESO = {
  egresado: {
    tabla: 'egresados', okTitulo: '✓ INGRESO PERMITIDO (EGRESADO)', dupTipo: 'warning', dupTitulo: '⚠️ EGRESADO YA INGRESÓ',
    detalle: (f) => `DNI: ${f.dni}`, dupToast: (f) => `⚠️ ¡EGRESADO YA INGRESÓ! ${f.nombre_completo}`,
  },
  invitado: {
    tabla: 'invitados', extra: () => ({ hora_ingreso: new Date().toISOString() }), okTitulo: '✓ INGRESO PERMITIDO (FAMILIAR)', dupTipo: 'error', dupTitulo: '¡ALERTA DUPLICADO!',
    detalle: (f) => `DNI: ${f.dni}`, dupDetalle: (f) => `Entrada ${f.numero_entrada} ya ingresó anteriormente.`, dupToast: (f) => `⚠️ ¡ALERTA DUPLICADO! La entrada ${f.numero_entrada} ya ingresó.`,
  },
  docente: {
    tabla: 'docentes', okTitulo: '✓ INGRESO PERMITIDO (DOCENTE)', dupTipo: 'warning', dupTitulo: '⚠️ DOCENTE YA INGRESÓ',
    detalle: (f) => `DNI: ${f.dni}${f.ocupa_butaca === false ? ' · NO ocupa butaca' : ''}`, dupToast: (f) => `⚠️ ¡DOCENTE YA INGRESÓ! ${f.nombre_completo}`,
  },
  vip: {
    tabla: 'invitados_especiales', okTitulo: '✓ INGRESO PERMITIDO (VIP)', dupTipo: 'warning', dupTitulo: '⚠️ VIP YA INGRESÓ',
    detalle: () => 'Autoridad / Invitado Especial', dupToast: (f) => `⚠️ ¡VIP YA INGRESÓ! ${f.nombre_completo}`,
  },
};

// Acceso y color que corresponde mostrar en Puerta para cada tipo de persona
const accesoPuertaDe = (tipo, fila, egresados) => {
  if (tipo === 'egresado') return { texto: ACCESO_TEXTO.egresados, color: COLOR_PASE.egresado };
  if (tipo === 'docente') return { texto: ACCESO_TEXTO.abajo, color: COLOR_PASE.docente };
  if (tipo === 'vip') return { texto: ACCESO_TEXTO.abajo, color: COLOR_PASE.vip };
  const egr = tipo === 'grupo' ? fila : (egresados || []).find((e) => e.id === fila?.egresado_id);
  return { texto: accesoFamiliaDe(egr), color: colorFamiliaDe(egr) };
};

// Busca en los datos que ya tiene cargados el dispositivo
const localizarCodigo = (code, esQrEgresado, datos) => {
  const { egresados: egrs, invitados: invs, docentes: docs, especiales: vips } = datos;
  const egr = () => egrs.find((e) => e.dni && String(e.dni) === code);
  if (esQrEgresado) { const e = egr(); if (e) return { tipo: 'egresado', fila: e }; }
  const inv = invs.find((i) => String(i.numero_entrada || '').toUpperCase() === code || (i.dni && String(i.dni) === code));
  if (inv) return { tipo: 'invitado', fila: inv };
  const doc = docs.find((d) => d.dni && (String(d.dni) === code || code.includes(String(d.dni))));
  if (doc) return { tipo: 'docente', fila: doc };
  const vip = vips.find((v) => (v.dni && (String(v.dni) === code || code.includes(String(v.dni)))) || (code.length >= 5 && sinTildes(v.nombre_completo).toUpperCase().includes(sinTildes(code))));
  if (vip) return { tipo: 'vip', fila: vip };
  const e2 = egr();
  if (e2) return { tipo: 'egresado', fila: e2 };
  return null;
};

// Si el código no está en la lista del dispositivo (por ejemplo, alguien cargado después de abrir la pantalla), se busca directo en la base
const buscarCodigoEnBase = async (code, esQrEgresado) => {
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) return null;
  const uno = async (tabla, col) => {
    const { data, error } = await supabase.from(tabla).select('*').eq(col, code).limit(1);
    if (error) throw error;
    return data && data[0] ? data[0] : null;
  };
  if (esQrEgresado) { const e = await uno('egresados', 'dni'); if (e) return { tipo: 'egresado', fila: e }; }
  const inv = (await uno('invitados', 'numero_entrada')) || (await uno('invitados', 'dni'));
  if (inv) return { tipo: 'invitado', fila: inv };
  const doc = await uno('docentes', 'dni');
  if (doc) return { tipo: 'docente', fila: doc };
  const vip = await uno('invitados_especiales', 'dni');
  if (vip) return { tipo: 'vip', fila: vip };
  const egr = await uno('egresados', 'dni');
  if (egr) return { tipo: 'egresado', fila: egr };
  return null;
};

function ModuloPuerta({ config, egresados, invitados, docentes, especiales, recargar, notify, perfilStaff }) {
  const [busqueda, setBusqueda] = useState('');
  const [egresadoSeleccionado, setEgresadoSeleccionado] = useState(null);
  const [escaneandoCamara, setEscaneandoCamara] = useState(false);
  const [resultadoIngreso, setResultadoIngreso] = useState(null);
  const [codigoManual, setCodigoManual] = useState('');
  const [modoFallback, setModoFallback] = useState(false);
  const html5Ref = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  // Registro de actividad de la Puerta (para auditoría). No frena el ingreso si falla.
  const perfilRef = useRef(perfilStaff);
  useEffect(() => { perfilRef.current = perfilStaff; });
  const dispositivo = (() => {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (/iPhone|iPad/i.test(ua)) return 'iPhone/iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac/i.test(ua)) return 'Mac';
    return 'Otro';
  })();
  const ETIQUETA_TIPO = { egresado: 'egresado', invitado: 'familiar', docente: 'docente', vip: 'VIP' };
  const logPuerta = (accion, detalle) => {
    try {
      supabase.from('logs_sistema').insert({
        usuario: perfilRef.current?.nombre || perfilRef.current?.email || 'Puerta',
        accion,
        modulo: 'Puerta',
        detalle: `${detalle} [${dispositivo}]`,
      }).then(({ error }) => { if (error) console.error('No se pudo registrar el log de Puerta:', error); });
    } catch (e) {
      console.error(e);
    }
  };

  // Datos siempre al día: el escaneo de cámara corre dentro de un intervalo y, sin esto, usaría datos viejos
  const datosRef = useRef({ egresados, invitados, docentes, especiales });
  const notifyRef = useRef(notify);
  const recargarRef = useRef(recargar);
  useEffect(() => {
    datosRef.current = { egresados, invitados, docentes, especiales };
    notifyRef.current = notify;
    recargarRef.current = recargar;
  });
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; });
  const ultimoEscaneoRef = useRef({ code: '', t: 0 });
  const procesandoRef = useRef(false);

  // Registra el ingreso en la base de forma atómica: solo si todavía no figuraba como presente.
  // Devuelve true si se registró ahora, false si ya estaba registrado (duplicado).
  const marcarIngreso = async (tabla, id, extra = {}) => {
    // Egresados, docentes y VIP guardan además la hora real de ingreso (si la columna existe; si no, se sigue igual)
    const conHora = TABLAS_HORA_REAL.includes(tabla) && !tablasSinHoraReal.has(tabla) ? { hora_ingreso_real: new Date().toISOString() } : {};
    const intentar = (cambios) => supabase
      .from(tabla)
      .update({ asistio: true, ...extra, ...cambios })
      .eq('id', id)
      .or('asistio.is.null,asistio.eq.false')
      .select('id');
    let { data, error } = await intentar(conHora);
    if (error && conHora.hora_ingreso_real && esErrorColumna(error, 'hora_ingreso_real')) {
      tablasSinHoraReal.add(tabla);
      ({ data, error } = await intentar({}));
    }
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  };

  const alternarAsistencia = async (tabla, item) => {
    try {
      if (!item.asistio) {
        // Aviso si figura como "No asiste" (o si es invitado de un egresado dado de baja)
        const anf = tabla === 'invitados' ? egresados.find((e) => e.id === item.egresado_id) : null;
        const dadoDeBaja = tabla === 'invitados' ? anf?.activo === false : item.activo === false;
        if (dadoDeBaja && !window.confirm(`${item.nombre_completo} ${tabla === 'invitados' ? `es invitado/a de ${anf.nombre_completo}, que dio de baja su asistencia` : 'figura como "No asiste"'}.\n\n¿Registrar el ingreso igual? (solo si coordinación lo autorizó)`)) return;
        const extra = tabla === 'invitados' ? { hora_ingreso: new Date().toISOString() } : {};
        const ok = await marcarIngreso(tabla, item.id, extra);
        const tipoManual = { egresados: 'egresado', invitados: 'familiar', docentes: 'docente', invitados_especiales: 'VIP' }[tabla] || tabla;
        if (!ok) {
          notify('Ya figuraba como presente (lo registró otro dispositivo).', 'warning');
          logPuerta('DUPLICADO', `Manual: ${tipoManual} ${item.nombre_completo} ya figuraba presente`);
        } else {
          logPuerta('INGRESO_MANUAL', `${tipoManual} ${item.nombre_completo} (DNI ${item.dni || 'S/D'})`);
        }
      } else {
        if (!window.confirm(`¿Quitar el ingreso de ${item.nombre_completo}?`)) return;
        const limpiarHora = TABLAS_HORA_REAL.includes(tabla) && !tablasSinHoraReal.has(tabla);
        const base = tabla === 'invitados' ? { asistio: false, hora_ingreso: null } : { asistio: false };
        let { error } = await supabase.from(tabla).update(limpiarHora ? { ...base, hora_ingreso_real: null } : base).eq('id', item.id);
        if (error && limpiarHora && esErrorColumna(error, 'hora_ingreso_real')) {
          tablasSinHoraReal.add(tabla);
          ({ error } = await supabase.from(tabla).update(base).eq('id', item.id));
        }
        if (error) throw error;
        logPuerta('QUITAR_INGRESO', `${item.nombre_completo} (DNI ${item.dni || 'S/D'})`);
      }
      await recargar();
    } catch (err) {
      notify('No se pudo guardar: ' + err.message, 'error');
    }
  };

  // Búsqueda manual: registra a todos los invitados "en grupo" que falten (por si el QR del grupo no se puede leer)
  const marcarGrupoManual = async (egr, pendientes) => {
    if (egr.activo === false && !window.confirm(`${egr.nombre_completo} dio de baja su asistencia (sus plazas se liberaron).\n\n¿Registrar el ingreso de su grupo igual? (solo si coordinación lo autorizó)`)) return;
    if (!window.confirm(`¿Registrar el ingreso de ${pendientes.length} integrante(s) del grupo de ${egr.nombre_completo}?\n\n${pendientes.map((p) => '• ' + p.nombre_completo).join('\n')}`)) return;
    try {
      const nuevos = [];
      for (const g of pendientes) {
        if (await marcarIngreso('invitados', g.id, { hora_ingreso: new Date().toISOString() })) nuevos.push(g.nombre_completo);
      }
      logPuerta('INGRESO_GRUPAL', `Manual: grupo de ${egr.nombre_completo}: ${nuevos.join(', ') || '(ya habían ingresado)'}`);
      notify(nuevos.length ? `✓ Ingresaron ${nuevos.length} integrante(s) del grupo.` : 'Ya figuraban todos como presentes.', nuevos.length ? undefined : 'warning');
      await recargar();
    } catch (err) {
      notify('No se pudo registrar el grupo: ' + err.message, 'error');
    }
  };

  const validarCodigoEntrada = async (codigoRaw) => {
    const raw = String(codigoRaw || '').trim();
    if (!raw) return;

    // Evita procesar el mismo código varias veces seguidas mientras el QR sigue frente a la cámara
    if (procesandoRef.current) return;
    const ahora = Date.now();
    if (ultimoEscaneoRef.current.code === raw && ahora - ultimoEscaneoRef.current.t < 4000) return;
    ultimoEscaneoRef.current = { code: raw, t: ahora };
    procesandoRef.current = true;

    const avisar = (msg, tipo) => notifyRef.current(msg, tipo);

    try {
      // Pases descargados con la versión anterior del sistema: el QR es el mismo para todos y no identifica a nadie
      if (raw.toUpperCase().includes('ESRN005-ADMIN-QR-DUMMY')) {
        setResultadoIngreso({ tipo: 'warning', titulo: '⚠️ PASE ANTIGUO (QR GENÉRICO)', nombre: 'Este QR no identifica a la persona', detalle: 'Es un pase bajado con una versión anterior del sistema. Buscá a la persona por nombre o DNI en la búsqueda manual y pedile que descargue su pase nuevo.' });
        avisar('⚠️ Pase antiguo: el QR no identifica a la persona. Usá la búsqueda manual.', 'warning');
        logPuerta('QR_GENERICO', 'Se escaneó un pase antiguo con código genérico');
        return;
      }

      const esQrGrupo = raw.toUpperCase().includes('ESRN005-GRUPO');
      const esQrEgresado = esQrGrupo || raw.toUpperCase().includes('ESRN005-EGRESADO');
      let code = raw.toUpperCase();
      if (code.includes('ESRN005-')) {
        const partes = code.split('-');
        let halloDni = false;
        for (let p of partes) {
          if (/^\d{7,8}$/.test(p)) { code = p; halloDni = true; break; }
        }
        // QR de VIP sin DNI: se busca por el nombre que trae el código
        if (!halloDni && code.startsWith('ESRN005-VIP-')) code = code.slice('ESRN005-VIP-'.length).replace(/^-+/, '').trim();
      }

      let hallado = localizarCodigo(code, esQrEgresado, datosRef.current);
      if (!hallado) hallado = await buscarCodigoEnBase(code, esQrEgresado);

      if (!hallado) {
        setResultadoIngreso({ tipo: 'error', titulo: '❌ CÓDIGO NO ENCONTRADO', nombre: raw, detalle: 'Verifique el padrón o busque manualmente.' });
        avisar(`❌ Código o DNI no encontrado: ${raw}`, 'error');
        logPuerta('NO_ENCONTRADO', `Código leído: ${raw.slice(0, 60)}`);
        return;
      }

      const f = hallado.fila;
      const egrsLocal = datosRef.current.egresados;

      // QR del GRUPO FAMILIAR: registra a todos los invitados del egresado marcados "en grupo"
      if (esQrGrupo) {
        if (hallado.tipo !== 'egresado') {
          setResultadoIngreso({ tipo: 'error', titulo: '❌ GRUPO NO ENCONTRADO', nombre: raw, detalle: 'No se encontró al egresado de este grupo. Usá la búsqueda manual.' });
          avisar('❌ Grupo no encontrado. Usá la búsqueda manual.', 'error');
          logPuerta('NO_ENCONTRADO', `QR de grupo: ${raw.slice(0, 60)}`);
          return;
        }
        const acceso = accesoPuertaDe('grupo', f, egrsLocal);
        const nombreGrupo = `Grupo familiar de ${f.nombre_completo}`;
        if (f.activo === false) {
          setResultadoIngreso({ tipo: 'warning', titulo: '⛔ EL EGRESADO DIO DE BAJA SU ASISTENCIA', nombre: nombreGrupo, detalle: 'Al darse de baja se liberaron también las plazas de su grupo. Consultar con coordinación antes de dejarlos pasar.', acceso });
          avisar(`⛔ ${nombreGrupo}: el egresado figura como "No asiste". Consultar con coordinación.`, 'warning');
          logPuerta('BLOQUEADO_NO_ASISTE', `grupo de ${f.nombre_completo} (DNI ${f.dni || 'S/D'})`);
          return;
        }
        const { data: dg, error: eg } = await supabase.from('invitados').select('id, nombre_completo, asistio, movilidad_reducida').eq('egresado_id', f.id).eq('es_grupal', true);
        if (eg) throw eg;
        const grupales = dg || [];
        if (grupales.length === 0) {
          setResultadoIngreso({ tipo: 'warning', titulo: '⚠️ GRUPO SIN INTEGRANTES', nombre: nombreGrupo, detalle: 'Este egresado no tiene invitados marcados "en grupo". Buscá a cada invitado en la búsqueda manual.', acceso });
          avisar(`⚠️ ${nombreGrupo} no tiene integrantes cargados.`, 'warning');
          logPuerta('NO_ENCONTRADO', `grupo de ${f.nombre_completo} sin integrantes`);
          return;
        }
        const nuevos = [];
        for (const g of grupales) {
          if (g.asistio) continue;
          const okG = await marcarIngreso('invitados', g.id, { hora_ingreso: new Date().toISOString() });
          if (okG) nuevos.push(g.id);
        }
        recargarRef.current();
        const lista = grupales.map((g) => ({ nombre: g.nombre_completo, movilidad: g.movilidad_reducida === true, nuevo: nuevos.includes(g.id) }));
        const conMovilidad = grupales.filter((g) => g.movilidad_reducida === true).length;
        const ubicMov = conMovilidad > 0 ? ubicacionPara({ tipo: 'invitado', egr: f, movilidad: true }, configRef.current) : '';
        const ubicGrupo = ubicacionPara({ tipo: 'invitado', egr: f }, configRef.current);
        acceso.ubicacion = [ubicGrupo, ubicMov && ubicMov !== ubicGrupo ? `♿ ${ubicMov}` : ''].filter(Boolean).join(' · ');
        if (nuevos.length > 0) {
          const faltaban = nuevos.length < grupales.length;
          setResultadoIngreso({ tipo: faltaban ? 'warning' : 'success', titulo: faltaban ? `✓ INGRESAN ${nuevos.length} DE ${grupales.length} (los demás ya habían ingresado)` : `✓ INGRESO GRUPO FAMILIAR (${nuevos.length})`, nombre: nombreGrupo, detalle: textoCurso(f), acceso, lista, movilidad: conMovilidad > 0 });
          avisar(`✓ INGRESO PERMITIDO: ${nombreGrupo} (${nuevos.length} persona/s)`, faltaban ? 'warning' : undefined);
          logPuerta('INGRESO_GRUPAL', `grupo de ${f.nombre_completo}: ${grupales.filter((g) => nuevos.includes(g.id)).map((g) => g.nombre_completo).join(', ')}`);
        } else {
          setResultadoIngreso({ tipo: 'error', titulo: '¡ALERTA DUPLICADO! EL GRUPO YA INGRESÓ', nombre: nombreGrupo, detalle: `Los ${grupales.length} integrantes ya figuraban como presentes.`, acceso, lista });
          avisar(`⚠️ ¡ALERTA DUPLICADO! ${nombreGrupo} ya ingresó.`, 'error');
          logPuerta('DUPLICADO', `grupo de ${f.nombre_completo} ya había ingresado`);
        }
        return;
      }

      const c = CONFIG_INGRESO[hallado.tipo];
      const acceso = accesoPuertaDe(hallado.tipo, f, egrsLocal);
      const movilidad = f.movilidad_reducida === true;
      acceso.ubicacion = hallado.tipo === 'docente' && f.ocupa_butaca === false ? 'No ocupa butaca'
        : ubicacionPara({ tipo: hallado.tipo, egr: hallado.tipo === 'invitado' ? egrsLocal.find((e) => e.id === f.egresado_id) : null, movilidad }, configRef.current);

      if (hallado.tipo !== 'invitado' && f.activo === false) {
        setResultadoIngreso({ tipo: 'warning', titulo: '⛔ FIGURA COMO "NO ASISTE"', nombre: f.nombre_completo, detalle: 'Dio de baja su asistencia. Consultar con coordinación antes de dejarlo pasar.' });
        avisar(`⛔ ${f.nombre_completo} figura como "No asiste". Consultar con coordinación.`, 'warning');
        logPuerta('BLOQUEADO_NO_ASISTE', `${ETIQUETA_TIPO[hallado.tipo]} ${f.nombre_completo} (DNI ${f.dni || 'S/D'})`);
        return;
      }
      // Invitado individual de un egresado que se dio de baja: su plaza quedó liberada
      const anfitrion = hallado.tipo === 'invitado' ? egrsLocal.find((e) => e.id === f.egresado_id) : null;
      if (hallado.tipo === 'invitado' && anfitrion && anfitrion.activo === false) {
        setResultadoIngreso({ tipo: 'warning', titulo: '⛔ SU EGRESADO DIO DE BAJA LA ASISTENCIA', nombre: f.nombre_completo, detalle: `Invitado/a de ${anfitrion.nombre_completo}. Al darse de baja se liberaron las plazas de su grupo. Consultar con coordinación.`, acceso });
        avisar(`⛔ ${f.nombre_completo}: su egresado figura como "No asiste". Consultar con coordinación.`, 'warning');
        logPuerta('BLOQUEADO_NO_ASISTE', `familiar ${f.nombre_completo} (egresado ${anfitrion.nombre_completo} dado de baja)`);
        return;
      }
      const detalleExtra = hallado.tipo === 'invitado'
        ? `${f.dni ? `DNI: ${f.dni} · ` : ''}Invitado/a de ${anfitrion ? anfitrion.nombre_completo : 'egresado/a'}${esGrupal(f) ? ' · (figura en el grupo familiar)' : ''}`
        : hallado.tipo === 'egresado' ? [`DNI: ${f.dni}`, textoCurso(f)].filter(Boolean).join(' · ') : c.detalle(f);

      const ok = await marcarIngreso(c.tabla, f.id, c.extra ? c.extra() : {});
      recargarRef.current(); // refresca la lista en segundo plano, sin demorar el siguiente escaneo

      if (ok) {
        setResultadoIngreso({ tipo: 'success', titulo: c.okTitulo, nombre: f.nombre_completo, detalle: detalleExtra, acceso, movilidad });
        avisar(`✓ INGRESO PERMITIDO: ${f.nombre_completo}`);
        logPuerta('INGRESO', `${ETIQUETA_TIPO[hallado.tipo]} ${f.nombre_completo} (DNI ${f.dni || 'S/D'})`);
      } else {
        logPuerta('DUPLICADO', `${ETIQUETA_TIPO[hallado.tipo]} ${f.nombre_completo} (DNI ${f.dni || 'S/D'}) ya había ingresado`);
        setResultadoIngreso({ tipo: c.dupTipo, titulo: c.dupTitulo, nombre: f.nombre_completo, detalle: c.dupDetalle ? c.dupDetalle(f) : detalleExtra, acceso, movilidad });
        avisar(c.dupToast(f), c.dupTipo === 'error' ? 'error' : 'warning');
      }
    } catch (err) {
      console.error(err);
      setResultadoIngreso({ tipo: 'error', titulo: '❌ ERROR AL REGISTRAR', nombre: raw, detalle: 'NO se registró el ingreso (' + (err.message || 'error de conexión') + '). Reintente o use la búsqueda manual.' });
      avisar('❌ No se pudo registrar el ingreso: ' + (err.message || 'error de conexión'), 'error');
      logPuerta('ERROR', `No se registró el ingreso de "${raw.slice(0, 40)}": ${err.message || 'error de conexión'}`);
    } finally {
      procesandoRef.current = false;
    }
  };

  const iniciarCamara = async () => {
    setResultadoIngreso(null);
    setEscaneandoCamara(true);
    if (!window.BarcodeDetector) {
      // iPhone (Safari) y Chrome de Windows: se usa la librería html5-qrcode
      setModoFallback(true);
      setTimeout(async () => {
        try {
          const { Html5Qrcode } = await import('html5-qrcode');
          const lector = new Html5Qrcode('lector-html5');
          html5Ref.current = lector;
          await lector.start(
            { facingMode: 'environment' },
            { fps: 8, qrbox: { width: 240, height: 240 } },
            (texto) => { validarCodigoEntrada(texto); },
            () => {}
          );
        } catch (err) {
          console.error(err);
          notify('No se pudo acceder a la cámara. Verifique los permisos del navegador o use el campo "Lector / código manual".', 'error');
          html5Ref.current = null;
          setModoFallback(false);
          setEscaneandoCamara(false);
        }
      }, 150);
      return;
    }
    try {
      const constraints = { video: { facingMode: { ideal: 'environment' } } };
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
                validarCodigoEntrada(barcodes[0].rawValue);
              }
            } catch (err) {}
          }
        }, 400);
      }
    } catch (err) {
      notify('No se pudo acceder a la cámara trasera. Verifique los permisos.', 'error');
      setEscaneandoCamara(false);
    }
  };

  const apagarCamara = () => {
    if (html5Ref.current) {
      const l = html5Ref.current;
      html5Ref.current = null;
      l.stop().then(() => l.clear()).catch(() => {});
    }
    setModoFallback(false);
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

  useEffect(() => { return () => { apagarCamara(); }; }, []);

  const termino = busqueda.trim().toLowerCase();
  const egresadosCoincidentes = termino ? egresados.filter((e) => coincideTexto([e.nombre_completo, e.dni], busqueda)) : [];
  const egrSel = egresadoSeleccionado ? (egresados.find((e) => e.id === egresadoSeleccionado.id) || egresadoSeleccionado) : null;
  const docentesCoincidentes = termino ? docentes.filter((d) => coincideTexto([d.nombre_completo, d.dni], busqueda)) : [];
  const invitadosCoincidentes = termino ? invitados.filter((i) => coincideTexto([i.nombre_completo, i.dni, i.numero_entrada], busqueda)) : [];
  const vipsCoincidentes = termino ? especiales.filter((v) => coincideTexto([v.nombre_completo, v.dni], busqueda)) : [];

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl text-center">
        <div>
          <h2 className="font-extrabold text-2xl text-white">Control de Puerta</h2>
          <p className="text-xs text-slate-300 mt-1">Utilizá la cámara trasera para escanear los pases QR al ingresar</p>
        </div>

        <button
          type="button"
          onClick={() => { escaneandoCamara ? apagarCamara() : iniciarCamara(); }}
          className={`w-full py-5 px-4 rounded-2xl font-extrabold text-base sm:text-lg flex items-center justify-center gap-3 shadow-2xl transition-all cursor-pointer ${
            escaneandoCamara ? 'bg-rose-700 hover:bg-rose-800 text-white animate-pulse' : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white'
          }`}
        >
          {escaneandoCamara ? <><CameraOff className="w-8 h-8" /> Apagar Cámara</> : <><Camera className="w-8 h-8" /> 📷 ESCANEAR CÓDIGO QR</>}
        </button>

        {resultadoIngreso && (
          <div className={`p-4 sm:p-5 rounded-2xl border-4 text-left space-y-2 shadow-2xl transition-all ${
            resultadoIngreso.tipo === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-900' :
            resultadoIngreso.tipo === 'warning' ? 'bg-amber-50 border-amber-500 text-amber-900' : 'bg-rose-50 border-rose-500 text-rose-900'
          }`}>
            <div className="flex justify-between items-start">
              <span className="font-extrabold text-sm uppercase tracking-wider">{resultadoIngreso.titulo}</span>
              <button onClick={() => setResultadoIngreso(null)} className="text-slate-500 hover:text-slate-800 font-bold px-2 py-0.5 rounded bg-white border text-xs">✕ Cerrar</button>
            </div>
            <p className="font-black text-xl leading-tight">{resultadoIngreso.nombre}</p>
            {resultadoIngreso.detalle && <p className="text-xs font-semibold opacity-90">{resultadoIngreso.detalle}</p>}
            {resultadoIngreso.movilidad && (
              <p className="inline-block px-3 py-1 rounded-lg bg-amber-200 text-amber-900 text-sm font-black">♿ MOVILIDAD REDUCIDA{resultadoIngreso.lista ? ' (en el grupo)' : ''}</p>
            )}
            {resultadoIngreso.acceso && (
              <p className="px-3 py-2 rounded-xl text-white text-sm font-black text-center" style={{ backgroundColor: resultadoIngreso.acceso.color }}>📍 {resultadoIngreso.acceso.texto}</p>
            )}
            {resultadoIngreso.acceso?.ubicacion && (
              <p className="px-3 py-1.5 rounded-xl bg-white border-2 text-sm font-black text-center text-slate-800" style={{ borderColor: resultadoIngreso.acceso.color }}>🪑 {resultadoIngreso.acceso.ubicacion}</p>
            )}
            {resultadoIngreso.lista && (
              <ul className="text-sm space-y-0.5 bg-white/70 rounded-lg p-2">
                {resultadoIngreso.lista.map((p, i) => (
                  <li key={i} className={`font-semibold ${p.nuevo === false ? 'opacity-50' : ''}`}>• {p.nombre}{p.movilidad ? ' ♿' : ''}{p.nuevo === false ? ' (ya había ingresado)' : ''}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {escaneandoCamara && (
          <div className="bg-slate-800 border-2 border-emerald-500 rounded-2xl p-4 space-y-3">
            <div className="relative w-full h-80 bg-black rounded-xl overflow-hidden border border-slate-700">
              {modoFallback ? (
                <div id="lector-html5" className="w-full h-full" />
              ) : (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                </>
              )}
              <div className="absolute inset-0 border-4 border-emerald-500/40 rounded-xl pointer-events-none flex items-center justify-center">
                <div className="w-56 h-56 border-2 border-dashed border-emerald-400 rounded-lg animate-pulse" />
              </div>
            </div>
            <p className="font-bold text-xs text-emerald-400">Apuntá la cámara trasera al código QR del pase</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-sm">
        <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Lector de códigos / código manual</h3>
        <p className="text-xs text-slate-500">Sirve para un lector USB de códigos (apuntá, escanea y envía solo) o para escribir a mano el DNI o el número de entrada y apretar Enter.</p>
        <input
          type="text"
          value={codigoManual}
          onChange={(e) => setCodigoManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const c = codigoManual.trim();
              if (c) { validarCodigoEntrada(c); setCodigoManual(''); }
            }
          }}
          placeholder="Escaneá o escribí el código y apretá Enter..."
          className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 outline-none text-sm font-mono"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
        <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Búsqueda manual (Por si un invitado llega por separado)</h3>
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
          <input type="text" placeholder="Escribí el nombre del egresado, docente o DNI..." value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setEgresadoSeleccionado(null); }} className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 text-sm outline-none focus:border-[#6B1D2F]" />
        </div>

        {egresadoSeleccionado ? (
          <div className="space-y-3">
            <button onClick={() => setEgresadoSeleccionado(null)} className="text-xs font-bold text-indigo-600 hover:underline">← Volver al listado</button>
            <div className="p-4 rounded-xl bg-slate-50 border flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">{egrSel.nombre_completo}</p>
                <p className="text-xs text-slate-500">DNI Egresado: {egrSel.dni}{textoCurso(egrSel) ? ` · ${textoCurso(egrSel)}` : ''}</p>
                <p className="text-[11px] font-bold mt-0.5" style={{ color: colorFamiliaDe(egrSel) }}>Familia: {accesoFamiliaDe(egrSel)}</p>
                {egrSel.activo === false && <p className="text-[11px] font-bold text-rose-700">NO ASISTE (plazas liberadas)</p>}
              </div>
              <button onClick={() => alternarAsistencia('egresados', egrSel)} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs cursor-pointer ${egrSel.asistio ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {egrSel.asistio ? '✓ Egresado presente' : 'Marcar ingreso del egresado'}
              </button>
            </div>
            {(() => {
              const grupoPend = invitados.filter((i) => i.egresado_id === egresadoSeleccionado.id && esGrupal(i) && !i.asistio);
              if (grupoPend.length === 0) return null;
              return (
                <button onClick={() => marcarGrupoManual(egrSel, grupoPend)} className="w-full py-2.5 rounded-xl text-xs font-bold text-white shadow cursor-pointer" style={{ backgroundColor: colorFamiliaDe(egrSel) }}>
                  Marcar ingreso de todo el grupo familiar ({grupoPend.length} pendiente{grupoPend.length === 1 ? '' : 's'})
                </button>
              );
            })()}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-slate-500">Familiares Habilitados:</p>
              {invitados.filter((i) => i.egresado_id === egresadoSeleccionado.id).map((inv) => (
                <div key={inv.id} className="p-3 rounded-xl border flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm">{inv.nombre_completo}{tieneMovilidad(inv) ? ' ♿' : ''}</p>
                    <p className="text-xs text-slate-500">DNI: {inv.dni} · <strong>{inv.numero_entrada}</strong> · {esGrupal(inv) ? 'En grupo' : 'Individual'}</p>
                  </div>
                  <button onClick={() => alternarAsistencia('invitados', inv)} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs ${inv.asistio ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
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
                <button onClick={() => alternarAsistencia('docentes', doc)} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs ${doc.asistio ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {doc.asistio ? '✓ Asistió' : 'Marcar Ingreso'}
                </button>
              </div>
            ))}
            {invitadosCoincidentes.map((inv) => {
              const anfitrion = egresados.find((e) => e.id === inv.egresado_id);
              return (
                <div key={inv.id} className="p-3 rounded-xl border flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-amber-600">Familiar{esGrupal(inv) ? ' · en grupo' : ''}</span>
                    <p className="font-bold text-sm">{inv.nombre_completo}{tieneMovilidad(inv) ? ' ♿' : ''}</p>
                    <p className="text-xs text-slate-500">DNI: {inv.dni || 'S/D'}{anfitrion ? ` · Invitado de ${anfitrion.nombre_completo}` : ''}</p>
                  </div>
                  <button onClick={() => alternarAsistencia('invitados', inv)} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs shrink-0 ${inv.asistio ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                    {inv.asistio ? '✓ Asistió' : 'Marcar Ingreso'}
                  </button>
                </div>
              );
            })}
            {vipsCoincidentes.map((vip) => (
              <div key={vip.id} className="p-3 rounded-xl border flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase text-rose-600">VIP / Autoridad</span>
                  <p className="font-bold text-sm">{vip.nombre_completo}{tieneMovilidad(vip) ? ' ♿' : ''}</p>
                  <p className="text-xs text-slate-500">DNI: {vip.dni || 'S/D'}</p>
                </div>
                <button onClick={() => alternarAsistencia('invitados_especiales', vip)} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs shrink-0 ${vip.asistio ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {vip.asistio ? '✓ Asistió' : 'Marcar Ingreso'}
                </button>
              </div>
            ))}
            {termino && egresadosCoincidentes.length + docentesCoincidentes.length + invitadosCoincidentes.length + vipsCoincidentes.length === 0 && (
              <p className="text-center text-slate-400 text-sm py-4">No se encontraron resultados.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelAdministracion({ abrirResumenPapel, vipPortalActivo, whatsappActivo, perfilStaff, config, egresados, invitados, docentes, especiales, solicitudes, usuariosSistema, logsSistema, totalEgresados, totalDocentes, totalDocentesConButaca, totalDocentesSinButaca, totalEspeciales, totalCuposFamiliares, totalOcupado, vacantesLibres, recargar, notify, reiniciarAsistenciasGeneral, borrarInvitadosEgresados, registrarLog }) {
  const CAPACIDAD = capacidadDe(config);
  const [tab, setTab] = useState('egresados');
  const [filtroEgresado, setFiltroEgresado] = useState('');
  const [filtroDocente, setFiltroDocente] = useState('');
  const [filtroVip, setFiltroVip] = useState('');
  
  const [cupoBaseEdit, setCupoBaseEdit] = useState(cupoBaseDe(config));
  const [filasEdit, setFilasEdit] = useState(config.filas || 15);
  const [butacasFilaEdit, setButacasFilaEdit] = useState(config.butacas_por_fila || 35);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [cupoMasivo, setCupoMasivo] = useState('');
  const [recortarSobrantes, setRecortarSobrantes] = useState(true);
  const [filtroInvitado, setFiltroInvitado] = useState('');
  const [aplicandoCupo, setAplicandoCupo] = useState(false);

  const [modalEditarEgr, setModalEditarEgr] = useState(null);
  const [modalEditarDoc, setModalEditarDoc] = useState(null);
  const [modalEditarVip, setModalEditarVip] = useState(null);
  const [modalAgregarEgresado, setModalAgregarEgresado] = useState(false);
  const [modalAgregarDocente, setModalAgregarDocente] = useState(false);
  const [modalAgregarVip, setModalAgregarVip] = useState(false);
  
  const [nuevoEgNombre, setNuevoEgNombre] = useState('');
  const [nuevoEgDni, setNuevoEgDni] = useState('');
  const [nuevoDocNombre, setNuevoDocNombre] = useState('');
  const [nuevoDocDni, setNuevoDocDni] = useState('');
  const [nuevoDocButaca, setNuevoDocButaca] = useState(true);
  const [editDocButaca, setEditDocButaca] = useState(true);
  const [nuevoVipNombre, setNuevoVipNombre] = useState('');
  const [nuevoVipDni, setNuevoVipDni] = useState('');

  const [editNombre, setEditNombre] = useState('');
  const [editDni, setEditDni] = useState('');
  const [editCelular, setEditCelular] = useState('');
  const [editCupo, setEditCupo] = useState(4);
  const [editOrientacion, setEditOrientacion] = useState('');
  const [editDivision, setEditDivision] = useState('');
  const [nuevoEgOrientacion, setNuevoEgOrientacion] = useState('');
  const [nuevoVipMovilidad, setNuevoVipMovilidad] = useState(false);
  const [editVipMovilidad, setEditVipMovilidad] = useState(false);
  const [cantAprobar, setCantAprobar] = useState({});
  const [subiendoEscudo, setSubiendoEscudo] = useState(false);
  const [salaEdit, setSalaEdit] = useState(() => ({ capacidad: capacidadDe(config), sectores: salaConfigDe(config).sectores }));
  const [salaCambiada, setSalaCambiada] = useState(false);
  const [guardandoSala, setGuardandoSala] = useState(false);
  const salaGuardadaJSON = JSON.stringify(config.sala_config || null);
  useEffect(() => {
    // si cambia lo guardado en la base (y no hay cambios sin guardar), se vuelve a cargar el editor
    if (!salaCambiada) setSalaEdit({ capacidad: capacidadDe(config), sectores: salaConfigDe(config).sectores });
  }, [salaGuardadaJSON]);
  const fileEscudoRef = useRef(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const [editDocNombre, setEditDocNombre] = useState('');
  const [editDocDni, setEditDocDni] = useState('');
  const [guardandoDocente, setGuardandoDocente] = useState(false);

  const [editVipNombre, setEditVipNombre] = useState('');
  const [editVipDni, setEditVipDni] = useState('');
  const [guardandoVip, setGuardandoVip] = useState(false);

  const [filtroLogBusqueda, setFiltroLogBusqueda] = useState('');
  const [modalLogs, setModalLogs] = useState(false);
  useEffect(() => {
    if (!modalLogs) return;
    const cerrarConEsc = (e) => { if (e.key === 'Escape') setModalLogs(false); };
    window.addEventListener('keydown', cerrarConEsc);
    return () => window.removeEventListener('keydown', cerrarConEsc);
  }, [modalLogs]);

  const recargarRef = useRef(recargar);
  useEffect(() => { recargarRef.current = recargar; });
  useEffect(() => {
    recargarRef.current(); // datos frescos al abrir cualquier pestaña
    if (tab !== 'reportes') return; // refresco automático solo en Acreditación en Vivo
    const id = setInterval(() => {
      if (!document.hidden) recargarRef.current();
    }, 5000);
    return () => clearInterval(id);
  }, [tab]);

  const fileEgrRef = useRef(null);
  const fileDocRef = useRef(null);
  const fileVipRef = useRef(null);
  const adminQrRef = useRef(null);

  const [nuevoNombreUsr, setNuevoNombreUsr] = useState('');
  const [nuevoEmailUsr, setNuevoEmailUsr] = useState('');
  const [nuevoPassUsr, setNuevoPassUsr] = useState('');
  const [nuevoRolUsr, setNuevoRolUsr] = useState('puerta');
  const [showPassUsr, setShowPassUsr] = useState(false);

  const [modalCierreParcialAbierto, setModalCierreParcialAbierto] = useState(false);

  // Escudo institucional: se achica a 300 px y se guarda en la base (configuracion.escudo) como imagen PNG
  const subirEscudo = async (ev) => {
    const archivo = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!archivo) return;
    if (!/^image\//.test(archivo.type)) { notify('El archivo tiene que ser una imagen (PNG o JPG).', 'error'); return; }
    setSubiendoEscudo(true);
    try {
      const dataUrlOriginal = await new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result);
        lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
        lector.readAsDataURL(archivo);
      });
      const img = await cargarImagen(dataUrlOriginal);
      if (!img) throw new Error('No se pudo abrir la imagen');
      const escala = Math.min(1, 300 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const escudo = canvas.toDataURL('image/png');
      const resultado = config.id
        ? await supabase.from('configuracion').update({ escudo }).eq('id', config.id)
        : await supabase.from('configuracion').insert({ estado_etapa: config.estado_etapa || 'abierta', cupo_base: cupoBaseDe(config), escudo });
      if (resultado.error) throw resultado.error;
      await registrarLog('CONFIGURACION', 'Escudo', 'Se cargó el escudo institucional.');
      await recargar();
      notify('Escudo institucional guardado. Ya aparece en la página principal y en los pases.');
    } catch (err) {
      const faltaColumna = /escudo/i.test(err.message || '') || err.code === 'PGRST204' || err.code === '42703';
      notify(faltaColumna ? 'Falta crear la columna "escudo" en la tabla configuracion (Supabase). Ejecutá el SQL y volvé a intentar.' : 'No se pudo guardar el escudo: ' + err.message, 'error');
    } finally {
      setSubiendoEscudo(false);
    }
  };

  const quitarEscudo = async () => {
    if (!config.id || !config.escudo) return;
    if (!window.confirm('¿Quitar el escudo institucional? Deja de aparecer en la página principal y en los pases nuevos.')) return;
    const { error } = await supabase.from('configuracion').update({ escudo: null }).eq('id', config.id);
    if (error) { notify('No se pudo quitar el escudo: ' + error.message, 'error'); return; }
    await registrarLog('CONFIGURACION', 'Escudo', 'Se quitó el escudo institucional.');
    await recargar();
    notify('Escudo quitado.');
  };

  // Protección: no se puede dejar al sistema sin administradores activos
  const quedaOtroAdmin = (u) => usuariosSistema.some((x) => x.id !== u.id && String(x.rol || '').toLowerCase() === 'admin' && x.activo !== false);

  const actualizarUsuario = async (u, cambios, detalle) => {
    const esYo = (u.email || '').toLowerCase() === (perfilStaff?.email || '').toLowerCase();
    const pierdeAdmin = cambios.activo === false || (cambios.rol && cambios.rol !== 'admin');
    if (String(u.rol || '').toLowerCase() === 'admin' && pierdeAdmin && (esYo || !quedaOtroAdmin(u))) {
      notify(esYo ? 'No podés quitarte a vos mismo el acceso de administrador.' : 'Tiene que quedar al menos un administrador activo.', 'error');
      return;
    }
    try {
      const { error } = await supabase.from('usuarios_sistema').update(cambios).eq('id', u.id);
      if (error) throw error;
      await registrarLog('EDITAR_USUARIO', 'Sistema', `${detalle}: ${u.nombre}`);
      await recargar();
      notify('Usuario actualizado.');
    } catch (err) {
      notify('Error al actualizar el usuario: ' + err.message, 'error');
    }
  };

  const eliminarUsuarioSistema = async (u) => {
    const esYo = (u.email || '').toLowerCase() === (perfilStaff?.email || '').toLowerCase();
    if (esYo) { notify('No podés eliminar tu propio usuario.', 'error'); return; }
    if (String(u.rol || '').toLowerCase() === 'admin' && !quedaOtroAdmin(u)) { notify('Tiene que quedar al menos un administrador activo.', 'error'); return; }
    if (!window.confirm(`¿Eliminar a ${u.nombre}?`)) return;
    try {
      const { error } = await supabase.from('usuarios_sistema').delete().eq('id', u.id);
      if (error) throw error;
      await registrarLog('ELIMINAR_USUARIO', 'Sistema', `Se eliminó al usuario ${u.nombre}`);
      await recargar();
      notify('Usuario eliminado.');
    } catch (err) {
      notify('Error al eliminar el usuario: ' + err.message, 'error');
    }
  };

  // Invitados que superan el cupo: se conservan primero los que ya ingresaron y luego los cargados antes
  // Butacas extra aprobadas a un egresado (0 si no tiene)
  const extraAprobadaDe = (e) => solicitudes
    .filter((s) => s.egresado_id === e.id && String(s.estado || '').toLowerCase() === 'aprobada')
    .reduce((acc, s) => acc + (Number(s.cantidad_aprobada ?? s.cantidad_solicitada) || 0), 0);

  const planRecorte = (cupoDeEgr) => {
    const aEliminar = [];
    const detalle = [];
    const afectados = new Set();
    egresados.filter((e) => e.activo !== false).forEach((e) => {
      const cupo = cupoDeEgr(e);
      const mios = invitados.filter((i) => i.egresado_id === e.id);
      if (mios.length <= cupo) return;
      const ordenados = [...mios].sort((a, b) => (b.asistio ? 1 : 0) - (a.asistio ? 1 : 0) || new Date(a.creado_en || 0) - new Date(b.creado_en || 0));
      ordenados.slice(cupo).filter((i) => !i.asistio).forEach((i) => {
        aEliminar.push(i.id);
        detalle.push(`${i.nombre_completo} (de ${e.nombre_completo})`);
        afectados.add(e.id);
      });
    });
    return { aEliminar, detalle, egresadosAfectados: afectados.size };
  };

  const borrarInvitadosPorIds = async (ids) => {
    for (let k = 0; k < ids.length; k += 40) {
      const { error } = await supabase.from('invitados').delete().in('id', ids.slice(k, k + 40));
      if (error) throw error;
    }
  };

  const ajustarInvitadosAlCupo = async () => {
    const plan = planRecorte((e) => cupoDe(e, config));
    if (plan.aEliminar.length === 0) { notify('No hay invitados por encima del cupo.'); return; }
    if (!window.confirm(`Se van a ELIMINAR ${plan.aEliminar.length} invitado(s) de ${plan.egresadosAfectados} egresado(s) que superan su cupo actual.\n\nSe conservan los que ya ingresaron y los que se cargaron primero. No se puede deshacer.\n\n¿Continuar?`)) return;
    try {
      await borrarInvitadosPorIds(plan.aEliminar);
      await registrarLog('AJUSTE_INVITADOS', 'Aforo', `Se eliminaron ${plan.aEliminar.length} invitados que superaban el cupo: ${plan.detalle.slice(0, 25).join('; ')}${plan.detalle.length > 25 ? '…' : ''}`);
      await recargar();
      notify(`Listo: se eliminaron ${plan.aEliminar.length} invitados sobrantes.`);
    } catch (err) {
      notify('Error al ajustar los invitados: ' + err.message, 'error');
    }
  };

  const aplicarCupoMasivo = async () => {
    const n = Number(cupoMasivo);
    if (cupoMasivo === '' || !Number.isInteger(n) || n < 0 || n > 10) {
      notify('Ingresá un número entero de 0 a 10.', 'error');
      return;
    }
    const afectados = egresados.filter((e) => e.activo !== false);
    if (afectados.length === 0) { notify('No hay egresados activos.', 'error'); return; }
    const cupoNuevo = (e) => n + extraAprobadaDe(e);
    const conExtra = afectados.filter((e) => extraAprobadaDe(e) > 0).length;
    const conMas = afectados.filter((e) => invitados.filter((i) => i.egresado_id === e.id).length > cupoNuevo(e));
    let msg = `¿Asignar ${n} invitado(s) a cada uno de los ${afectados.length} egresados activos?\n\nEsto REEMPLAZA el cupo actual de cada egresado.${conExtra ? ` A los ${conExtra} egresado(s) con butacas extra aprobadas se les suman esas extras (no se pierden).` : ''}`;
    const plan = recortarSobrantes ? planRecorte(cupoNuevo) : null;
    if (plan && plan.aEliminar.length > 0) {
      msg += `\n\nSe van a ELIMINAR ${plan.aEliminar.length} invitado(s) ya cargados de ${plan.egresadosAfectados} egresado(s) que superan el cupo de ${n} (se conservan los que ya ingresaron). No se puede deshacer.`;
    } else if (conMas.length > 0) {
      msg += `\n\nAtención: ${conMas.length} egresado(s) tienen cargados más invitados que ese cupo y quedarían por encima (no se borran porque la opción de recortar está desactivada o ya ingresaron).`;
    }
    if (!window.confirm(msg)) return;
    setAplicandoCupo(true);
    try {
      const ids = afectados.map((e) => e.id);
      const sinExtra = afectados.filter((e) => extraAprobadaDe(e) === 0).map((e) => e.id);
      for (let k = 0; k < sinExtra.length; k += 40) {
        const { error } = await supabase.from('egresados').update({ cupo_asignado: n }).in('id', sinExtra.slice(k, k + 40));
        if (error) throw error;
      }
      for (const e of afectados.filter((x) => extraAprobadaDe(x) > 0)) {
        const { error } = await supabase.from('egresados').update({ cupo_asignado: cupoNuevo(e) }).eq('id', e.id);
        if (error) throw error;
      }
      if (config.id) {
        const { error } = await supabase.from('configuracion').update({ cupo_base: n }).eq('id', config.id);
        if (error) throw error;
        setCupoBaseEdit(String(n));
      }
      if (plan && plan.aEliminar.length > 0) await borrarInvitadosPorIds(plan.aEliminar);
      await registrarLog('CUPO_MASIVO', 'Aforo', `Se asignó cupo de ${n} invitado(s) a ${ids.length} egresados activos.${plan && plan.aEliminar.length > 0 ? ` Se eliminaron ${plan.aEliminar.length} invitados sobrantes: ${plan.detalle.slice(0, 25).join('; ')}${plan.detalle.length > 25 ? '…' : ''}` : ''}`);
      await recargar();
      notify(`Cupo de ${n} invitado(s) aplicado a ${ids.length} egresados.`);
    } catch (err) {
      notify('Error al aplicar el cupo: ' + err.message + ' (puede haber quedado aplicado a una parte; revisá y repetí).', 'error');
    } finally {
      setAplicandoCupo(false);
    }
  };

  const exportarLogsCSV = async () => {
    try {
      // Supabase entrega como máximo 1000 filas por consulta: se pide de a 1000 hasta traer todo
      const data = [];
      for (let desde = 0; desde < 50000; desde += 1000) {
        const { data: parte, error } = await supabase.from('logs_sistema').select('*').order('created_at', { ascending: true }).range(desde, desde + 999);
        if (error) throw error;
        data.push(...(parte || []));
        if (!parte || parte.length < 1000) break;
      }
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const filas = [['fecha_hora_local', 'fecha_hora_iso', 'usuario', 'modulo', 'accion', 'detalle'].join(',')];
      (data || []).forEach((l) => {
        filas.push([esc(new Date(l.created_at).toLocaleString('es-AR')), esc(l.created_at), esc(l.usuario), esc(l.modulo), esc(l.accion), esc(l.detalle)].join(','));
      });
      const blob = new Blob(['\uFEFF' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const f = new Date();
      const nombre = `registro-actividad-esrn5-${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify(`Se exportaron ${(data || []).length} registros (${nombre}).`);
    } catch (err) {
      notify('No se pudo exportar el registro: ' + err.message, 'error');
    }
  };

  const renderSimuladorCupo = () => {
            const E = totalEgresados, D = totalDocentesConButaca, V = totalEspeciales;
            const fijos = E + D + V;
            const n = cupoMasivo === '' ? null : Number(cupoMasivo);
            const ocupacion = n === null ? null : fijos + n * E;
            const vac = ocupacion === null ? null : CAPACIDAD - ocupacion;
            const maxCupo = E > 0 ? Math.max(0, Math.floor((CAPACIDAD - fijos) / E)) : 0;
            const sobran = E > 0 ? CAPACIDAD - fijos - maxCupo * E : 0;
            return (
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wide">Cantidad de invitados por egresado <span className="normal-case font-semibold text-slate-500">(cupo base actual: {cupoBaseDe(config)})</span></h4>
                <p className="text-xs text-slate-500">
                  Hoy: {E} egresados + {D} docentes con butaca + {V} VIP = <b>{fijos}</b> lugares fijos de {CAPACIDAD}. Quedan <b>{Math.max(0, CAPACIDAD - fijos)}</b> butacas para invitados.
                  {E > 0 && <> Con <b>{maxCupo}</b> invitado(s) por egresado entran todos y sobran <b>{sobran}</b> butaca(s) para solicitudes extra.</>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {[0, 1, 2, 3, 4].map((k) => {
                    const oc = fijos + k * E;
                    const v = CAPACIDAD - oc;
                    return (
                      <button key={k} type="button" onClick={() => setCupoMasivo(String(k))} className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer text-left ${String(k) === cupoMasivo ? 'ring-2 ring-indigo-500' : ''} ${v < 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                        {k} por egresado<br /><span className="font-semibold">{oc} ocupadas · {v < 0 ? `faltan ${-v}` : `sobran ${v}`}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Invitados por egresado (0 a 10)</label>
                    <input type="number" min="0" max="10" value={cupoMasivo} onChange={(e) => setCupoMasivo(e.target.value)} className="w-40 px-3 py-2 border rounded-xl text-sm bg-white" placeholder="Ej: 2" />
                  </div>
                  <button type="button" disabled={aplicandoCupo || cupoMasivo === ''} onClick={aplicarCupoMasivo} className="px-4 py-2.5 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow cursor-pointer">
                    {aplicandoCupo ? 'Aplicando...' : 'Aplicar a todos los egresados activos'}
                  </button>
                </div>
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={recortarSobrantes} onChange={(e) => setRecortarSobrantes(e.target.checked)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
                  <span><b>Al aplicar, eliminar los invitados ya cargados que pasen el cupo.</b> Se conservan los que ya ingresaron y los que se cargaron primero. No se puede deshacer.</span>
                </label>
                {(() => {
                  const actual = planRecorte((e) => cupoDe(e, config));
                  const conN = n === null ? null : planRecorte(() => n);
                  return (
                    <div className="space-y-1">
                      {conN && conN.aEliminar.length > 0 && (
                        <p className="text-xs font-bold text-amber-700">Con {n} por egresado, {conN.aEliminar.length} invitado(s) de {conN.egresadosAfectados} egresado(s) quedan por encima del cupo{recortarSobrantes ? ' y se eliminarían al aplicar.' : '.'}</p>
                      )}
                      {actual.aEliminar.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs text-slate-600">Hoy hay <b>{actual.aEliminar.length}</b> invitado(s) cargados por encima del cupo de {actual.egresadosAfectados} egresado(s).</p>
                          <button type="button" onClick={ajustarInvitadosAlCupo} className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold cursor-pointer">Ajustar invitados al cupo actual</button>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {ocupacion !== null && (
                  <p className={`text-xs font-bold ${vac < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    Con {n} por egresado: {ocupacion} de {CAPACIDAD} butacas ({vac < 0 ? `faltan ${-vac}` : `sobran ${vac}`}).
                  </p>
                )}
                <p className="text-[11px] text-slate-400">Aplicar reemplaza el cupo de cada egresado activo (a quienes tienen butacas extra aprobadas se les suman) y también actualiza el cupo base para los egresados nuevos. Los invitados ya cargados solo se borran si está tildada la opción de recortar.</p>
              </div>
            );
  };

  const cambiarPortalVip = async () => {
    const nuevo = !vipPortalActivo;
    const aviso = nuevo
      ? '¿Activar el acceso de invitados VIP en el portal de DNI?'
      : '¿Desactivar el acceso de invitados VIP en el portal de DNI?\n\nSe oculta la opción "VIP" del portal. Los VIP siguen cargados en el sistema y pueden ingresar por Puerta con su QR.';
    if (!window.confirm(aviso)) return;
    try {
      let resultado;
      if (config.id) {
        resultado = await supabase.from('configuracion').update({ portal_vip_activo: nuevo }).eq('id', config.id);
      } else {
        resultado = await supabase.from('configuracion').insert({ estado_etapa: config.estado_etapa || 'abierta', cupo_base: cupoBaseDe(config), portal_vip_activo: nuevo });
      }
      if (resultado.error) throw resultado.error;
      await registrarLog('CONFIGURACION', 'Portal VIP', nuevo ? 'Se activó el acceso VIP en el portal.' : 'Se desactivó el acceso VIP en el portal.');
      await recargar();
      notify(nuevo ? 'Acceso VIP del portal activado.' : 'Acceso VIP del portal desactivado.');
    } catch (err) {
      const faltaColumna = /portal_vip_activo/i.test(err.message || '') || err.code === 'PGRST204' || err.code === '42703';
      notify(faltaColumna ? 'Falta crear la columna "portal_vip_activo" en Supabase. Ejecutá el SQL que te pasaron y volvé a intentar.' : 'Error: ' + err.message, 'error');
    }
  };

  const cambiarWhatsapp = async () => {
    const nuevo = !whatsappActivo;
    const aviso = nuevo
      ? '¿Activar las funciones de WhatsApp? (botón flotante de ayuda, avisos por WhatsApp y celular obligatorio en el portal)'
      : '¿Desactivar TODAS las funciones de WhatsApp?\n\n• Se oculta el botón flotante de ayuda.\n• Se ocultan los botones de aviso por WhatsApp en el panel.\n• El celular deja de ser obligatorio en el portal.';
    if (!window.confirm(aviso)) return;
    try {
      let resultado;
      if (config.id) {
        resultado = await supabase.from('configuracion').update({ whatsapp_activo: nuevo }).eq('id', config.id);
      } else {
        resultado = await supabase.from('configuracion').insert({ estado_etapa: config.estado_etapa || 'abierta', cupo_base: cupoBaseDe(config), whatsapp_activo: nuevo });
      }
      if (resultado.error) throw resultado.error;
      await registrarLog('CONFIGURACION', 'WhatsApp', nuevo ? 'Se activaron las funciones de WhatsApp.' : 'Se desactivaron todas las funciones de WhatsApp.');
      await recargar();
      notify(nuevo ? 'Funciones de WhatsApp activadas.' : 'Funciones de WhatsApp desactivadas.');
    } catch (err) {
      const faltaColumna = /whatsapp_activo/i.test(err.message || '') || err.code === 'PGRST204' || err.code === '42703';
      notify(faltaColumna ? 'Falta crear la columna "whatsapp_activo" en Supabase. Ejecutá el SQL que te pasaron y volvé a intentar.' : 'Error: ' + err.message, 'error');
    }
  };

  const exportarCSV = (tipo) => {
    const est = (x) => (x.activo === false ? 'NO ASISTE' : 'Asiste');
    const si = (v) => (v ? 'SI' : 'NO');
    let filas = [];
    let nombreArchivo = '';
    if (tipo === 'egresados') {
      filas = [['DNI', 'Nombre Completo', 'División', 'Orientación', 'Celular', 'Cupo Asignado', 'Invitados cargados', 'Estado', 'Asistió']];
      egresados.forEach((e) => filas.push([e.dni, e.nombre_completo, e.division || '', e.orientacion || '', e.celular || '', cupoDe(e, config), invitados.filter((i) => i.egresado_id === e.id).length, est(e), si(e.asistio)]));
      nombreArchivo = 'padron-egresados-esrn5.csv';
    } else if (tipo === 'docentes') {
      filas = [['DNI', 'Nombre Completo', 'Ocupa butaca', 'Estado', 'Asistió']];
      docentes.forEach((d) => filas.push([d.dni, d.nombre_completo, d.ocupa_butaca === false ? 'NO' : 'SI', est(d), si(d.asistio)]));
      nombreArchivo = 'padron-docentes-esrn5.csv';
    } else if (tipo === 'vip') {
      filas = [['DNI', 'Nombre e Institución', 'Movilidad reducida', 'Estado', 'Asistió']];
      especiales.forEach((v) => filas.push([v.dni || 'S/D', v.nombre_completo, tieneMovilidad(v) ? 'SI' : '', est(v), si(v.asistio)]));
      nombreArchivo = 'padron-vip-esrn5.csv';
    }
    descargarCSV(nombreArchivo, filas);
    notify(`Exportado ${nombreArchivo} con éxito.`);
  };

  const importarPersonas = async (ev, { tabla, modulo, plural, dniObligatorio, detectarButaca = false, existentes, armar }) => {
    const archivo = ev.target.files?.[0];
    if (!archivo) return;
    ev.target.value = '';
    const idsCreados = [];
    try {
      const texto = await archivo.text();
      const a = analizarCSVPersonas(texto, { dniObligatorio, detectarButaca });
      if (a.error) { notify(a.error, 'error'); return; }
      const dnisActuales = new Set(existentes.map((x) => String(x.dni || '')).filter(Boolean));
      const nuevos = a.items.filter((x) => !x.dni || !dnisActuales.has(x.dni));
      const yaExisten = a.items.length - nuevos.length;
      if (nuevos.length === 0) {
        notify(`No hay ${plural} nuevos para importar${yaExisten ? ` (${yaExisten} ya estaban cargados)` : ''}.`, 'error');
        return;
      }
      const ejemplos = nuevos.slice(0, 5).map((x, k) => `${k + 1}) ${x.nombre}${x.dni ? ' — DNI ' + x.dni : ''}`).join('\n');
      const lineas = [`Se van a importar ${nuevos.length} ${plural} NUEVOS.`, '', a.columnas];
      if (yaExisten) lineas.push(`Ya estaban cargados y se omiten (no se pisan): ${yaExisten}`);
      if (a.descartadas) lineas.push(`Filas descartadas (sin ${dniObligatorio ? 'DNI válido o ' : ''}nombre): ${a.descartadas}`);
      if (a.duplicadasEnArchivo) lineas.push(`Repetidas dentro del archivo (se toma la primera): ${a.duplicadasEnArchivo}`);
      if (a.unaPalabra) lineas.push(`Atención: ${a.unaPalabra} nombre(s) tienen una sola palabra (¿falta el apellido o el nombre?).`);
      if (detectarButaca) {
        const sinB = nuevos.filter((x) => x.sinButaca).length;
        lineas.push(a.columnas.includes('Butaca:') ? `Sin butaca (de los nuevos): ${sinB} · con butaca: ${nuevos.length - sinB}` : 'No se encontró columna "Butaca": todos entran CON butaca.');
      }
      lineas.push('', 'Ejemplos:', ejemplos, '', 'Si los ejemplos están mal, tocá Cancelar: no se carga nada.', '¿Importar?');
      if (!window.confirm(lineas.join('\n'))) {
        notify('Importación cancelada. No se cargó nada.', 'warning');
        return;
      }
      for (let k = 0; k < nuevos.length; k += 100) {
        const lote = nuevos.slice(k, k + 100).map(armar);
        const { data, error } = await supabase.from(tabla).insert(lote).select('id');
        if (error) throw error;
        (data || []).forEach((r) => idsCreados.push(r.id));
      }
      await registrarLog('IMPORTAR_CSV', modulo, `Se importaron ${idsCreados.length} ${plural} nuevos. [IDS:${idsCreados.join(',')}]`);
      await recargar();
      notify(`Importados ${idsCreados.length} ${plural}.${yaExisten ? ` (${yaExisten} ya estaban cargados y no se tocaron)` : ''}`);
    } catch (err) {
      if (idsCreados.length > 0) {
        await registrarLog('IMPORTAR_CSV', modulo, `Importación INCOMPLETA: se cargaron ${idsCreados.length} ${plural} antes del error. [IDS:${idsCreados.join(',')}]`);
      }
      await recargar();
      notify('Error importando CSV: ' + err.message + (idsCreados.length ? ` (se alcanzaron a cargar ${idsCreados.length}; podés usar "Deshacer última importación")` : ''), 'error');
    }
  };

  const handleImportarCSVEgresados = (ev) => importarPersonas(ev, {
    tabla: 'egresados', modulo: 'Egresados', plural: 'egresados', dniObligatorio: true, existentes: egresados,
    armar: (x) => ({ dni: x.dni, nombre_completo: x.nombre, cupo_asignado: cupoBaseDe(config), cerrado: false, activo: true }),
  });
  const handleImportarCSVDocentes = (ev) => importarPersonas(ev, {
    tabla: 'docentes', modulo: 'Docentes', plural: 'docentes', dniObligatorio: true, detectarButaca: true, existentes: docentes,
    armar: (x) => ({ dni: x.dni, nombre_completo: x.nombre, asistio: false, activo: true, ...(x.sinButaca ? { ocupa_butaca: false } : {}) }),
  });
  const handleImportarCSVVips = (ev) => importarPersonas(ev, {
    tabla: 'invitados_especiales', modulo: 'VIP', plural: 'invitados VIP', dniObligatorio: false, existentes: especiales,
    armar: (x) => ({ dni: x.dni || null, nombre_completo: x.nombre, asistio: false, activo: true }),
  });

  // Deshacer la última importación (usa los ids guardados en el registro de actividad; solo admin)
  const ultimaImportacion = (modulo) => {
    for (const l of logsSistema) {
      if (l.modulo !== modulo) continue;
      if (l.accion === 'DESHACER_IMPORTACION') return null;
      if (l.accion === 'IMPORTAR_CSV') {
        const m = /\[IDS:([^\]]+)\]/.exec(l.detalle || '');
        return m ? { log: l, ids: m[1].split(',').filter(Boolean) } : null;
      }
    }
    return null;
  };

  const deshacerImportacion = async (modulo, tabla, plural) => {
    const imp = ultimaImportacion(modulo);
    if (!imp) return;
    const cuando = new Date(imp.log.created_at).toLocaleString('es-AR');
    const extra = tabla === 'egresados' ? '\n\nTambién se eliminan los invitados que esos egresados hayan cargado.' : '';
    if (!window.confirm(`¿Deshacer la última importación de ${plural}?\n\nSe van a ELIMINAR ${imp.ids.length} registros cargados el ${cuando}.${extra}`)) return;
    try {
      for (let k = 0; k < imp.ids.length; k += 40) {
        const lote = imp.ids.slice(k, k + 40);
        if (tabla === 'egresados') {
          const { error: e0 } = await supabase.from('invitados').delete().in('egresado_id', lote);
          if (e0) throw e0;
        }
        const { error } = await supabase.from(tabla).delete().in('id', lote);
        if (error) throw error;
      }
      await registrarLog('DESHACER_IMPORTACION', modulo, `Se eliminaron ${imp.ids.length} ${plural} de la importación del ${cuando}.`);
      await recargar();
      notify(`Importación deshecha: ${imp.ids.length} ${plural} eliminados.`);
    } catch (err) {
      notify('Error al deshacer: ' + err.message, 'error');
    }
  };

  const exportarInvitadosCSV = () => {
    const porId = {};
    egresados.forEach((e) => { porId[e.id] = e; });
    const filas = [['N° entrada', 'DNI invitado', 'Nombre invitado', 'Invitado de', 'DNI egresado', 'División', 'Modalidad', 'Movilidad reducida', 'Acceso', 'Presente']];
    invitados.forEach((i) => {
      const anf = porId[i.egresado_id];
      filas.push([i.numero_entrada || '', i.dni || '', i.nombre_completo || '', anf?.nombre_completo || '', anf?.dni || '', anf?.division || '', esGrupal(i) ? 'En grupo' : 'Individual', tieneMovilidad(i) ? 'SI' : '', accesoFamiliaDe(anf), i.asistio ? 'SI' : 'NO']);
    });
    descargarCSV('invitados-de-egresados-esrn5.csv', filas);
  };

  const guardarConfiguracionAforo = async (e) => {
    e.preventDefault();
    setGuardandoConfig(true);
    try {
      if (config.id) {
        const { error: errCfg } = await supabase.from('configuracion').update({ cupo_base: Number(cupoBaseEdit) }).eq('id', config.id);
        if (errCfg) throw errCfg;
      } else {
        const { error: errCfg } = await supabase.from('configuracion').insert({ cupo_base: Number(cupoBaseEdit), estado_etapa: 'abierta' });
        if (errCfg) throw errCfg;
      }
      await registrarLog('CONFIGURACION', 'Aforo', `Cupo base para egresados nuevos: ${Number(cupoBaseEdit)}.`);
      await recargar();
      notify('Cupo base guardado (se usa para los egresados que se agreguen de ahora en más).');
    } catch (err) {
      notify('Error guardando aforo: ' + err.message, 'error');
    } finally {
      setGuardandoConfig(false);
    }
  };

  // ---- Sala: capacidad y sectores ----
  const editarSala = (cambios) => { setSalaEdit((s) => ({ ...s, ...cambios })); setSalaCambiada(true); };
  const editarSector = (idx, cambios) => editarSala({ sectores: salaEdit.sectores.map((s, k) => (k === idx ? { ...s, ...cambios } : s)) });
  const agregarSector = () => editarSala({ sectores: [...salaEdit.sectores, { id: `s${Date.now()}`, nombre: '', grupo: 'familias_cn', filaDesde: 'F12', filaHasta: 'F21', butacaDesde: 1, butacaHasta: 26 }] });
  const quitarSector = (idx) => editarSala({ sectores: salaEdit.sectores.filter((_, k) => k !== idx) });
  const descartarCambiosSala = () => { setSalaEdit({ capacidad: capacidadDe(config), sectores: salaConfigDe(config).sectores }); setSalaCambiada(false); };

  const guardarSala = async () => {
    const cap = Number(salaEdit.capacidad);
    if (!Number.isInteger(cap) || cap < 50 || cap > 2000) { notify('La capacidad tiene que ser un número entero (por ejemplo 517).', 'error'); return; }
    const sectores = salaEdit.sectores.map((s) => ({
      id: s.id, nombre: String(s.nombre || '').trim(), grupo: s.grupo,
      filaDesde: s.filaDesde, filaHasta: s.filaHasta,
      butacaDesde: Math.max(1, Math.min(26, Number(s.butacaDesde) || 1)), butacaHasta: Math.max(1, Math.min(26, Number(s.butacaHasta) || 26)),
    }));
    const vacio = sectores.findIndex((s) => butacasDeSector(s).length === 0);
    if (vacio !== -1) { notify(`El sector #${vacio + 1} no abarca ninguna butaca. Revisá filas y butacas.`, 'error'); return; }
    if (cap !== capacidadDe(config) && !window.confirm(`¿Cambiar la capacidad de la sala de ${capacidadDe(config)} a ${cap} butacas?\n\nCambian las vacantes libres, el simulador de cupo y la Acreditación en Vivo.`)) return;
    setGuardandoSala(true);
    try {
      const sala_config = { capacidad: cap, sectores };
      const resultado = config.id
        ? await supabase.from('configuracion').update({ sala_config }).eq('id', config.id)
        : await supabase.from('configuracion').insert({ estado_etapa: config.estado_etapa || 'abierta', cupo_base: cupoBaseDe(config), sala_config });
      if (resultado.error) throw resultado.error;
      await registrarLog('CONFIGURACION', 'Sala', `Capacidad ${cap} butacas · ${sectores.length} sector(es): ${sectores.map((s) => `${grupoSalaInfo(s.grupo).etiqueta} ${describirSector(s)}`).join('; ') || 'ninguno'}`);
      setSalaCambiada(false);
      await recargar();
      notify('Sala guardada: capacidad y sectores actualizados.');
    } catch (err) {
      const faltaColumna = /sala_config/i.test(err.message || '') || err.code === 'PGRST204' || err.code === '42703';
      notify(faltaColumna ? 'Falta crear la columna "sala_config" en la tabla configuracion (Supabase). Ejecutá el SQL de la tanda 14 y volvé a intentar.' : 'No se pudo guardar la sala: ' + err.message, 'error');
    } finally {
      setGuardandoSala(false);
    }
  };

  const cambiarEtapaGlobalConAdvertencia = (nuevaEtapa) => {
    if (nuevaEtapa === 'cierre_parcial') {
      setModalCierreParcialAbierto(true);
    } else {
      cambiarEtapaGlobalDirecto(nuevaEtapa);
    }
  };

  const cambiarEtapaGlobalDirecto = async (nuevaEtapa) => {
    setModalCierreParcialAbierto(false);
    if (nuevaEtapa === 'cierre_definitivo' && config.estado_etapa !== 'cierre_definitivo' && !window.confirm('¿Pasar a Cierre Definitivo?\n\nNadie va a poder cargar ni modificar invitados (ni con plazas extra aprobadas) y no se reciben más solicitudes. El aforo cuenta solo los invitados cargados.')) return;
    const { error: errEtapa } = config.id
      ? await supabase.from('configuracion').update({ estado_etapa: nuevaEtapa }).eq('id', config.id)
      : await supabase.from('configuracion').insert({ estado_etapa: nuevaEtapa, cupo_base: cupoBaseDe(config) });
    if (errEtapa) { notify('No se pudo cambiar la etapa: ' + errEtapa.message, 'error'); return; }
    await registrarLog('CAMBIO_ETAPA', 'Configuración', `Se cambió la etapa global a: ${nuevaEtapa.toUpperCase()}`);
    await recargar();
    notify(`Etapa actualizada a: ${nuevaEtapa.toUpperCase()}`);
  };

  const crearUsuarioSistema = async (e) => {
    e.preventDefault();
    const nombre = nuevoNombreUsr.trim();
    const email = nuevoEmailUsr.trim().toLowerCase();
    const password = nuevoPassUsr;

    if (!nombre || !email || !password || password.length < 6) {
      notify('Completá todos los campos y una contraseña de al menos 6 caracteres.', 'error');
      return;
    }

    try {
      const tempClient = createTempAuthClient();
      const { error: authError } = await tempClient.auth.signUp({ email, password });
      if (authError) throw authError;

      const { error: dbError } = await supabase.from('usuarios_sistema').insert({
        nombre, email, rol: nuevoRolUsr, activo: true
      });
      if (dbError) throw dbError;

      await registrarLog('CREAR_USUARIO', 'Sistema', `Se creó el usuario ${nombre} (${email})`);
      setNuevoNombreUsr('');
      setNuevoEmailUsr('');
      setNuevoPassUsr('');
      await recargar();
      notify('Usuario creado con éxito.');
    } catch (err) {
      notify('Error al crear usuario: ' + (err.message || err), 'error');
    }
  };

  // ¿Ya hay alguien con ese DNI en la lista? (para no duplicar personas)
  const dniRepetido = (lista, dni, idPropio = null) => {
    const d = sanitizeDNI(dni);
    return d ? lista.find((x) => x.id !== idPropio && sanitizeDNI(x.dni) === d) : null;
  };

  const agregarEgresadoManual = async (e) => {
    e.preventDefault();
    const rep = dniRepetido(egresados, nuevoEgDni);
    if (rep) { notify(`Ya existe un egresado con el DNI ${sanitizeDNI(nuevoEgDni)}: ${rep.nombre_completo}.`, 'error'); return; }
    try {
      const { error: errIns } = await supabase.from('egresados').insert({
        dni: sanitizeDNI(nuevoEgDni),
        nombre_completo: nuevoEgNombre.trim().toUpperCase(),
        cupo_asignado: cupoBaseDe(config),
        ...(nuevoEgOrientacion ? { orientacion: nuevoEgOrientacion } : {}),
        activo: true
      });
      if (errIns) throw errIns;
      await registrarLog('AGREGAR', 'Egresados', `Se agregó al egresado ${nuevoEgNombre.trim().toUpperCase()}`);
      setNuevoEgNombre('');
      setNuevoEgDni('');
      setNuevoEgOrientacion('');
      setModalAgregarEgresado(false);
      await recargar();
      notify('Egresado agregado con éxito.');
    } catch (err) {
      notify('Error al agregar egresado: ' + err.message, 'error');
    }
  };

  const agregarDocenteManual = async (e) => {
    e.preventDefault();
    const rep = dniRepetido(docentes, nuevoDocDni);
    if (rep) { notify(`Ya existe un docente con el DNI ${sanitizeDNI(nuevoDocDni)}: ${rep.nombre_completo}.`, 'error'); return; }
    try {
      const { error: errIns } = await supabase.from('docentes').insert({
        dni: sanitizeDNI(nuevoDocDni),
        nombre_completo: nuevoDocNombre.trim().toUpperCase(),
        activo: true,
        ...(nuevoDocButaca ? {} : { ocupa_butaca: false })
      });
      if (errIns) throw errIns;
      await registrarLog('AGREGAR', 'Docentes', `Se agregó al docente ${nuevoDocNombre.trim().toUpperCase()}${nuevoDocButaca ? '' : ' (sin butaca)'}`);
      setNuevoDocNombre('');
      setNuevoDocDni('');
      setNuevoDocButaca(true);
      setModalAgregarDocente(false);
      await recargar();
      notify('Docente agregado con éxito.');
    } catch (err) {
      notify(esErrorColumnaButaca(err) ? MSG_FALTA_COL_BUTACA : 'Error al agregar docente: ' + err.message, 'error');
    }
  };

  const agregarVipManual = async (e) => {
    e.preventDefault();
    const rep = nuevoVipDni ? dniRepetido(especiales, nuevoVipDni) : null;
    if (rep) { notify(`Ya existe un VIP con el DNI ${sanitizeDNI(nuevoVipDni)}: ${rep.nombre_completo}.`, 'error'); return; }
    try {
      const { error: errIns } = await supabase.from('invitados_especiales').insert({
        dni: nuevoVipDni ? sanitizeDNI(nuevoVipDni) : null,
        nombre_completo: nuevoVipNombre.trim().toUpperCase(),
        ...(nuevoVipMovilidad ? { movilidad_reducida: true } : {}),
        activo: true
      });
      if (errIns) throw errIns;
      await registrarLog('AGREGAR', 'VIP', `Se agregó al VIP ${nuevoVipNombre.trim().toUpperCase()}`);
      setNuevoVipNombre('');
      setNuevoVipDni('');
      setNuevoVipMovilidad(false);
      setModalAgregarVip(false);
      await recargar();
      notify('Invitado VIP agregado con éxito.');
    } catch (err) {
      notify(/movilidad_reducida/i.test(err.message || '') ? 'Falta crear la columna "movilidad_reducida" en invitados_especiales (Supabase). Ejecutá el SQL y volvé a intentar.' : 'Error al agregar VIP: ' + err.message, 'error');
    }
  };

  const abrirModalEditar = (e) => {
    setModalEditarEgr(e);
    setEditNombre(e.nombre_completo || '');
    setEditDni(e.dni || '');
    setEditCelular(e.celular || '');
    setEditCupo(cupoDe(e, config));
    setEditOrientacion(tipoOrientacion(e) === 'cn' ? 'CIENCIAS NATURALES' : tipoOrientacion(e) === 'edu' ? 'EDUCACION' : '');
    setEditDivision(e.division || '');
  };

  const guardarEdicionEgresado = async (e) => {
    e.preventDefault();
    if (!modalEditarEgr) return;
    const rep = dniRepetido(egresados, editDni, modalEditarEgr.id);
    if (rep) { notify(`Ya existe otro egresado con el DNI ${sanitizeDNI(editDni)}: ${rep.nombre_completo}.`, 'error'); return; }
    setGuardandoEdicion(true);
    try {
      const { error: errEgr } = await supabase.from('egresados').update({
        nombre_completo: editNombre.trim().toUpperCase(),
        dni: sanitizeDNI(editDni),
        celular: editCelular.trim(),
        cupo_asignado: Number(editCupo),
        orientacion: editOrientacion || null,
        division: editDivision.trim() || null
      }).eq('id', modalEditarEgr.id);
      if (errEgr) throw errEgr;
      await registrarLog('EDITAR', 'Egresados', `Se editó el egresado ${editNombre.trim().toUpperCase()}`);
      setModalEditarEgr(null);
      await recargar();
      notify('Egresado actualizado correctamente.');
    } catch (err) {
      notify('Error al actualizar: ' + err.message, 'error');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const abrirModalEditarDocente = (d) => {
    setModalEditarDoc(d);
    setEditDocNombre(d.nombre_completo || '');
    setEditDocDni(d.dni || '');
    setEditDocButaca(d.ocupa_butaca !== false);
  };

  const guardarEdicionDocente = async (e) => {
    e.preventDefault();
    if (!modalEditarDoc) return;
    const rep = dniRepetido(docentes, editDocDni, modalEditarDoc.id);
    if (rep) { notify(`Ya existe otro docente con el DNI ${sanitizeDNI(editDocDni)}: ${rep.nombre_completo}.`, 'error'); return; }
    setGuardandoDocente(true);
    try {
      const cambios = {
        nombre_completo: editDocNombre.trim().toUpperCase(),
        dni: sanitizeDNI(editDocDni)
      };
      if (editDocButaca !== (modalEditarDoc.ocupa_butaca !== false)) cambios.ocupa_butaca = editDocButaca;
      const { error: errEd } = await supabase.from('docentes').update(cambios).eq('id', modalEditarDoc.id);
      if (errEd) throw errEd;
      await registrarLog('EDITAR', 'Docentes', `Se editó el docente ${editDocNombre.trim().toUpperCase()}`);
      setModalEditarDoc(null);
      await recargar();
      notify('Docente actualizado correctamente.');
    } catch (err) {
      notify(esErrorColumnaButaca(err) ? MSG_FALTA_COL_BUTACA : 'Error al actualizar docente: ' + err.message, 'error');
    } finally {
      setGuardandoDocente(false);
    }
  };

  const abrirModalEditarVip = (v) => {
    setModalEditarVip(v);
    setEditVipNombre(v.nombre_completo || '');
    setEditVipDni(v.dni || '');
    setEditVipMovilidad(tieneMovilidad(v));
  };

  const guardarEdicionVip = async (e) => {
    e.preventDefault();
    if (!modalEditarVip) return;
    const rep = editVipDni ? dniRepetido(especiales, editVipDni, modalEditarVip.id) : null;
    if (rep) { notify(`Ya existe otro VIP con el DNI ${sanitizeDNI(editVipDni)}: ${rep.nombre_completo}.`, 'error'); return; }
    setGuardandoVip(true);
    try {
      const cambiosVip = {
        nombre_completo: editVipNombre.trim().toUpperCase(),
        dni: editVipDni ? sanitizeDNI(editVipDni) : null
      };
      if (editVipMovilidad !== tieneMovilidad(modalEditarVip)) cambiosVip.movilidad_reducida = editVipMovilidad;
      const { error: errVip } = await supabase.from('invitados_especiales').update(cambiosVip).eq('id', modalEditarVip.id);
      if (errVip) throw errVip;
      await registrarLog('EDITAR', 'VIP', `Se editó el VIP ${editVipNombre.trim().toUpperCase()}`);
      setModalEditarVip(null);
      await recargar();
      notify('Invitado VIP actualizado correctamente.');
    } catch (err) {
      notify(/movilidad_reducida/i.test(err.message || '') ? 'Falta crear la columna "movilidad_reducida" en invitados_especiales (Supabase). Ejecutá el SQL y volvé a intentar.' : 'Error al actualizar VIP: ' + err.message, 'error');
    } finally {
      setGuardandoVip(false);
    }
  };

  // Aprobar total o parcial (se elige cuántas) o rechazar. En cualquier caso la solicitud queda cerrada.
  const resolverSolicitud = async (sol, aprobar) => {
    const pedidas = Number(sol.cantidad_solicitada) || 0;
    const cantidad = aprobar ? Number(cantAprobar[sol.id] ?? pedidas) : 0;
    if (aprobar && (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > pedidas)) {
      notify(`Elegí cuántas butacas aprobar (de 1 a ${pedidas}).`, 'error');
      return;
    }
    const egr = egresados.find((e) => e.id === sol.egresado_id);
    const aviso = aprobar
      ? `¿Aprobar ${cantidad} de ${pedidas} butaca(s) para ${sol.egresado_nombre}?\n\nSe suman ${cantidad} al cupo del egresado y la solicitud queda cerrada.`
      : `¿Rechazar la solicitud de ${sol.egresado_nombre}?\n\nLa solicitud queda cerrada: el egresado no puede volver a pedir.`;
    if (!window.confirm(aviso)) return;
    try {
      const nuevoEstado = aprobar ? 'aprobada' : 'rechazada';
      // Primero se cierra la solicitud (solo si sigue pendiente), así no se suma el cupo dos veces
      const { data: cerrada, error: errEstado } = await supabase.from('solicitudes_butacas')
        .update({ estado: nuevoEstado, cantidad_aprobada: cantidad })
        .eq('id', sol.id).eq('estado', 'pendiente').select('id');
      if (errEstado) throw errEstado;
      if (!cerrada || cerrada.length === 0) {
        await recargar();
        notify('Esta solicitud ya había sido resuelta (por otra persona o en otra pestaña).', 'warning');
        return;
      }
      if (aprobar && egr) {
        const nuevoCupo = cupoDe(egr, config) + cantidad;
        const { error: errCupo } = await supabase.from('egresados').update({ cupo_asignado: nuevoCupo }).eq('id', egr.id);
        if (errCupo) {
          await recargar();
          notify(`La solicitud quedó aprobada, pero NO se pudo sumar el cupo (${errCupo.message}). Sumá ${cantidad} a mano desde "Editar" del egresado.`, 'error');
          return;
        }
      }
      await registrarLog('SOLICITUD', 'Butacas', aprobar ? `Se aprobaron ${cantidad} de ${pedidas} butaca(s) extra para ${sol.egresado_nombre}` : `Se rechazó la solicitud de butacas de ${sol.egresado_nombre}`);
      await recargar();
      notify(aprobar ? `Solicitud aprobada: +${cantidad} butaca(s).` : 'Solicitud rechazada.');
    } catch (err) {
      const faltaColumna = /cantidad_aprobada/i.test(err.message || '');
      notify(faltaColumna ? 'Falta crear la columna "cantidad_aprobada" en solicitudes_butacas (Supabase). Ejecutá el SQL y volvé a intentar.' : 'Error al procesar solicitud: ' + err.message, 'error');
    }
  };

  const vaciarPadronEgresados = async () => {
    const resp = window.prompt("Para confirmar el vaciado total, escribí VACIAR en mayúsculas:");
    if (resp !== 'VACIAR') return;
    try {
      const todos = (q) => q.neq('id', '00000000-0000-0000-0000-000000000000');
      const r1 = await todos(supabase.from('invitados').delete());
      if (r1.error) throw r1.error;
      const r2 = await todos(supabase.from('solicitudes_butacas').delete());
      if (r2.error) throw r2.error;
      const r3 = await todos(supabase.from('egresados').delete());
      if (r3.error) throw r3.error;
      await registrarLog('VACIAR', 'Egresados', 'Se vació todo el padrón de egresados, sus invitados y sus solicitudes de butacas.');
      await recargar();
      notify('Padrón vaciado correctamente.');
    } catch (err) {
      notify('Error al vaciar padrón: ' + err.message, 'error');
    }
  };

  const alternarNoAsiste = async (tabla, item, etiqueta) => {
    if (!item) return;
    const nuevoActivo = item.activo === false;
    if (!nuevoActivo && !window.confirm(`¿Marcar a ${item.nombre_completo} como "No asiste"? Se libera su plaza en el aforo y no podrá ingresar por Puerta.`)) return;
    try {
      const { error } = await supabase.from(tabla).update({ activo: nuevoActivo }).eq('id', item.id);
      if (error) throw error;
      await registrarLog(nuevoActivo ? 'REACTIVAR' : 'NO_ASISTE', etiqueta, `${nuevoActivo ? 'Se reactivó a' : 'Se marcó como No Asiste a'} ${item.nombre_completo}`);
      if (tabla === 'egresados') setModalEditarEgr(null);
      if (tabla === 'docentes') setModalEditarDoc(null);
      if (tabla === 'invitados_especiales') setModalEditarVip(null);
      await recargar();
      notify(nuevoActivo ? 'Reactivado: vuelve a ocupar su plaza.' : 'Marcado como No Asiste: su plaza quedó libre.');
    } catch (err) {
      notify('Error: ' + err.message, 'error');
    }
  };

  const alternarButacaDocente = async (d) => {
    const nuevo = d.ocupa_butaca === false; // si no ocupaba butaca, pasa a ocuparla
    try {
      const { error } = await supabase.from('docentes').update({ ocupa_butaca: nuevo }).eq('id', d.id);
      if (error) throw error;
      await registrarLog('EDITAR', 'Docentes', `${nuevo ? 'Ocupa butaca' : 'No ocupa butaca'}: ${d.nombre_completo}`);
      await recargar();
    } catch (err) {
      notify(esErrorColumnaButaca(err) ? MSG_FALTA_COL_BUTACA : 'Error: ' + err.message, 'error');
    }
  };

  const asignarButacaMasivo = async (valor) => {
    const objetivo = docentes.filter((d) => d.activo !== false);
    if (objetivo.length === 0) return;
    if (!window.confirm(`¿Marcar a los ${objetivo.length} docentes activos como "${valor ? 'CON' : 'SIN'} butaca"?\n\nDespués podés ajustar uno por uno con la etiqueta de cada fila.`)) return;
    try {
      const ids = objetivo.map((d) => d.id);
      for (let k = 0; k < ids.length; k += 40) {
        const { error } = await supabase.from('docentes').update({ ocupa_butaca: valor }).in('id', ids.slice(k, k + 40));
        if (error) throw error;
      }
      await registrarLog('EDITAR', 'Docentes', `Se marcó a ${ids.length} docentes como ${valor ? 'CON' : 'SIN'} butaca.`);
      await recargar();
      notify(`Listo: ${ids.length} docentes marcados como ${valor ? 'con' : 'sin'} butaca.`);
    } catch (err) {
      notify(esErrorColumnaButaca(err) ? MSG_FALTA_COL_BUTACA : 'Error: ' + err.message, 'error');
    }
  };

  const eliminarEgresado = async (egr) => {
    if (!egr) return;
    if (!window.confirm(`¿Eliminar a ${egr.nombre_completo} (DNI ${egr.dni}), todos sus invitados cargados y su solicitud de butacas? Esta acción no se puede deshacer.`)) return;
    try {
      const { error: e1 } = await supabase.from('invitados').delete().eq('egresado_id', egr.id);
      if (e1) throw e1;
      const { error: e1b } = await supabase.from('solicitudes_butacas').delete().eq('egresado_id', egr.id);
      if (e1b) throw e1b;
      const { error: e2 } = await supabase.from('egresados').delete().eq('id', egr.id);
      if (e2) throw e2;
      await registrarLog('ELIMINAR', 'Egresados', `Se eliminó al egresado ${egr.nombre_completo} (DNI ${egr.dni})`);
      setModalEditarEgr(null);
      await recargar();
      notify('Egresado eliminado.');
    } catch (err) {
      notify('Error al eliminar egresado: ' + err.message, 'error');
    }
  };

  const eliminarDocente = async (doc) => {
    if (!doc) return;
    if (!window.confirm(`¿Eliminar a ${doc.nombre_completo} (DNI ${doc.dni})? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabase.from('docentes').delete().eq('id', doc.id);
      if (error) throw error;
      await registrarLog('ELIMINAR', 'Docentes', `Se eliminó al docente ${doc.nombre_completo} (DNI ${doc.dni})`);
      setModalEditarDoc(null);
      await recargar();
      notify('Docente eliminado.');
    } catch (err) {
      notify('Error al eliminar docente: ' + err.message, 'error');
    }
  };

  const eliminarVip = async (vip) => {
    if (!vip) return;
    if (!window.confirm(`¿Eliminar a ${vip.nombre_completo}? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabase.from('invitados_especiales').delete().eq('id', vip.id);
      if (error) throw error;
      await registrarLog('ELIMINAR', 'VIP', `Se eliminó al invitado VIP ${vip.nombre_completo}`);
      setModalEditarVip(null);
      await recargar();
      notify('Invitado VIP eliminado.');
    } catch (err) {
      notify('Error al eliminar VIP: ' + err.message, 'error');
    }
  };

  const vaciarPadronDocentes = async () => {
    const resp = window.prompt("Para confirmar el vaciado total del padrón de docentes, escribí VACIAR en mayúsculas:");
    if (resp !== 'VACIAR') return;
    try {
      const { error } = await supabase.from('docentes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      await registrarLog('VACIAR', 'Docentes', 'Se vació todo el padrón de docentes.');
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
      const { error } = await supabase.from('invitados_especiales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      await registrarLog('VACIAR', 'VIP', 'Se vació todo el padrón VIP.');
      await recargar();
      notify('Padrón VIP vaciado correctamente.');
    } catch (err) {
      notify('Error al vaciar VIP: ' + err.message, 'error');
    }
  };

  const totalFilas = config.filas || 15;
  const butacasPorFila = config.butacas_por_fila || 35;

  const egresadosPresentesCount = egresados.filter(e => e.asistio).length;
  const invitadosPresentesCount = invitados.filter(i => i.asistio).length;
  const docentesPresentesCount = docentes.filter(d => d.asistio).length;
  const vipsPresentesCount = especiales.filter(v => v.asistio).length;
  const totalAsistentesPresentes = egresadosPresentesCount + invitadosPresentesCount + docentesPresentesCount + vipsPresentesCount;
  const docentesSinButacaPresentes = docentes.filter((d) => d.asistio && d.ocupa_butaca === false).length;
  const butacasOcupadasPresentes = totalAsistentesPresentes - docentesSinButacaPresentes;

  const exportarReporteAsistencia = async () => {
    try {
      const XLSX = await import('xlsx');
      const si = (v) => (v ? 'SI' : 'NO');
      const hora = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR'); };
      const porId = {};
      egresados.forEach((e) => { porId[e.id] = e; });

      const hojaEgresados = egresados.map((e) => {
        const susInv = invitados.filter((i) => i.egresado_id === e.id);
        return { DNI: e.dni, 'Nombre completo': e.nombre_completo, 'División': e.division || '', 'Orientación': e.orientacion || '', Estado: e.activo === false ? 'NO ASISTE' : 'Asiste', Presente: si(e.asistio), 'Hora de ingreso': e.asistio ? hora(e.hora_ingreso_real) : '', 'Cupo asignado': e.cupo_asignado ?? '', 'Invitados cargados': susInv.length, 'Invitados presentes': susInv.filter((i) => i.asistio).length };
      });
      const hojaFamiliares = invitados.map((i) => ({ 'N° entrada': i.numero_entrada || '', DNI: i.dni || '', 'Nombre completo': i.nombre_completo, 'Invitado de': porId[i.egresado_id]?.nombre_completo || '', Modalidad: esGrupal(i) ? 'En grupo' : 'Individual', 'Movilidad reducida': tieneMovilidad(i) ? 'SI' : '', Acceso: accesoFamiliaDe(porId[i.egresado_id]), Presente: si(i.asistio), 'Hora de ingreso': i.asistio ? hora(i.hora_ingreso) : '' }));
      const hojaDocentes = docentes.map((d) => ({ DNI: d.dni, 'Nombre completo': d.nombre_completo, Estado: d.activo === false ? 'NO ASISTE' : 'Asiste', 'Ocupa butaca': d.ocupa_butaca === false ? 'NO' : 'SI', Presente: si(d.asistio), 'Hora de ingreso': d.asistio ? hora(d.hora_ingreso_real) : '' }));
      const hojaVip = especiales.map((v) => ({ DNI: v.dni || '', 'Nombre e institución': v.nombre_completo, 'Movilidad reducida': tieneMovilidad(v) ? 'SI' : '', Estado: v.activo === false ? 'NO ASISTE' : 'Asiste', Presente: si(v.asistio), 'Hora de ingreso': v.asistio ? hora(v.hora_ingreso_real) : '' }));

      const resumen = [
        { Concepto: 'Egresados presentes', Cantidad: egresadosPresentesCount, 'De un total de': totalEgresados },
        { Concepto: 'Familiares presentes', Cantidad: invitadosPresentesCount, 'De un total de': invitados.length },
        { Concepto: 'Docentes presentes', Cantidad: docentesPresentesCount, 'De un total de': totalDocentes },
        { Concepto: '   de ellos, docentes sin butaca', Cantidad: docentesSinButacaPresentes, 'De un total de': totalDocentesSinButaca },
        { Concepto: 'VIP / autoridades presentes', Cantidad: vipsPresentesCount, 'De un total de': totalEspeciales },
        { Concepto: 'TOTAL de personas presentes', Cantidad: totalAsistentesPresentes, 'De un total de': '' },
        { Concepto: 'BUTACAS ocupadas', Cantidad: butacasOcupadasPresentes, 'De un total de': CAPACIDAD },
        { Concepto: 'Reporte generado el', Cantidad: new Date().toLocaleString('es-AR'), 'De un total de': '' },
      ];

      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(resumen), 'Resumen');
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(hojaEgresados), 'Egresados');
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(hojaFamiliares), 'Familiares');
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(hojaDocentes), 'Docentes');
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(hojaVip), 'VIP');
      const f = new Date();
      const nombre = `reporte-asistencia-esrn5-${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}.xlsx`;
      XLSX.writeFile(libro, nombre);
      notify(`Reporte descargado: ${nombre}`);
    } catch (err) {
      console.error(err);
      notify('No se pudo generar el reporte: ' + err.message, 'error');
    }
  };


  const normTxt = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const coincideBusqueda = (item, q) => {
    const texto = normTxt(q);
    if (!texto) return true;
    const soloDigitos = String(q).replace(/\D/g, '');
    return normTxt(item.nombre_completo).includes(texto) || (soloDigitos.length > 0 && String(item.dni || '').includes(soloDigitos));
  };
  const egresadosFiltrados = egresados.filter((e) => coincideBusqueda(e, filtroEgresado));
  const docentesFiltrados = docentes.filter((d) => coincideBusqueda(d, filtroDocente));
  const vipsFiltrados = especiales.filter((v) => coincideBusqueda(v, filtroVip));
  const logsFiltrados = logsSistema.filter((l) => (l.usuario || '').toLowerCase().includes(filtroLogBusqueda.toLowerCase()) || (l.accion || '').toLowerCase().includes(filtroLogBusqueda.toLowerCase()) || (l.modulo || '').toLowerCase().includes(filtroLogBusqueda.toLowerCase()) || (l.detalle || '').toLowerCase().includes(filtroLogBusqueda.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Egresados</p><p className="text-2xl font-extrabold">{totalEgresados}</p></div>
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Docentes</p><p className="text-2xl font-extrabold">{totalDocentes}</p><p className="text-[10px] text-slate-500 mt-0.5">{totalDocentesConButaca} con butaca · {totalDocentesSinButaca} sin</p></div>
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Especiales / VIP</p><p className="text-2xl font-extrabold">{totalEspeciales}</p></div>
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Plazas Familiares</p><p className="text-2xl font-extrabold">{totalCuposFamiliares}</p>{(config.estado_etapa || 'abierta') !== 'abierta' && <p className="text-[10px] text-slate-500 mt-0.5">cargadas + extras aprobadas</p>}</div>
        <div className={`col-span-2 sm:col-span-1 p-4 rounded-2xl border ${vacantesLibres < 0 ? 'bg-rose-50 text-rose-700' : vacantesLibres <= 25 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
          <p className="text-xs font-semibold">Vacantes Libres ({CAPACIDAD} máx)</p><p className="text-2xl font-extrabold">{vacantesLibres}</p>
          {vacantesLibres < 0 && <p className="text-[10px] font-bold mt-0.5">Cupos asignados por encima del aforo</p>}
          {vacantesLibres >= 0 && vacantesLibres <= 25 && <p className="text-[10px] font-bold mt-0.5">Quedan pocas vacantes</p>}
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Etapa Global de Carga</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {(config.estado_etapa || 'abierta') === 'abierta' && 'Los egresados pueden cargar y modificar invitados. Cada uno ocupa su cupo completo.'}
            {config.estado_etapa === 'cierre_parcial' && 'Solo editan los egresados con plazas extra aprobadas. Al resto se le cuentan solo los invitados cargados: los cupos sin usar quedan libres.'}
            {config.estado_etapa === 'cierre_definitivo' && 'Nadie puede modificar invitados. El aforo cuenta solo los invitados cargados.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => cambiarEtapaGlobalDirecto('abierta')} className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${config.estado_etapa === 'abierta' ? 'bg-[#6B1D2F] text-white shadow' : 'bg-slate-100 text-slate-700'}`}>Abierta</button>
          <button onClick={() => cambiarEtapaGlobalConAdvertencia('cierre_parcial')} className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${config.estado_etapa === 'cierre_parcial' ? 'bg-amber-600 text-white shadow' : 'bg-slate-100 text-slate-700'}`}>Cierre Parcial</button>
          <button onClick={() => cambiarEtapaGlobalDirecto('cierre_definitivo')} className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${config.estado_etapa === 'cierre_definitivo' ? 'bg-rose-600 text-white shadow' : 'bg-slate-100 text-slate-700'}`}>Definitivo</button>
        </div>
      </div>

      {modalCierreParcialAbierto && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <h3 className="text-lg font-extrabold text-slate-900">⚠️ Advertencia de Cierre Parcial</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              Al activar la etapa de <b>Cierre Parcial</b>, ocurrirán los siguientes cambios operativos en el sistema:
            </p>
            <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1.5">
              <li>Los egresados <b>sin plazas extra aprobadas</b> ya no podrán cargar ni modificar invitados.</li>
              <li>A esos egresados se les cuentan en el aforo <b>solo los invitados que cargaron</b>: los cupos que no usaron <b>quedan libres</b> para reasignar (por ejemplo, aprobando solicitudes de butacas extra).</li>
              <li>Los egresados <b>con plazas extra aprobadas</b> pueden seguir entrando al portal para completar sus invitados.</li>
              {whatsappActivo && <li>Podrás notificar por WhatsApp a los alumnos beneficiados para que vuelvan a ingresar al portal y completen sus cupos adicionales.</li>}
              <li>Si volvés a la etapa <b>Abierta</b>, todo vuelve a como estaba (no se borra nada).</li>
            </ul>
            <div className="flex gap-3 pt-3 border-t">
              <button onClick={() => setModalCierreParcialAbierto(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer">Cancelar</button>
              <button onClick={() => cambiarEtapaGlobalDirecto('cierre_parcial')} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow cursor-pointer">Entendido, Activar Cierre Parcial</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab('egresados')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'egresados' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Egresados ({egresados.length})</button>
        <button onClick={() => setTab('invitados')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'invitados' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Invitados de egresados ({invitados.length})</button>
        <button onClick={() => setTab('docentes')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'docentes' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Docentes ({docentes.length})</button>
        <button onClick={() => setTab('vip')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'vip' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Invitados VIP ({especiales.length})</button>
        <button onClick={() => setTab('solicitudes')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'solicitudes' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Solicitudes Butacas ({solicitudes.length})</button>
        <button onClick={() => setTab('reportes')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'reportes' ? 'bg-[#6B1D2F] text-white' : 'bg-white border'}`}>Acreditación en Vivo</button>
        <button onClick={() => setTab('aforo')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'aforo' ? 'bg-indigo-700 text-white shadow' : 'bg-white border'}`}>⚙️ Aforo y Sala</button>
        <button onClick={abrirResumenPapel} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer bg-indigo-700 hover:bg-indigo-800 text-white flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Resumen Papel</button>
        {perfilStaff?.rol === 'admin' && (
          <button onClick={() => setTab('usuarios')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'usuarios' ? 'bg-emerald-600 text-white' : 'bg-white border'}`}>Usuarios del Sistema ({usuariosSistema.length})</button>
        )}
      </div>

      {tab === 'egresados' && (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-bold">Padrón de Egresados</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => exportarCSV('egresados')} className="px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer"><Download className="w-4 h-4" /> Exportar CSV</button>
              <button onClick={() => setModalAgregarEgresado(true)} className="px-3.5 py-2 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow cursor-pointer"><Plus className="w-4 h-4" /> Agregar Egresado</button>
              <input ref={fileEgrRef} type="file" accept=".csv,.txt" onChange={handleImportarCSVEgresados} className="hidden" />
              <button onClick={() => fileEgrRef.current?.click()} className="px-3 py-2 bg-indigo-50 text-indigo-700 border rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"><Upload className="w-4 h-4" /> Importar CSV</button>
              {perfilStaff?.rol === 'admin' && ultimaImportacion('Egresados') && (
                <button onClick={() => deshacerImportacion('Egresados', 'egresados', 'egresados')} className="px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold cursor-pointer">↩ Deshacer última importación ({ultimaImportacion('Egresados').ids.length})</button>
              )}
              {perfilStaff?.rol === 'admin' && egresados.length > 0 && <button onClick={vaciarPadronEgresados} className="px-3 py-2 bg-rose-50 text-rose-700 border rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"><Trash2 className="w-4 h-4" /> Vaciar Padrón</button>}
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input type="text" placeholder="Buscar egresado por nombre o DNI..." value={filtroEgresado} onChange={(e) => setFiltroEgresado(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none focus:border-[#6B1D2F]" />
          </div>

          <div className="max-h-96 overflow-y-auto divide-y">
            {egresadosFiltrados.length === 0 && <p className="text-center text-slate-400 text-sm py-6">No se encontraron egresados.</p>}
            {egresadosFiltrados.map((e) => {
              const misInvitados = invitados.filter((i) => i.egresado_id === e.id);
              const numeroWp = e.celular ? e.celular.replace(/\D/g, '') : '';
              const linkWpAdicionales = numeroWp ? `https://wa.me/549${numeroWp}?text=${encodeURIComponent(`Hola ${e.nombre_completo}, te escribimos de la ESRN N° 005 por el Acto de Colación. Por favor ingresá al portal con tu DNI para revisar tus invitados y tus pases.`)}` : '';

              return (
                <div key={e.id} className="py-3 flex flex-wrap justify-between items-center gap-3 text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{e.nombre_completo}</span> <span className="text-xs text-slate-500">({e.dni})</span> {e.activo === false && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-bold">NO ASISTE</span>}
                      {!whatsappActivo ? null : numeroWp ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">📱 Con WhatsApp</span> : <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px]">Sin Celular</span>}
                    </div>
                    <p className="text-xs text-slate-400">
                      {textoCurso(e) ? <span className="font-semibold" style={{ color: colorFamiliaDe(e) }}>{textoCurso(e)} · </span> : <span className="font-semibold text-rose-600">Sin orientación · </span>}
                      Invitados cargados: <b>{misInvitados.length} / {e.cupo_asignado}</b>
                      {misInvitados.some(tieneMovilidad) && <span className="ml-1">· ♿ {misInvitados.filter(tieneMovilidad).length}</span>}
                      {tieneExtraAprobada(e, solicitudes) && <span className="ml-1 font-bold text-emerald-700">· Extra aprobada</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => abrirModalEditar(e)} className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"><Edit2 className="w-3.5 h-3.5" /> Editar y Descargar QR</button>
                    {whatsappActivo && numeroWp && <a href={linkWpAdicionales} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> Avisar WhatsApp</a>}
                    <span className="text-xs font-bold bg-slate-100 px-2.5 py-1 rounded-lg">Cupo: {e.cupo_asignado}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modalAgregarEgresado && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border">
            <div className="bg-[#6B1D2F] text-white p-4 flex justify-between items-center">
              <h3 className="font-bold text-base">Agregar Nuevo Egresado</h3>
              <button onClick={() => setModalAgregarEgresado(false)} className="p-1 rounded-lg text-white/80 hover:bg-white/10 cursor-pointer">
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
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Orientación</label>
                <select value={nuevoEgOrientacion} onChange={(e) => setNuevoEgOrientacion(e.target.value)} className="w-full px-3 py-2 bg-white border rounded-xl text-sm">
                  <option value="">(sin cargar)</option>
                  {ORIENTACIONES.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalAgregarEgresado(false)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold cursor-pointer">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold shadow cursor-pointer">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalEditarEgr && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border">
            <div className="bg-[#6B1D2F] text-white p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">Editar Egresado y Descargar Pases QR</h3>
                <p className="text-xs text-rose-100">Modificá datos y descargá pases en 1080x1920.</p>
              </div>
              <button onClick={() => setModalEditarEgr(null)} className="p-1.5 rounded-lg text-white/80 hover:bg-white/10 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={guardarEdicionEgresado} className="p-5 space-y-3.5 max-h-[80vh] overflow-y-auto">
              <div className="p-3 bg-slate-50 border rounded-xl flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-sm text-slate-900">QR del Egresado</p>
                  <p className="text-[11px] text-slate-500">Solo el egresado · {ACCESO_TEXTO.egresados.toLowerCase()}</p>
                </div>
                <button type="button" onClick={() => paseEgresado(modalEditarEgr, config)} className="px-3.5 py-2 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"><Download className="w-4 h-4" /> Descargar QR</button>
              </div>
              {(() => {
                const grupo = invitados.filter((i) => i.egresado_id === modalEditarEgr.id && esGrupal(i));
                if (grupo.length === 0) return null;
                return (
                  <div className="p-3 border-2 rounded-xl flex items-center justify-between gap-2" style={{ borderColor: colorFamiliaDe(modalEditarEgr) }}>
                    <div>
                      <p className="font-bold text-sm" style={{ color: colorFamiliaDe(modalEditarEgr) }}>QR del Grupo Familiar ({grupo.length})</p>
                      <p className="text-[11px] text-slate-500">{grupo.map((g) => g.nombre_completo + (tieneMovilidad(g) ? ' ♿' : '')).join(', ')}</p>
                    </div>
                    <button type="button" onClick={() => paseGrupo(modalEditarEgr, grupo, config)} className="px-3.5 py-2 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0" style={{ backgroundColor: colorFamiliaDe(modalEditarEgr) }}><Download className="w-4 h-4" /> Descargar QR</button>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre y Apellido</label>
                <input type="text" required value={editNombre} onChange={(e) => setEditNombre(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">DNI (8 dígitos)</label>
                <input type="text" required maxLength={8} value={editDni} onChange={(e) => setEditDni(sanitizeDNI(e.target.value))} className="w-full px-3 py-2 border rounded-xl text-sm font-mono" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Celular{whatsappActivo ? ' / WhatsApp' : ''} <span className="text-slate-500">(opcional; el egresado lo carga en el portal)</span></label>
                <input type="text" value={editCelular} onChange={(e) => setEditCelular(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Orientación</label>
                  <select value={editOrientacion} onChange={(e) => setEditOrientacion(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm bg-white">
                    <option value="">(sin cargar)</option>
                    {ORIENTACIONES.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">División</label>
                  <input type="text" placeholder="Ej: 5° 1ª TT" value={editDivision} onChange={(e) => setEditDivision(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" />
                </div>
              </div>
              <p className="text-[11px] text-slate-500 -mt-1">Familia: {accesoFamiliaDe({ orientacion: editOrientacion }).toLowerCase()}</p>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cupo Asignado</label>
                <input type="number" min="0" max="10" required value={editCupo} onChange={(e) => setEditCupo(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" />
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs font-bold text-slate-700 mb-2">Invitados cargados:</p>
                <div className="max-h-44 overflow-y-auto space-y-2 bg-slate-50 p-2.5 rounded-xl border text-xs">
                  {invitados.filter((i) => i.egresado_id === modalEditarEgr.id).map((inv, i) => (
                    <div key={inv.id} className="flex justify-between items-center bg-white p-2.5 rounded-lg border gap-2">
                      <div>
                        <p className="font-bold text-slate-900"><b>#{i+1}</b> {inv.nombre_completo}{tieneMovilidad(inv) ? ' ♿' : ''}</p>
                        <p className="text-[11px] text-slate-500">DNI: {inv.dni} · <span className="font-mono">{inv.numero_entrada}</span></p>
                      </div>
                      {!esGrupal(inv) ? (
                        <button type="button" onClick={() => paseInvitado(inv, modalEditarEgr, config)} className="px-3 py-1.5 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0" style={{ backgroundColor: colorFamiliaDe(modalEditarEgr) }}><Download className="w-3.5 h-3.5" /> QR individual</button>
                      ) : (
                        <span className="text-[11px] font-bold text-amber-700 text-right">En grupo · entra con el QR del grupo</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button type="button" onClick={() => alternarNoAsiste('egresados', modalEditarEgr, 'Egresados')} className={`w-full py-2 rounded-xl text-xs font-bold border cursor-pointer ${modalEditarEgr.activo === false ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'}`}>{modalEditarEgr.activo === false ? 'Reactivar (vuelve a ocupar plaza)' : 'Marcar No Asiste (libera la plaza)'}</button>
              <button type="button" onClick={() => eliminarEgresado(modalEditarEgr)} className="w-full py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"><Trash2 className="w-4 h-4" /> Eliminar egresado y sus invitados</button>

              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalEditarEgr(null)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold">Cancelar</button>
                <button type="submit" disabled={guardandoEdicion} className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tab === 'invitados' && (() => {
        const porId = {};
        egresados.forEach((e) => { porId[e.id] = e; });
        const lista = invitados.filter((i) => !filtroInvitado.trim() || coincideTexto([i.nombre_completo, i.dni, i.numero_entrada, porId[i.egresado_id]?.nombre_completo, porId[i.egresado_id]?.dni], filtroInvitado));
        const cuposAsignados = egresados.filter((e) => e.activo !== false).reduce((acc, e) => acc + cupoDe(e, config), 0);
        return (
          <div className="bg-white rounded-2xl border p-5 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div>
                <h3 className="font-bold">Invitados de los egresados ({invitados.length})</h3>
                <p className="text-xs text-slate-500">{invitados.length} cargados de {cuposAsignados} cupos asignados · {invitados.filter((i) => i.asistio).length} presentes</p>
              </div>
              <button onClick={exportarInvitadosCSV} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                <Download className="w-4 h-4" /> Exportar
              </button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input type="text" placeholder="Buscar por invitado, DNI, número de entrada o egresado..." value={filtroInvitado} onChange={(e) => setFiltroInvitado(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none focus:border-[#6B1D2F]" />
            </div>
            <div className="max-h-[28rem] overflow-y-auto divide-y">
              {lista.length === 0 && <p className="text-center text-slate-400 text-sm py-6">No se encontraron invitados.</p>}
              {lista.slice(0, 500).map((i) => {
                const anfitrion = porId[i.egresado_id];
                return (
                  <div key={i.id} className="py-2.5 flex flex-wrap justify-between items-center gap-2 text-sm">
                    <div>
                      <span className="font-semibold">{i.nombre_completo}</span> <span className="text-xs text-slate-500">({i.dni || 'S/D'})</span>
                      <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${esGrupal(i) ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{esGrupal(i) ? 'En grupo' : 'Individual'}</span>
                      {tieneMovilidad(i) && <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">♿ Movilidad reducida</span>}
                      <p className="text-xs text-slate-400">Invitado de <b>{anfitrion ? anfitrion.nombre_completo : 'egresado eliminado'}</b>{i.numero_entrada ? ` · Entrada ${i.numero_entrada}` : ''}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${i.asistio ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{i.asistio ? '✓ Presente' : 'Pendiente'}</span>
                  </div>
                );
              })}
              {lista.length > 500 && <p className="text-center text-slate-400 text-xs py-3">Mostrando 500 de {lista.length}. Usá el buscador para acotar.</p>}
            </div>
          </div>
        );
      })()}

      {tab === 'docentes' && (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-bold">Padrón de Docentes ({docentes.length})</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => exportarCSV('docentes')} className="px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Download className="w-4 h-4" /> Exportar</button>
              <button onClick={() => setModalAgregarDocente(true)} className="px-3.5 py-2 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Plus className="w-4 h-4" /> Agregar Docente</button>
              <input ref={fileDocRef} type="file" accept=".csv,.txt" onChange={handleImportarCSVDocentes} className="hidden" />
              <button onClick={() => fileDocRef.current?.click()} title='El CSV puede traer una columna "Butaca" (SI/NO) o "Sin butaca" (SI/NO). Si no la trae, todos entran con butaca.' className="px-3 py-2 bg-indigo-50 text-indigo-700 border rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"><Upload className="w-4 h-4" /> Importar CSV</button>
              {perfilStaff?.rol === 'admin' && ultimaImportacion('Docentes') && (
                <button onClick={() => deshacerImportacion('Docentes', 'docentes', 'docentes')} className="px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold cursor-pointer">↩ Deshacer última importación ({ultimaImportacion('Docentes').ids.length})</button>
              )}
              {perfilStaff?.rol === 'admin' && docentes.length > 0 && <button onClick={vaciarPadronDocentes} className="px-3 py-2 bg-rose-50 text-rose-700 border rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"><Trash2 className="w-4 h-4" /> Vaciar Padrón</button>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-bold">🪑 Con butaca: {totalDocentesConButaca}</span>
            <span className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg font-bold">Sin butaca: {totalDocentesSinButaca}</span>
            <span className="text-slate-400">Todos escanean su QR al ingresar.</span>
            {perfilStaff?.rol === 'admin' && (
              <>
                <button onClick={() => asignarButacaMasivo(true)} className="px-2.5 py-1 bg-white border rounded-lg font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">Todos con butaca</button>
                <button onClick={() => asignarButacaMasivo(false)} className="px-2.5 py-1 bg-white border rounded-lg font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">Todos sin butaca</button>
              </>
            )}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input type="text" placeholder="Buscar docente por nombre o DNI..." value={filtroDocente} onChange={(e) => setFiltroDocente(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none focus:border-[#6B1D2F]" />
          </div>

          <div className="max-h-96 overflow-y-auto divide-y">
            {docentesFiltrados.length === 0 && <p className="text-center text-slate-400 text-sm py-6">No se encontraron docentes.</p>}
            {docentesFiltrados.map((d) => (
              <div key={d.id} className="py-2.5 flex justify-between items-center text-sm">
                <div><span className="font-semibold">{d.nombre_completo}</span> <span className="text-xs text-slate-500">({d.dni})</span> {d.activo === false && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-bold">NO ASISTE</span>}</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => alternarButacaDocente(d)} title="Tocá para cambiar" className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${d.ocupa_butaca === false ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{d.ocupa_butaca === false ? 'Sin butaca' : 'Con butaca'}</button>
                <button onClick={() => abrirModalEditarDocente(d)} className="px-2.5 py-1 bg-amber-50 text-amber-700 border rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"><Edit2 className="w-3 h-3" /> Editar y Descargar QR</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalAgregarDocente && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border">
            <div className="bg-[#6B1D2F] text-white p-4 flex justify-between items-center">
              <h3 className="font-bold text-base">Agregar Nuevo Docente</h3>
              <button onClick={() => setModalAgregarDocente(false)} className="p-1 rounded-lg text-white/80 hover:bg-white/10 cursor-pointer">
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
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-slate-50 cursor-pointer">
                <span className="text-xs"><b className="text-slate-800">Ocupa butaca</b><br /><span className="text-slate-500">Si se apaga, el docente asiste y escanea su QR pero no cuenta en las butacas de la sala.</span></span>
                <input type="checkbox" checked={nuevoDocButaca} onChange={(e) => setNuevoDocButaca(e.target.checked)} className="w-5 h-5 accent-emerald-600 shrink-0" />
              </label>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalAgregarDocente(false)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold cursor-pointer">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold shadow cursor-pointer">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalEditarDoc && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border">
            <div className="bg-[#6B1D2F] text-white p-4 flex justify-between items-center">
              <h3 className="font-bold text-base">Editar Docente y Descargar QR</h3>
              <button onClick={() => setModalEditarDoc(null)} className="p-1.5 rounded-lg text-white/80"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={guardarEdicionDocente} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border rounded-xl flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-slate-900">QR Oficial del Docente</p>
                </div>
                <button type="button" onClick={() => paseDocente(modalEditarDoc, config)} className="px-3.5 py-2 bg-slate-700 text-white rounded-xl text-xs font-bold"><Download className="w-4 h-4" /> Descargar QR</button>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre y Apellido</label>
                <input type="text" required value={editDocNombre} onChange={(e) => setEditDocNombre(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">DNI</label>
                <input type="text" required maxLength={8} value={editDocDni} onChange={(e) => setEditDocDni(sanitizeDNI(e.target.value))} className="w-full px-3 py-2 border rounded-xl text-sm font-mono" />
              </div>
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-slate-50 cursor-pointer">
                <span className="text-xs"><b className="text-slate-800">Ocupa butaca</b><br /><span className="text-slate-500">Si se apaga, el docente asiste y escanea su QR pero no cuenta en las butacas de la sala.</span></span>
                <input type="checkbox" checked={editDocButaca} onChange={(e) => setEditDocButaca(e.target.checked)} className="w-5 h-5 accent-emerald-600 shrink-0" />
              </label>
              <button type="button" onClick={() => alternarNoAsiste('docentes', modalEditarDoc, 'Docentes')} className={`w-full py-2 rounded-xl text-xs font-bold border cursor-pointer ${modalEditarDoc.activo === false ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'}`}>{modalEditarDoc.activo === false ? 'Reactivar (vuelve a ocupar plaza)' : 'Marcar No Asiste (libera la plaza)'}</button>
              <button type="button" onClick={() => eliminarDocente(modalEditarDoc)} className="w-full py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"><Trash2 className="w-4 h-4" /> Eliminar docente</button>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalEditarDoc(null)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold">Cancelar</button>
                <button type="submit" disabled={guardandoDocente} className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tab === 'vip' && (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-bold">Padrón de Invitados VIP ({especiales.length})</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => exportarCSV('vip')} className="px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Download className="w-4 h-4" /> Exportar</button>
              <button onClick={() => setModalAgregarVip(true)} className="px-3.5 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Plus className="w-4 h-4" /> Agregar VIP</button>
              <input ref={fileVipRef} type="file" accept=".csv,.txt" onChange={handleImportarCSVVips} className="hidden" />
              <button onClick={() => fileVipRef.current?.click()} className="px-3 py-2 bg-indigo-50 text-indigo-700 border rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"><Upload className="w-4 h-4" /> Importar CSV</button>
              {perfilStaff?.rol === 'admin' && ultimaImportacion('VIP') && (
                <button onClick={() => deshacerImportacion('VIP', 'invitados_especiales', 'invitados VIP')} className="px-3 py-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold cursor-pointer">↩ Deshacer última importación ({ultimaImportacion('VIP').ids.length})</button>
              )}
              {perfilStaff?.rol === 'admin' && especiales.length > 0 && <button onClick={vaciarPadronVip} className="px-3 py-2 bg-rose-50 text-rose-700 border rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"><Trash2 className="w-4 h-4" /> Vaciar Padrón</button>}
            </div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input type="text" placeholder="Buscar invitado VIP por nombre o DNI..." value={filtroVip} onChange={(e) => setFiltroVip(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-xl border text-sm outline-none focus:border-[#6B1D2F]" />
          </div>

          <div className="max-h-96 overflow-y-auto divide-y">
            {vipsFiltrados.length === 0 && <p className="text-center text-slate-400 text-sm py-6">No se encontraron invitados VIP.</p>}
            {vipsFiltrados.map((v) => (
              <div key={v.id} className="py-2.5 flex justify-between items-center text-sm">
                <div><span className="font-semibold">{v.nombre_completo}</span> {tieneMovilidad(v) && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">♿ Movilidad reducida</span>} {v.activo === false && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-bold">NO ASISTE</span>}</div>
                <button onClick={() => abrirModalEditarVip(v)} className="px-2.5 py-1 bg-amber-50 text-amber-700 border rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"><Edit2 className="w-3 h-3" /> Editar y Descargar QR</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalAgregarVip && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden border">
            <div className="bg-amber-600 text-white p-4 flex justify-between items-center">
              <h3 className="font-bold text-base">Agregar Invitado VIP</h3>
              <button onClick={() => setModalAgregarVip(false)} className="p-1 rounded-lg text-white/80 hover:bg-white/10 cursor-pointer">
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
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={nuevoVipMovilidad} onChange={(e) => setNuevoVipMovilidad(e.target.checked)} className="w-4 h-4 accent-amber-600" />
                ♿ Tiene movilidad reducida
              </label>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalAgregarVip(false)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold cursor-pointer">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-xs font-bold shadow cursor-pointer">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalEditarVip && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border">
            <div className="bg-amber-600 text-white p-4 flex justify-between items-center">
              <h3 className="font-bold text-base">Editar Invitado VIP y Descargar QR</h3>
              <button onClick={() => setModalEditarVip(null)} className="p-1.5 rounded-lg text-white/80"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={guardarEdicionVip} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border rounded-xl flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-slate-900">QR Oficial VIP</p>
                </div>
                <button type="button" onClick={() => paseVip({ ...modalEditarVip, movilidad_reducida: editVipMovilidad }, config)} className="px-3.5 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold"><Download className="w-4 h-4" /> Descargar QR</button>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre / Institución</label>
                <input type="text" required value={editVipNombre} onChange={(e) => setEditVipNombre(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">DNI (Opcional)</label>
                <input type="text" maxLength={8} value={editVipDni} onChange={(e) => setEditVipDni(sanitizeDNI(e.target.value))} className="w-full px-3 py-2 border rounded-xl text-sm font-mono" />
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={editVipMovilidad} onChange={(e) => setEditVipMovilidad(e.target.checked)} className="w-4 h-4 accent-amber-600" />
                ♿ Tiene movilidad reducida
              </label>
              <button type="button" onClick={() => alternarNoAsiste('invitados_especiales', modalEditarVip, 'VIP')} className={`w-full py-2 rounded-xl text-xs font-bold border cursor-pointer ${modalEditarVip.activo === false ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'}`}>{modalEditarVip.activo === false ? 'Reactivar (vuelve a ocupar plaza)' : 'Marcar No Asiste (libera la plaza)'}</button>
              <button type="button" onClick={() => eliminarVip(modalEditarVip)} className="w-full py-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"><Trash2 className="w-4 h-4" /> Eliminar invitado VIP</button>
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setModalEditarVip(null)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold">Cancelar</button>
                <button type="submit" disabled={guardandoVip} className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-xs font-bold">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECCIÓN DE SOLICITUDES DE BUTACAS EXTRA */}
      {tab === 'solicitudes' && (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-900">Bandeja de Solicitudes de Butacas Extra (Plus)</h3>
              <p className="text-xs text-slate-500">Cada egresado puede pedir una sola vez. Se puede aprobar todo, una parte o rechazar; en todos los casos la solicitud queda cerrada. Vacantes libres hoy: <b>{vacantesLibres}</b>.</p>
            </div>
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full font-bold text-xs">{solicitudes.length} solicitudes</span>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {solicitudes.length === 0 ? (
              <p className="text-center text-slate-400 py-8 text-sm">No hay solicitudes de butacas extra registradas.</p>
            ) : (
              solicitudes.map((s) => {
                const numeroWp = s.egresado_celular ? s.egresado_celular.replace(/\D/g, '') : '';
                const estadoSol = String(s.estado || '').toLowerCase();
                const aprobadas = Number(s.cantidad_aprobada ?? s.cantidad_solicitada) || 0;
                const textoAprob = aprobadas < Number(s.cantidad_solicitada) ? `${aprobadas} de las ${s.cantidad_solicitada} butacas que pediste` : `${aprobadas} butaca(s) extra`;
                const linkWpAprobada = `https://wa.me/549${numeroWp}?text=${encodeURIComponent(`Hola ${s.egresado_nombre}, tu solicitud fue APROBADA: te asignamos ${textoAprob}. Volvé a ingresar al portal con tu DNI para cargar a tus invitados y descargar los pases. ESRN N° 005`)}`;
                const linkWpRechazada = `https://wa.me/549${numeroWp}?text=${encodeURIComponent(`Hola ${s.egresado_nombre}, lamentablemente tu solicitud de butacas extra no pudo aprobarse por falta de lugar en la sala. ESRN N° 005`)}`;

                return (
                  <div key={s.id} className="p-4 border rounded-xl flex flex-wrap justify-between items-center gap-3 bg-slate-50">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{s.egresado_nombre}</span>
                        <span className="text-xs text-slate-500">(DNI: {s.egresado_dni})</span>
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-bold text-xs">Pide +{s.cantidad_solicitada}</span>
                      </div>
                      <p className="text-xs text-slate-600"><b>Motivo/Observación:</b> {s.observacion || 'Sin observación'}</p>
                      <p className="text-[11px] text-slate-400 font-mono">Solicitado el: {new Date(s.created_at).toLocaleString()}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {estadoSol === 'pendiente' ? (
                        <>
                          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            Aprobar
                            <select value={cantAprobar[s.id] ?? s.cantidad_solicitada} onChange={(e) => setCantAprobar((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))} className="px-2 py-1.5 border rounded-lg bg-white text-xs font-bold">
                              {Array.from({ length: Math.max(1, Number(s.cantidad_solicitada) || 1) }, (_, k) => k + 1).map((k) => <option key={k} value={k}>{k}</option>)}
                            </select>
                            de {s.cantidad_solicitada}
                          </label>
                          <button
                            onClick={() => resolverSolicitud(s, true)}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                          >
                            ✓ Aprobar y sumar cupo
                          </button>
                          <button
                            onClick={() => resolverSolicitud(s, false)}
                            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                          >
                            ✕ Rechazar
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${estadoSol === 'aprobada' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {estadoSol === 'aprobada' ? `Aprobada: ${aprobadas} de ${s.cantidad_solicitada}` : s.estado}
                          </span>
                          {whatsappActivo && numeroWp && (
                            <a
                              href={estadoSol === 'aprobada' ? linkWpAprobada : linkWpRechazada}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs"
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

      {/* ACREDITACIÓN EN VIVO */}
      {tab === 'reportes' && (
        <div className="bg-white rounded-2xl border p-5 space-y-6">
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-900">📊 Panel de Acreditación y Asistencia en Vivo</h3>
              <p className="text-xs text-slate-500">Monitoreo en tiempo real de ingresos a la sala en el evento.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={exportarReporteAsistencia} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                <Download className="w-3.5 h-3.5" /> Reporte de asistencia (Excel)
              </button>
              <button onClick={() => recargar()} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Actualizar Datos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1">
              <p className="text-xs font-bold text-emerald-800 uppercase">Egresados Presentes</p>
              <p className="text-3xl font-black text-emerald-900">
                {egresados.filter(e => e.asistio).length} <span className="text-sm font-semibold opacity-70">/ {egresados.length}</span>
              </p>
            </div>
            <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl space-y-1">
              <p className="text-xs font-bold text-teal-800 uppercase">Invitados / Familiares</p>
              <p className="text-3xl font-black text-teal-900">
                {invitados.filter(i => i.asistio).length} <span className="text-sm font-semibold opacity-70">/ {invitados.length}</span>
              </p>
            </div>
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-1">
              <p className="text-xs font-bold text-indigo-800 uppercase">Docentes Presentes</p>
              <p className="text-3xl font-black text-indigo-900">
                {docentes.filter(d => d.asistio).length} <span className="text-sm font-semibold opacity-70">/ {docentes.length}</span>
              </p>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-1">
              <p className="text-xs font-bold text-amber-800 uppercase">Invitados VIP / Autoridades</p>
              <p className="text-3xl font-black text-amber-900">
                {especiales.filter(v => v.asistio).length} <span className="text-sm font-semibold opacity-70">/ {especiales.length}</span>
              </p>
            </div>
          </div>

          {butacasOcupadasPresentes >= CAPACIDAD * 0.9 && (
            <div className={`p-3 rounded-xl text-sm font-bold border ${butacasOcupadasPresentes >= CAPACIDAD ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
              {butacasOcupadasPresentes >= CAPACIDAD
                ? `⛔ Sala completa: ${butacasOcupadasPresentes} presentes de ${CAPACIDAD} butacas.`
                : `⚠️ Aforo casi completo: ${butacasOcupadasPresentes} presentes de ${CAPACIDAD} (quedan ${CAPACIDAD - butacasOcupadasPresentes}).`}
            </div>
          )}

          <div className="p-5 bg-slate-900 text-white rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-rose-300">Butacas ocupadas en la sala</p>
              <p className="text-4xl font-black mt-0.5">{butacasOcupadasPresentes} <span className="text-lg font-normal opacity-70">/ {CAPACIDAD} Máx</span></p>
              <p className="text-[11px] text-slate-300 mt-1">Personas presentes en el acto: <b>{totalAsistentesPresentes}</b>{docentesSinButacaPresentes > 0 ? ` (incluye ${docentesSinButacaPresentes} docente(s) sin butaca)` : ''}</p>
            </div>
            <div className="w-full sm:w-72 bg-slate-800 p-3 rounded-xl border border-slate-700 space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span>Ocupación del Salón</span>
                <span>{Math.round((butacasOcupadasPresentes / CAPACIDAD) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden">
                <div className={`h-full transition-all ${butacasOcupadasPresentes >= CAPACIDAD ? 'bg-rose-500' : butacasOcupadasPresentes >= CAPACIDAD * 0.9 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.round((butacasOcupadasPresentes / CAPACIDAD) * 100))}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIGURACIÓN DE AFORO Y SALA */}
      {tab === 'aforo' && (() => {
        const esAdmin = perfilStaff?.rol === 'admin';
        // Qué butaca le toca a cada sector (el primero que la abarca) y superposiciones
        const asignacion = {};
        const superpuestas = new Set();
        salaEdit.sectores.forEach((s, k) => {
          butacasDeSector(s).forEach((b) => { if (asignacion[b] !== undefined) superpuestas.add(b); else asignacion[b] = k; });
        });
        const butacasPorGrupo = {};
        Object.values(asignacion).forEach((k) => { const g = salaEdit.sectores[k].grupo; butacasPorGrupo[g] = (butacasPorGrupo[g] || 0) + 1; });
        // Lo que necesita cada grupo hoy
        const ctx = { config, invitados, solicitudes };
        const activos = egresados.filter((e) => e.activo !== false);
        const famDe = (t) => activos.filter((e) => tipoOrientacion(e) === t).reduce((acc, e) => acc + plazasFamiliaresDe(e, ctx), 0);
        const famSinOri = activos.filter((e) => !tipoOrientacion(e)).reduce((acc, e) => acc + plazasFamiliaresDe(e, ctx), 0);
        const idsActivos = new Set(activos.map((e) => e.id));
        const necesita = {
          egresados: totalEgresados,
          familias_cn: famDe('cn'),
          familias_edu: famDe('edu'),
          familias: famDe('cn') + famDe('edu') + famSinOri,
          docentes: totalDocentesConButaca,
          vip: totalEspeciales,
          movilidad: invitados.filter((i) => tieneMovilidad(i) && idsActivos.has(i.egresado_id)).length + especiales.filter((v) => v.activo !== false && tieneMovilidad(v)).length,
        };
        const totalAsignadas = Object.keys(asignacion).length;
        const filasOpciones = FILAS_TEATRO.map((f) => f.fila);
        const capNum = Number(salaEdit.capacidad) || 0;
        return (
        <div className="bg-white rounded-2xl border p-4 sm:p-5 space-y-6">
          <div className="border-b pb-3">
            <h3 className="font-bold text-base text-slate-900">⚙️ Aforo y Sala — Teatro CCC</h3>
            <p className="text-xs text-slate-500">Capacidad, cupo de invitados y sectores de la sala (por grupo, sin número de butaca).</p>
          </div>

          {/* Capacidad */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wide">Capacidad de la sala</h4>
            <p className="text-xs text-slate-600">
              Según el croquis hay <b>{BUTACAS_CROQUIS}</b> butacas (<b>{BUTACAS_CROQUIS - BUTACAS_CORTESIA}</b> sin la fila de cortesía F1). El sistema usa hoy <b>{CAPACIDAD}</b>{salaConfigDe(config).capacidad === null ? ' (valor por defecto, todavía no se guardó ninguno)' : ''}.
            </p>
            {esAdmin ? (
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Capacidad a usar</label>
                  <input type="number" min="50" max="2000" value={salaEdit.capacidad} onChange={(e) => editarSala({ capacidad: e.target.value })} className="w-32 px-3 py-2 border rounded-xl text-sm bg-white" />
                </div>
                <button type="button" onClick={() => editarSala({ capacidad: BUTACAS_CROQUIS })} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold cursor-pointer">Usar {BUTACAS_CROQUIS} (todo el croquis)</button>
                <button type="button" onClick={() => editarSala({ capacidad: BUTACAS_CROQUIS - BUTACAS_CORTESIA })} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold cursor-pointer">Usar {BUTACAS_CROQUIS - BUTACAS_CORTESIA} (sin fila de cortesía)</button>
              </div>
            ) : <p className="text-[11px] text-slate-400">Solo el administrador puede cambiar la capacidad y los sectores.</p>}
          </div>

          {/* Cupo base */}
          <form onSubmit={guardarConfiguracionAforo} className="flex flex-wrap items-end gap-3 pt-4 border-t">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Cupo base por egresado (para egresados nuevos)</label>
              <input type="number" min="0" max="10" value={cupoBaseEdit} onChange={(e) => setCupoBaseEdit(e.target.value)} className="w-32 px-3 py-2 border rounded-xl text-sm bg-white" required />
            </div>
            <button type="submit" disabled={guardandoConfig} className="px-4 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow cursor-pointer">{guardandoConfig ? 'Guardando...' : 'Guardar cupo base'}</button>
          </form>

          {esAdmin && <div className="pt-4 border-t">{renderSimuladorCupo()}</div>}

          {/* Sectores */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div>
                <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wide">Sectores de la sala</h4>
                <p className="text-xs text-slate-500">Cada sector es un rango de filas y butacas reservado para un grupo. La ubicación aparece en los pases, en Puerta y en el Resumen Papel. Si un grupo no tiene sector, no se muestra ubicación.</p>
              </div>
              {esAdmin && <button type="button" onClick={agregarSector} className="px-3.5 py-2 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Plus className="w-4 h-4" /> Agregar sector</button>}
            </div>

            {salaEdit.sectores.length === 0 && <p className="text-xs text-slate-400 italic">Todavía no hay sectores. {esAdmin ? 'Tocá "Agregar sector".' : ''}</p>}
            <div className="space-y-2">
              {salaEdit.sectores.map((s, k) => {
                const info = grupoSalaInfo(s.grupo);
                const cant = butacasDeSector(s).length;
                return (
                  <div key={s.id || k} className="p-3 rounded-xl border-2 bg-slate-50 space-y-2" style={{ borderColor: info.color }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ backgroundColor: info.color }} />
                      <span className="text-xs font-bold text-slate-800">Sector #{k + 1}</span>
                      <span className="text-xs text-slate-500">{describirSector(s)} · <b>{cant}</b> butacas</span>
                      {esAdmin && <button type="button" onClick={() => quitarSector(k)} className="ml-auto text-rose-600 hover:text-rose-800 p-1 cursor-pointer" title="Quitar sector"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                      <input type="text" disabled={!esAdmin} placeholder="Nombre (opcional, ej: Platea baja)" value={s.nombre || ''} onChange={(e) => editarSector(k, { nombre: e.target.value })} className="col-span-2 px-2.5 py-1.5 border rounded-lg text-xs bg-white" />
                      <select disabled={!esAdmin} value={s.grupo} onChange={(e) => editarSector(k, { grupo: e.target.value })} className="col-span-2 px-2 py-1.5 border rounded-lg text-xs bg-white font-semibold">
                        {GRUPOS_SALA.map((g) => <option key={g.valor} value={g.valor}>{g.etiqueta}</option>)}
                      </select>
                      <label className="text-[11px] font-bold text-slate-600">Filas
                        <span className="flex gap-1 mt-0.5">
                          <select disabled={!esAdmin} value={s.filaDesde} onChange={(e) => editarSector(k, { filaDesde: e.target.value })} className="px-1.5 py-1 border rounded-lg text-xs bg-white">{filasOpciones.map((f) => <option key={f}>{f}</option>)}</select>
                          <select disabled={!esAdmin} value={s.filaHasta} onChange={(e) => editarSector(k, { filaHasta: e.target.value })} className="px-1.5 py-1 border rounded-lg text-xs bg-white">{filasOpciones.map((f) => <option key={f}>{f}</option>)}</select>
                        </span>
                      </label>
                      <label className="text-[11px] font-bold text-slate-600">Butacas
                        <span className="flex gap-1 mt-0.5">
                          <input disabled={!esAdmin} type="number" min="1" max="26" value={s.butacaDesde} onChange={(e) => editarSector(k, { butacaDesde: e.target.value })} className="w-14 px-1.5 py-1 border rounded-lg text-xs bg-white" />
                          <input disabled={!esAdmin} type="number" min="1" max="26" value={s.butacaHasta} onChange={(e) => editarSector(k, { butacaHasta: e.target.value })} className="w-14 px-1.5 py-1 border rounded-lg text-xs bg-white" />
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            {superpuestas.size > 0 && <p className="text-xs font-bold text-amber-700">⚠️ Hay {superpuestas.size} butaca(s) en más de un sector: cuentan para el primero de la lista.</p>}
            {esAdmin && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={guardandoSala || !salaCambiada} onClick={guardarSala} className="px-4 py-2.5 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow cursor-pointer">{guardandoSala ? 'Guardando...' : 'Guardar capacidad y sectores'}</button>
                {salaCambiada && <button type="button" onClick={descartarCambiosSala} className="px-4 py-2.5 bg-white border rounded-xl text-xs font-bold cursor-pointer">Descartar cambios</button>}
                {salaCambiada && <span className="text-xs font-bold text-amber-700 self-center">Hay cambios sin guardar</span>}
              </div>
            )}
          </div>

          {/* Balance por grupo */}
          <div className="space-y-2 pt-4 border-t">
            <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wide">Butacas asignadas vs. necesarias</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-slate-100"><th className="p-2 border text-left">Grupo</th><th className="p-2 border">Necesita hoy</th><th className="p-2 border">Butacas asignadas</th><th className="p-2 border">Diferencia</th></tr></thead>
                <tbody>
                  {GRUPOS_SALA.filter((g) => g.valor !== 'reservado').map((g) => {
                    const asig = butacasPorGrupo[g.valor] || 0;
                    const nec = necesita[g.valor] || 0;
                    const usado = asig > 0 || ['egresados', 'docentes', 'vip', 'familias_cn', 'familias_edu'].includes(g.valor);
                    if (!usado) return null;
                    const dif = asig - nec;
                    return (
                      <tr key={g.valor}>
                        <td className="p-2 border font-semibold"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ backgroundColor: g.color }} />{g.etiqueta}</td>
                        <td className="p-2 border text-center">{nec}</td>
                        <td className="p-2 border text-center">{asig || '—'}</td>
                        <td className={`p-2 border text-center font-bold ${asig === 0 ? 'text-slate-400' : dif < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{asig === 0 ? 'sin sector' : dif < 0 ? `faltan ${-dif}` : `sobran ${dif}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">
              Butacas en sectores: <b>{totalAsignadas}</b> · sin asignar: <b>{BUTACAS_CROQUIS - totalAsignadas}</b> · ocupación prevista: <b>{totalOcupado}</b> de <b>{capNum || CAPACIDAD}</b>.
              {' '}"Familias" se calcula con la etapa actual (en Cierre Parcial cuenta los invitados cargados). Las personas con movilidad reducida también están contadas en su familia.
            </p>
          </div>

          {/* Mapa */}
          <div className="space-y-2 pt-4 border-t">
            <h4 className="font-bold text-sm text-slate-800 uppercase tracking-wide">Mapa de la sala</h4>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              {GRUPOS_SALA.filter((g) => salaEdit.sectores.some((s) => s.grupo === g.valor)).map((g) => (
                <span key={g.valor} className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: g.color }} /> {g.etiqueta}</span>
              ))}
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-slate-200 border border-slate-300" /> Sin asignar</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-slate-200 border-2 border-lime-500" /> Fila de cortesía</span>
            </div>
            <div className="bg-slate-50 border p-3 rounded-xl overflow-x-auto">
              <div className="min-w-max mx-auto space-y-1">
                <div className="bg-[#2D3B1F] text-white py-1.5 rounded-full text-center font-bold text-[11px] tracking-widest uppercase">Pantalla / Escenario</div>
                {FILAS_TEATRO.map((f) => {
                  const maximo = f.bloque === 'trasero' ? 26 : 25;
                  const celdas = [];
                  for (let n = maximo; n >= 1; n--) {
                    const clave = `${f.fila}-${n}`;
                    if (!existeButaca(f, n)) {
                      celdas.push(<span key={clave} className="w-4 h-4 inline-block" />);
                    } else {
                      const k = asignacion[clave];
                      const sec = k !== undefined ? salaEdit.sectores[k] : null;
                      const col = sec ? grupoSalaInfo(sec.grupo).color : null;
                      celdas.push(
                        <span key={clave} title={`${f.fila} · butaca ${n}${sec ? ` · ${sec.nombre || grupoSalaInfo(sec.grupo).etiqueta}` : ''}${superpuestas.has(clave) ? ' · ¡en dos sectores!' : ''}`}
                          className={`w-4 h-4 inline-block rounded-[3px] ${col ? '' : 'bg-slate-200'} ${f.cortesia ? 'border-2 border-lime-500' : 'border border-black/10'} ${superpuestas.has(clave) ? 'ring-2 ring-rose-500' : ''}`}
                          style={col ? { backgroundColor: col } : undefined} />
                      );
                    }
                    if (f.bloque === 'trasero' && (n === 22 || n === 6)) celdas.push(<span key={`${clave}-pasillo`} className="w-3 h-4 inline-block" />);
                  }
                  return (
                    <React.Fragment key={f.fila}>
                      {f.fila === 'F12' && <div className="h-3" />}
                      {(f.fila === 'F1' || f.fila === 'F12') && (
                        <div className="text-[10px] font-bold text-lime-700 uppercase">← {f.fila === 'F1' ? 'Acceso de arriba (bloque F1–F11)' : 'Acceso de abajo (bloque F12–F21)'}</div>
                      )}
                      <div className="flex items-center gap-[2px]">
                        <span className="w-8 text-[10px] font-bold text-slate-500 shrink-0">{f.fila}</span>
                        <div className="flex gap-[2px] justify-center flex-1">{celdas}</div>
                        <span className="w-8 text-[10px] font-bold text-slate-500 text-right shrink-0">{butacasDeFila(f)}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div className="text-[10px] font-bold text-[#6B1D2F] uppercase text-center pt-1">↑ Ingreso de egresados por detrás de la última fila</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">Butacas numeradas de izquierda (25 o 26) a derecha (1) mirando al escenario. El número de la derecha es la cantidad de butacas de cada fila. Pasá el mouse por una butaca para ver su fila, número y sector.</p>
          </div>
        </div>
        );
      })()}

      {tab === 'usuarios' && perfilStaff?.rol === 'admin' && (
        <div className="bg-white rounded-2xl border p-5 space-y-5">
          <h3 className="font-bold">Gestión de Usuarios del Sistema</h3>
          <form onSubmit={crearUsuarioSistema} className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border">
            <input type="text" placeholder="Nombre" value={nuevoNombreUsr} onChange={(e) => setNuevoNombreUsr(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white" required />
            <input type="email" placeholder="Correo electrónico" value={nuevoEmailUsr} onChange={(e) => setNuevoEmailUsr(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white" required />
            <div className="relative">
              <input type={showPassUsr ? "text" : "password"} placeholder="Contraseña" value={nuevoPassUsr} onChange={(e) => setNuevoPassUsr(e.target.value)} className="w-full px-3 py-2 rounded-xl border text-sm bg-white pr-10" required />
              <button type="button" onClick={() => setShowPassUsr(!showPassUsr)} className="absolute right-3 top-2.5 text-slate-400 cursor-pointer">
                {showPassUsr ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <select value={nuevoRolUsr} onChange={(e) => setNuevoRolUsr(e.target.value)} className="px-3 py-2 rounded-xl border text-sm bg-white font-medium">
              <option value="puerta">Puerta</option>
              <option value="coordinador">Coordinador</option>
              <option value="admin">Administrador</option>
            </select>
            <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer">+ Crear Usuario</button>
          </form>

          <div className="divide-y text-sm">
            {usuariosSistema.map((u) => {
              const esYo = (u.email || '').toLowerCase() === (perfilStaff?.email || '').toLowerCase();
              const rolU = String(u.rol || '').toLowerCase();
              const activo = u.activo !== false;
              return (
                <div key={u.id} className={`py-3 flex flex-wrap justify-between items-center gap-3 ${activo ? '' : 'opacity-60'}`}>
                  <div>
                    <p className="font-bold">{u.nombre} {esYo && <span className="text-[10px] font-bold text-indigo-600 uppercase">(vos)</span>} {!activo && <span className="text-[10px] font-bold text-rose-600 uppercase">Desactivado</span>}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={rolU} onChange={(e) => actualizarUsuario(u, { rol: e.target.value }, `Cambió el rol a ${e.target.value}`)} className="px-2 py-1.5 rounded-lg border text-xs font-bold bg-white">
                      <option value="puerta">Puerta</option>
                      <option value="coordinador">Coordinador</option>
                      <option value="admin">Administrador</option>
                    </select>
                    <button onClick={() => actualizarUsuario(u, { activo: !activo }, activo ? 'Desactivó al usuario' : 'Activó al usuario')} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${activo ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                      {activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => eliminarUsuarioSistema(u)} className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* REGISTRO DE ACTIVIDAD (SOLO ADMIN): botón discreto que abre un modal */}
      {perfilStaff?.rol === 'admin' && (
        <div className="flex flex-wrap justify-end items-center gap-3 mt-8">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-slate-500">WhatsApp</span>
            <button onClick={cambiarWhatsapp} className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${whatsappActivo ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
              {whatsappActivo ? '● Activado' : '○ Desactivado'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-slate-500">Portal VIP</span>
            <button onClick={cambiarPortalVip} className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${vipPortalActivo ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
              {vipPortalActivo ? '● Activado' : '○ Desactivado'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-slate-500">Escudo</span>
            {config.escudo && <img src={config.escudo} alt="Escudo" className="w-9 h-9 object-contain bg-white border rounded-lg p-0.5" />}
            <input ref={fileEscudoRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={subirEscudo} className="hidden" />
            <button onClick={() => fileEscudoRef.current?.click()} disabled={subiendoEscudo} className="px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer bg-slate-700 hover:bg-slate-800 text-white disabled:opacity-60">
              {subiendoEscudo ? 'Subiendo...' : config.escudo ? 'Cambiar escudo' : 'Subir escudo'}
            </button>
            {config.escudo && <button onClick={quitarEscudo} className="px-2.5 py-2 rounded-xl text-xs font-bold cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600">Quitar</button>}
          </div>
          <button
            onClick={() => { setModalLogs(true); recargar(); }}
            className="px-4 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
          >
            <History className="w-4 h-4" /> Registro de actividad
          </button>
        </div>
      )}

      {perfilStaff?.rol === 'admin' && modalLogs && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={() => setModalLogs(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl border-t-4 border-indigo-600" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-5 border-b">
              <div>
                <h3 className="font-bold text-base text-indigo-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" /> Registro de Actividad y Auditoría
                </h3>
                <p className="text-xs text-slate-500">Acciones realizadas por los operadores del sistema (se muestran las más recientes).</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={exportarLogsCSV} title="Exportar todo el registro (CSV)" className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Download className="w-3.5 h-3.5" /> Exportar CSV</button>
                <button onClick={() => recargar()} title="Actualizar" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"><RefreshCw className="w-4 h-4" /></button>
                <button onClick={() => setModalLogs(false)} title="Cerrar" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="px-5 pt-4">
              <input
                type="text"
                placeholder="Buscar por usuario, acción, módulo o detalle..."
                value={filtroLogBusqueda}
                onChange={(e) => setFiltroLogBusqueda(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border text-sm outline-none focus:border-indigo-600"
                autoFocus
              />
            </div>
            <div className="p-5 overflow-y-auto flex-1 divide-y text-xs">
              {logsFiltrados.length === 0 ? (
                <p className="text-center text-slate-400 py-6">No se encontraron registros de auditoría.</p>
              ) : (
                logsFiltrados.map((log) => (
                  <div key={log.id} className="py-2.5 flex flex-wrap justify-between items-center gap-2 hover:bg-slate-50 px-2 rounded">
                    <div>
                      <span className="font-bold text-slate-900">{log.usuario}</span>
                      <span className="mx-2 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded font-bold uppercase text-[10px]">{log.modulo}</span>
                      <span className="font-semibold text-slate-700">{log.accion}:</span>
                      <span className="text-slate-600 ml-1">{log.detalle}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {perfilStaff?.rol === 'admin' && (
      <div className="bg-gradient-to-r from-slate-900 to-[#6B1D2F] text-white p-5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 mt-6 border-t-4 border-amber-500">
        <div>
          <h4 className="font-extrabold text-sm uppercase tracking-wider text-rose-200">Panel de Control y Mantenimiento</h4>
          <p className="text-xs text-slate-200 mt-0.5">Acciones críticas de reinicio de asistencias y borrado de datos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button onClick={reiniciarAsistenciasGeneral} className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow cursor-pointer"><RotateCcw className="w-4 h-4" /> 🔄 Reiniciar Asistencias</button>
          <button onClick={borrarInvitadosEgresados} className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow cursor-pointer"><Trash2 className="w-4 h-4" /> 🗑️ Borrar Invitados</button>
        </div>
      </div>
      )}
    </div>
  );
}

function ReporteResumenPapel({ egresados, invitados, docentes, especiales, config, volver }) {
  const egresadosOrdenados = [...egresados].sort((a, b) => (a.division || '').localeCompare(b.division || '') || (a.nombre_completo || '').localeCompare(b.nombre_completo || ''));
  const porId = {};
  egresados.forEach((e) => { porId[e.id] = e; });
  const conMovilidad = [
    ...invitados.filter(tieneMovilidad).map((i) => ({ id: 'i' + i.id, nombre: i.nombre_completo, dni: i.dni, tipo: `Familiar de ${porId[i.egresado_id]?.nombre_completo || '—'}${esGrupal(i) ? ' (en grupo)' : ''}`, acceso: accesoFamiliaDe(porId[i.egresado_id]) })),
    ...especiales.filter(tieneMovilidad).map((v) => ({ id: 'v' + v.id, nombre: v.nombre_completo, dni: v.dni, tipo: 'VIP / Autoridad', acceso: ACCESO_TEXTO.abajo })),
  ];

  return (
    <div className="max-w-4xl mx-auto bg-white p-4 sm:p-8 rounded-2xl shadow-sm border space-y-8 print:shadow-none print:border-none print:p-0 print:m-0">
      <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-4 print:pb-2">
        <div className="flex items-center gap-3">
          {config?.escudo && <img src={config.escudo} alt="Escudo" className="w-12 h-12 object-contain" />}
          <div>
            <h2 className="text-xl font-bold text-[#6B1D2F]">ESRN N° 005 — Cipolletti</h2>
            <p className="text-xs text-slate-500">Acto de Colación 2026 · Resumen General para Control en Papel</p>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          {volver && <button onClick={volver} className="px-4 py-2 bg-white border rounded-xl text-xs font-bold cursor-pointer">← Volver a Administración</button>}
          <button onClick={() => window.print()} className="px-4 py-2 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"><Printer className="w-4 h-4" /> Imprimir Documento</button>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <h3 className="font-bold text-sm text-[#6B1D2F] uppercase tracking-wide">Accesos a la sala</h3>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><b>Egresados:</b> {ACCESO_TEXTO.egresados.toLowerCase()}.</li>
          <li><b>Familiares de Ciencias Naturales (TM):</b> {ACCESO_TEXTO.abajo.toLowerCase()}.</li>
          <li><b>Familiares de Educación (TT):</b> {ACCESO_TEXTO.arriba.toLowerCase()}.</li>
          <li><b>Docentes y VIP:</b> {ACCESO_TEXTO.abajo.toLowerCase()}.</li>
        </ul>
        {salaConfigDe(config).sectores.length > 0 && (
          <>
            <h3 className="font-bold text-sm text-[#6B1D2F] uppercase tracking-wide pt-2">Ubicación en la sala</h3>
            <ul className="list-disc pl-5 space-y-0.5">
              {[
                ['Egresados', ubicacionPara({ tipo: 'egresado' }, config)],
                ['Familias de Ciencias Naturales', ubicacionPara({ tipo: 'invitado', egr: { orientacion: 'CIENCIAS NATURALES' } }, config)],
                ['Familias de Educación', ubicacionPara({ tipo: 'invitado', egr: { orientacion: 'EDUCACION' } }, config)],
                ['Docentes', ubicacionPara({ tipo: 'docente' }, config)],
                ['VIP / Autoridades', ubicacionPara({ tipo: 'vip' }, config)],
                ['Movilidad reducida', textoSectores(salaConfigDe(config).sectores.filter((s) => s.grupo === 'movilidad'))],
                ['Reservado / No usar', textoSectores(salaConfigDe(config).sectores.filter((s) => s.grupo === 'reservado'))],
              ].filter(([, t]) => t).map(([g, t]) => <li key={g}><b>{g}:</b> {t}</li>)}
            </ul>
          </>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-sm text-[#6B1D2F] uppercase tracking-wide">♿ Personas con movilidad reducida ({conMovilidad.length})</h3>
        {conMovilidad.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No hay personas marcadas con movilidad reducida.</p>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead><tr className="bg-amber-50 border-b"><th className="p-2 border">Nombre</th><th className="p-2 border">DNI</th><th className="p-2 border">Quién es</th><th className="p-2 border">Acceso</th></tr></thead>
            <tbody>
              {conMovilidad.map((p) => (
                <tr key={p.id}><td className="p-2 border font-medium">♿ {p.nombre}</td><td className="p-2 border font-mono">{p.dni || 'S/D'}</td><td className="p-2 border">{p.tipo}</td><td className="p-2 border">{p.acceso}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-sm text-[#6B1D2F] uppercase tracking-wide">1. Padrón de Egresados y Grupo Familiar</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300">
                <th className="p-2 border">Egresado / DNI</th>
                <th className="p-2 border">Invitado / Familiar</th>
                <th className="p-2 border">DNI Invitado</th>
                <th className="p-2 border text-center">Modalidad</th>
                <th className="p-2 border text-center">Mov. reducida</th>
                <th className="p-2 border text-center">Firma Ingreso</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {egresadosOrdenados.map((egr) => {
                const misInv = invitados.filter(i => i.egresado_id === egr.id);
                return (
                  <React.Fragment key={egr.id}>
                    <tr className="bg-slate-50 font-bold">
                      <td className="p-2 border align-top" colSpan={6}>
                        🎓 {egr.nombre_completo} (DNI: {egr.dni}){textoCurso(egr) ? ` · ${textoCurso(egr)}` : ''} · Cel: {egr.celular || 'S/N'}
                        {egr.activo === false ? ' · NO ASISTE' : ''}
                        <span className="block font-normal text-[11px] text-slate-600">Familia: {accesoFamiliaDe(egr).toLowerCase()}</span>
                      </td>
                    </tr>
                    {misInv.length === 0 ? (
                      <tr><td className="p-2 border text-slate-400 italic" colSpan={6}>Sin invitados cargados</td></tr>
                    ) : (
                      misInv.map((inv, idx) => (
                        <tr key={inv.id} className="hover:bg-slate-50/50">
                          <td className="p-2 border text-slate-400 pl-6">↳ Cupo #{idx + 1}</td>
                          <td className="p-2 border font-medium">{inv.nombre_completo}</td>
                          <td className="p-2 border font-mono">{inv.dni}</td>
                          <td className="p-2 border text-center"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">{esGrupal(inv) ? 'En grupo' : 'Individual'}</span></td>
                          <td className="p-2 border text-center font-bold">{tieneMovilidad(inv) ? '♿ SÍ' : ''}</td>
                          <td className="p-2 border text-center w-28">______</td>
                        </tr>
                      ))
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 pt-6">
        <h3 className="font-bold text-sm text-[#6B1D2F] uppercase tracking-wide">2. Padrón de Docentes</h3>
        <table className="w-full text-left border-collapse text-xs">
          <thead><tr className="bg-slate-100 border-b"><th className="p-2 border">Nombre y Apellido</th><th className="p-2 border">DNI</th><th className="p-2 border text-center">Firma</th></tr></thead>
          <tbody>
            {docentes.map((d) => (
              <tr key={d.id}><td className="p-2 border font-medium">📚 {d.nombre_completo}</td><td className="p-2 border font-mono">{d.dni}</td><td className="p-2 border text-center">______</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 pt-6">
        <h3 className="font-bold text-sm text-[#6B1D2F] uppercase tracking-wide">3. Padrón de Invitados VIP / Autoridades</h3>
        <table className="w-full text-left border-collapse text-xs">
          <thead><tr className="bg-slate-100 border-b"><th className="p-2 border">Nombre / Institución</th><th className="p-2 border">DNI</th><th className="p-2 border text-center">Mov. reducida</th><th className="p-2 border text-center">Firma</th></tr></thead>
          <tbody>
            {especiales.map((v) => (
              <tr key={v.id}><td className="p-2 border font-medium">⭐ {v.nombre_completo}</td><td className="p-2 border font-mono">{v.dni || 'S/D'}</td><td className="p-2 border text-center font-bold">{tieneMovilidad(v) ? '♿ SÍ' : ''}</td><td className="p-2 border text-center">______</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
