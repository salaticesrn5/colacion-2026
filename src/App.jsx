import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { QRCodeCanvas } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import * as XLSX from 'xlsx';
import {
  QrCode, Search, UserCheck, Users, ShieldCheck, LogOut, Download,
  Plus, Trash2, Upload, CheckCircle2, AlertTriangle, XCircle,
  Lock, Unlock, Send, RefreshCw, Award, Eye
} from 'lucide-react';

const cleanDni = (val) => String(val || '').replace(/\D/g, '').slice(0, 8);

export default function App() {
  const [vista, setVista] = useState('EGRESADO'); // EGRESADO | STAFF_LOGIN | PUERTA | ADMIN
  const [session, setSession] = useState(null);
  const [perfilStaff, setPerfilStaff] = useState(null);

  // Datos globales sincronizados en tiempo real
  const [config, setConfig] = useState({ capacidad_total: 525, etapa_global: 'ABIERTO' });
  const [egresados, setEgresados] = useState([]);
  const [invitados, setInvitados] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [vips, setVips] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [usuariosStaff, setUsuariosStaff] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargarTodo = async () => {
    const [cfgRes, egRes, invRes, docRes, vipRes, solRes] = await Promise.all([
      supabase.from('configuracion_evento').select('*').eq('id', 1).single(),
      supabase.from('egresados').select('*').order('nombre_completo'),
      supabase.from('invitados').select('*').order('codigo_entrada'),
      supabase.from('docentes').select('*').order('nombre_completo'),
      supabase.from('invitados_especiales').select('*').order('nombre_completo'),
      supabase.from('solicitudes_butacas').select('*').order('creado_en', { ascending: false })
    ]);
    if (cfgRes.data) setConfig(cfgRes.data);
    if (egRes.data) setEgresados(egRes.data);
    if (invRes.data) setInvitados(invRes.data);
    if (docRes.data) setDocentes(docRes.data);
    if (vipRes.data) setVips(vipRes.data);
    if (solRes.data) setSolicitudes(solRes.data);
    setCargando(false);
  };

  useEffect(() => {
    cargarTodo();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) cargarPerfilStaff(session.user.id);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) cargarPerfilStaff(session.user.id);
      else {
        setPerfilStaff(null);
        setVista('EGRESADO');
      }
    });

    const channel = supabase
      .channel('colacion-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        cargarTodo();
      })
      .subscribe();

    return () => {
      authListener.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const cargarPerfilStaff = async (uid) => {
    const { data } = await supabase.from('perfiles_usuarios').select('*').eq('id', uid).single();
    if (data) {
      setPerfilStaff(data);
      if (data.rol === 'PUERTA') setVista('PUERTA');
      else setVista('ADMIN');
      if (data.rol === 'ADMIN') {
        const { data: users } = await supabase.from('perfiles_usuarios').select('*').order('creado_en');
        if (users) setUsuariosStaff(users);
      }
    }
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    setPerfilStaff(null);
    setVista('EGRESADO');
  };

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
          <p className="text-sm text-slate-300">Conectando con Colación 2026...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      {/* Barra superior institucional */}
      <header className="bg-slate-900 text-white px-4 py-3 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Award className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="font-bold text-sm sm:text-base leading-tight">Colación 2026 · Control de Acceso</h1>
            <p className="text-[11px] text-slate-400">Aforo Máximo: {config.capacidad_total} butacas · Tiempo Real</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!perfilStaff ? (
            <button
              onClick={() => setVista(vista === 'STAFF_LOGIN' ? 'EGRESADO' : 'STAFF_LOGIN')}
              className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              {vista === 'STAFF_LOGIN' ? 'Portal Egresados' : 'Acceso Personal / Puerta'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs bg-emerald-950 text-emerald-300 border border-emerald-700 px-2.5 py-1 rounded-full">
                {perfilStaff.nombre} ({perfilStaff.rol})
              </span>
              {(perfilStaff.rol === 'ADMIN' || perfilStaff.rol === 'COORDINADOR') && (
                <button
                  onClick={() => setVista(vista === 'PUERTA' ? 'ADMIN' : 'PUERTA')}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1.5 rounded-lg font-medium"
                >
                  {vista === 'PUERTA' ? 'Ir a Panel Admin' : 'Vista Puerta'}
                </button>
              )}
              <button
                onClick={cerrarSesion}
                className="text-xs bg-rose-600 hover:bg-rose-500 px-2.5 py-1.5 rounded-lg flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" /> Salir
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        {vista === 'STAFF_LOGIN' && !perfilStaff && <StaffLogin />}
        {vista === 'EGRESADO' && !perfilStaff && (
          <PortalEgresado
            config={config}
            egresados={egresados}
            invitados={invitados}
            solicitudes={solicitudes}
            onRefresh={cargarTodo}
          />
        )}
        {vista === 'PUERTA' && perfilStaff && (
          <ControlPuerta
            egresados={egresados}
            invitados={invitados}
            docentes={docentes}
            vips={vips}
            config={config}
            onRefresh={cargarTodo}
          />
        )}
        {vista === 'ADMIN' && perfilStaff && (perfilStaff.rol === 'ADMIN' || perfilStaff.rol === 'COORDINADOR') && (
          <PanelAdmin
            perfilStaff={perfilStaff}
            config={config}
            egresados={egresados}
            invitados={invitados}
            docentes={docentes}
            vips={vips}
            solicitudes={solicitudes}
            usuariosStaff={usuariosStaff}
            onRefresh={cargarTodo}
          />
        )}
      </main>
    </div>
  );
}

/* ==================== LOGIN STAFF (ADMIN / COORDINADOR / PUERTA) ==================== */
function StaffLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError('Credenciales inválidas o usuario no autorizado.');
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded-2xl shadow-lg border border-slate-200">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-slate-900 text-emerald-400 rounded-xl flex items-center justify-center mx-auto mb-3">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold">Acceso Personal Autorizado</h2>
        <p className="text-xs text-slate-500 mt-1">Administradores, Coordinadores y Control de Puerta</p>
      </div>
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Correo electrónico</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            placeholder="usuario@escuela.edu.ar"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Contraseña</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        {error && <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg">{error}</p>}
        <button
          disabled={loading}
          className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm"
        >
          {loading ? 'Ingresando...' : 'Iniciar Sesión'}
        </button>
      </form>
    </div>
  );
}

/* ==================== MÓDULO B: PORTAL EGRESADOS (CELULAR) ==================== */
function PortalEgresado({ config, egresados, invitados, solicitudes, onRefresh }) {
  const [dniInput, setDniInput] = useState('');
  const [egresadoActivo, setEgresadoActivo] = useState(null);
  const [errorLogin, setErrorLogin] = useState('');

  // Formulario nuevo invitado
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoDni, setNuevoDni] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Solicitud butacas extra
  const [mostrarModalExtra, setMostrarModalExtra] = useState(false);
  const [cantExtra, setCantExtra] = useState(1);
  const [motivoExtra, setMotivoExtra] = useState('');

  // Modal QR individual
  const [qrModalInvitado, setQrModalInvitado] = useState(null);

  const alumnoActual = egresadoActivo
    ? egresados.find((e) => e.id === egresadoActivo.id) || egresadoActivo
    : null;

  const buscarAlumno = (e) => {
    e.preventDefault();
    const limpio = cleanDni(dniInput);
    const encontrado = egresados.find((eg) => eg.dni === limpio);
    if (!encontrado) {
      setErrorLogin('No encontramos un egresado con ese DNI. Verificá que sean hasta 8 números sin puntos.');
      return;
    }
    setErrorLogin('');
    setEgresadoActivo(encontrado);
  };

  if (!alumnoActual) {
    return (
      <div className="max-w-md mx-auto mt-10 px-4">
        <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Portal de Invitados · Egresados</h2>
          <p className="text-xs text-slate-500 mt-1">
            Ingresá tu DNI (sin puntos ni espacios) para gestionar tus entradas y descargar los códigos QR.
          </p>
          <form onSubmit={buscarAlumno} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tu DNI (solo números, máx. 8 dígitos)</label>
              <input
                type="text"
                inputMode="numeric"
                value={dniInput}
                onChange={(e) => setDniInput(cleanDni(e.target.value))}
                placeholder="Ej: 44556677"
                className="w-full px-4 py-3 text-lg font-mono tracking-wider border-2 border-slate-300 rounded-xl focus:border-emerald-600 outline-none"
              />
            </div>
            {errorLogin && <p className="text-xs text-rose-600 bg-rose-50 p-3 rounded-xl">{errorLogin}</p>}
            <button className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow">
              Ingresar con mi DNI
            </button>
          </form>
        </div>
      </div>
    );
  }

  const misInvitados = invitados.filter((i) => i.egresado_id === alumnoActual.id);
  const misSolicitudes = solicitudes.filter((s) => s.egresado_id === alumnoActual.id);
  const solicitudPendiente = misSolicitudes.find((s) => s.estado === 'PENDIENTE');
  const ultimaResuelta = misSolicitudes.find((s) => s.estado !== 'PENDIENTE');

  const puedeEditar =
    !alumnoActual.cerrado_por_alumno &&
    (config.etapa_global === 'ABIERTO' ||
      (config.etapa_global === 'CIERRE_PARCIAL' && alumnoActual.habilitado_excepcional));

  const agregarFamiliar = async (e) => {
    e.preventDefault();
    if (!nuevoNombre.trim() || nuevoDni.length < 7) return;
    if (misInvitados.length >= alumnoActual.cupo_familiares) return;
    setGuardando(true);
    await supabase.from('invitados').insert({
      egresado_id: alumnoActual.id,
      dni: cleanDni(nuevoDni),
      nombre_completo: nuevoNombre.trim()
    });
    setNuevoNombre('');
    setNuevoDni('');
    setGuardando(false);
    onRefresh();
  };

  const eliminarFamiliar = async (id) => {
    if (!puedeEditar) return;
    await supabase.from('invitados').delete().eq('id', id);
    onRefresh();
  };

  const cerrarDefinitivoAlumno = async () => {
    if (!window.confirm('¿Confirmás que ya no vas a realizar más cambios? Tus lugares libres quedarán disponibles para reasignación.')) return;
    await supabase
      .from('egresados')
      .update({ cerrado_por_alumno: true, habilitado_excepcional: false })
      .eq('id', alumnoActual.id);
    onRefresh();
  };

  const enviarSolicitudExtra = async (e) => {
    e.preventDefault();
    await supabase.from('solicitudes_butacas').insert({
      egresado_id: alumnoActual.id,
      cantidad_solicitada: Number(cantExtra),
      motivo: motivoExtra.trim()
    });
    setMostrarModalExtra(false);
    setMotivoExtra('');
    onRefresh();
  };

  const descargarTarjetaQR = (inv) => {
    const canvas = document.getElementById(`qr-canvas-${inv.id}`);
    if (!canvas) return;
    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `Entrada-${inv.codigo_entrada}-${inv.nombre_completo.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 pb-16">
      {/* Cabecera Alumno */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
            Egresado Verificado
          </span>
          <h2 className="text-lg font-bold mt-1">{alumnoActual.nombre_completo}</h2>
          <p className="text-xs text-slate-500">DNI: {alumnoActual.dni} · Cupo asignado: <b>{alumnoActual.cupo_familiares} lugares</b></p>
        </div>
        <button onClick={() => setEgresadoActivo(null)} className="text-xs text-slate-500 underline">
          Cambiar DNI
        </button>
      </div>

      {/* Notificación de solicitud resuelta */}
      {ultimaResuelta && (
        <div
          className={`p-3.5 rounded-xl border text-xs ${
            ultimaResuelta.estado === 'APROBADA'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-amber-50 border-amber-300 text-amber-900'
          }`}
        >
          {ultimaResuelta.estado === 'APROBADA' ? (
            <p>
              <b>¡Solicitud Aprobada!</b> Se te asignaron <b>+{ultimaResuelta.cantidad_aprobada} butacas extra</b>. Ya podés cargar a tus nuevos familiares y descargar sus entradas QR.
            </p>
          ) : (
            <p>
              Tu solicitud de lugares adicionales fue revisada pero no pudo aprobarse por disponibilidad de sala.
            </p>
          )}
        </div>
      )}

      {/* Aviso de etapa global */}
      {!puedeEditar && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3.5 rounded-xl text-xs flex items-start gap-2">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <b>Edición cerrada:</b>{' '}
            {alumnoActual.cerrado_por_alumno
              ? 'Ya confirmaste el cierre definitivo de tu lista. Podés seguir descargando los QR de tus invitados cargados.'
              : 'La etapa de carga general está pausada por Administración. Si te asignan vacantes extra, se te habilitará automáticamente.'}
          </div>
        </div>
      )}

      {/* Advertencia de revisión de datos */}
      <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-xl text-xs flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
        <p>
          <b>Importante:</b> Revisá cuidadosamente el <b>Nombre Completo y DNI</b> de cada invitado antes de guardar. El día del evento se controlará el QR junto con el documento.
        </p>
      </div>

      {/* Lista de Invitados Cargados y Descarga QR */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">
            Mis Invitados ({misInvitados.length} / {alumnoActual.cupo_familiares})
          </h3>
          {config.etapa_global !== 'CIERRE_DEFINITIVO' && !solicitudPendiente && (
            <button
              onClick={() => setMostrarModalExtra(true)}
              className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Solicitar más butacas
            </button>
          )}
          {solicitudPendiente && (
            <span className="text-[11px] bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-medium">
              Pedido de +{solicitudPendiente.cantidad_solicitada} en revisión
            </span>
          )}
        </div>

        {misInvitados.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">Todavía no cargaste ningún invitado.</p>
        )}

        <div className="space-y-2.5">
          {misInvitados.map((inv) => (
            <div key={inv.id} className="p-3 border rounded-xl bg-slate-50 flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-mono font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                  {inv.codigo_entrada}
                </span>
                <p className="font-bold text-sm mt-0.5">{inv.nombre_completo}</p>
                <p className="text-xs text-slate-500">DNI: {inv.dni}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setQrModalInvitado(inv)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1 shadow-sm"
                >
                  <QrCode className="w-4 h-4" /> Entrada QR
                </button>
                {puedeEditar && (
                  <button
                    onClick={() => eliminarFamiliar(inv.id)}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                    title="Quitar invitado"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Formulario agregar invitado */}
        {puedeEditar && misInvitados.length < alumnoActual.cupo_familiares && (
          <form onSubmit={agregarFamiliar} className="pt-3 border-t space-y-2.5">
            <p className="text-xs font-bold text-slate-700">
              Cargar Invitado #{misInvitados.length + 1}
            </p>
            <input
              type="text"
              required
              placeholder="Nombre y Apellido completo del familiar"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm"
            />
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                required
                placeholder="DNI (8 dígitos sin puntos)"
                value={nuevoDni}
                onChange={(e) => setNuevoDni(cleanDni(e.target.value))}
                className="flex-1 px-3 py-2 border rounded-xl text-sm font-mono"
              />
              <button
                disabled={guardando}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl"
              >
                {guardando ? 'Guardando...' : 'Guardar y Generar QR'}
              </button>
            </div>
          </form>
        )}

        {/* Botón cierre definitivo del alumno */}
        {puedeEditar && (
          <div className="pt-3 border-t">
            <button
              onClick={cerrarDefinitivoAlumno}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-semibold rounded-xl text-xs"
            >
              Ya no hago más cambios (Cerrar mi lista)
            </button>
          </div>
        )}
      </div>

      {/* Modal Solicitar Más Butacas */}
      {mostrarModalExtra && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-base">Solicitar Butacas Adicionales</h3>
            <p className="text-xs text-slate-500">
              Si quedan lugares vacantes en el salón, Administración podrá asignarte butacas extra y avisarte.
            </p>
            <form onSubmit={enviarSolicitudExtra} className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">¿Cuántos lugares extra necesitás?</label>
                <select
                  value={cantExtra}
                  onChange={(e) => setCantExtra(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>+{n} {n === 1 ? 'butaca extra' : 'butacas extra'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Motivo / Parentesco (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Abuelos o hermanos"
                  value={motivoExtra}
                  onChange={(e) => setMotivoExtra(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMostrarModalExtra(false)}
                  className="flex-1 py-2 border rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">
                  Enviar Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Visualización y Descarga de QR Único */}
      {qrModalInvitado && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xs w-full p-5 text-center space-y-3 shadow-2xl">
            <div className="bg-slate-900 text-white py-2 px-3 rounded-xl">
              <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Pase Oficial Colación 2026</p>
              <p className="font-mono font-bold text-sm">{qrModalInvitado.codigo_entrada}</p>
            </div>
            <div className="py-2 flex justify-center">
              <QRCodeCanvas
                id={`qr-canvas-${qrModalInvitado.id}`}
                value={qrModalInvitado.codigo_entrada}
                size={190}
                level="H"
                includeMargin={true}
              />
            </div>
            <div>
              <p className="font-bold text-base text-slate-900">{qrModalInvitado.nombre_completo}</p>
              <p className="text-xs text-slate-600">DNI: {qrModalInvitado.dni}</p>
              <p className="text-[11px] text-slate-400 mt-1">Invitado de: {alumnoActual.nombre_completo}</p>
            </div>
            <p className="text-[10px] text-slate-50 bg-slate-100 p-2 rounded-lg">
              Presentá este QR en la puerta junto con tu DNI. Uso único e intransferible.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setQrModalInvitado(null)}
                className="flex-1 py-2.5 border rounded-xl text-xs font-semibold"
              >
                Cerrar
              </button>
              <button
                onClick={() => descargarTarjetaQR(qrModalInvitado)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
              >
                <Download className="w-4 h-4" /> Descargar QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== MÓDULO C: CONTROL DE PUERTA (ESCÁNER QR + 2 PASOS) ==================== */
function ControlPuerta({ egresados, invitados, docentes, vips, config, onRefresh }) {
  const [escaneando, setEscaneando] = useState(false);
  const [resultadoScan, setResultadoScan] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [egresadoSeleccionadoId, setEgresadoSeleccionadoId] = useState(null);

  const totalPresentes =
    egresados.filter((e) => e.asistio).length +
    invitados.filter((i) => i.asistio).length +
    docentes.filter((d) => d.asistio).length +
    vips.filter((v) => v.asistio).length;

  useEffect(() => {
    if (!escaneando) return;
    const scanner = new Html5QrcodeScanner('lector-qr-puerta', { fps: 10, qrbox: 220 }, false);
    scanner.render(
      async (decodedText) => {
        scanner.clear();
        setEscaneando(false);
        await procesarCodigoQR(decodedText.trim().toUpperCase());
      },
      () => {}
    );
    return () => {
      scanner.clear().catch(() => {});
    };
  }, [escaneando, invitados]);

  const procesarCodigoQR = async (codigo) => {
    const inv = invitados.find((i) => i.codigo_entrada.toUpperCase() === codigo);
    if (!inv) {
      setResultadoScan({ tipo: 'ERROR', mensaje: `Código no válido o inexistente: ${codigo}` });
      return;
    }
    const titular = egresados.find((e) => e.id === inv.egresado_id);
    if (inv.asistio) {
      const hora = inv.hora_ingreso
        ? new Date(inv.hora_ingreso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : 'anteriormente';
      setResultadoScan({
        tipo: 'DUPLICADO',
        mensaje: `¡ALERTA! Entrada ${inv.codigo_entrada} YA INGRESÓ (${hora} hs).`,
        invitado: inv,
        titular
      });
      return;
    }

    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from('invitados')
      .update({ asistio: true, hora_ingreso: ahora })
      .eq('id', inv.id);

    if (error) {
      setResultadoScan({ tipo: 'ERROR', mensaje: 'Sin permisos de servidor para validar ingreso.' });
      return;
    }

    setResultadoScan({
      tipo: 'OK',
      mensaje: `INGRESO VALIDADO · ${inv.codigo_entrada}`,
      invitado: inv,
      titular
    });
    onRefresh();
  };

  const toggleAsistenciaInvitado = async (inv) => {
    await supabase
      .from('invitados')
      .update({ asistio: !inv.asistio, hora_ingreso: !inv.asistio ? new Date().toISOString() : null })
      .eq('id', inv.id);
    onRefresh();
  };

  const toggleAsistenciaEgresado = async (eg) => {
    await supabase
      .from('egresados')
      .update({ asistio: !eg.asistio, hora_ingreso: !eg.asistio ? new Date().toISOString() : null })
      .eq('id', eg.id);
    onRefresh();
  };

  // Buscador en 2 pasos
  const q = busqueda.trim().toLowerCase();
  const egresadosFiltrados = q
    ? egresados.filter((eg) => {
        const matchEg = eg.nombre_completo.toLowerCase().includes(q) || eg.dni.includes(q);
        const matchInv = invitados.some(
          (i) =>
            i.egresado_id === eg.id &&
            (i.nombre_completo.toLowerCase().includes(q) ||
              i.dni.includes(q) ||
              i.codigo_entrada.toLowerCase().includes(q))
        );
        return matchEg || matchInv;
      })
    : [];

  const fichaEgresado = egresados.find((e) => e.id === egresadoSeleccionadoId);

  return (
    <div className="max-w-md mx-auto p-4 space-y-4 pb-16">
      {/* Contador en vivo */}
      <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between">
        <span className="text-xs text-slate-300">Ingresos en sala ahora:</span>
        <span className="font-mono font-bold text-lg text-emerald-400">
          {totalPresentes} / {config.capacidad_total}
        </span>
      </div>

      {/* Botón Principal Escáner QR */}
      {!escaneando ? (
        <button
          onClick={() => {
            setResultadoScan(null);
            setEscaneando(true);
          }}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2.5 text-base"
        >
          <QrCode className="w-6 h-6" /> Escanear QR de Entrada
        </button>
      ) : (
        <div className="bg-white p-4 rounded-2xl border shadow space-y-3">
          <div id="lector-qr-puerta" className="w-full overflow-hidden rounded-xl" />
          <button
            onClick={() => setEscaneando(false)}
            className="w-full py-2 bg-slate-200 text-slate-800 rounded-xl text-xs font-bold"
          >
            Cancelar Escáner
          </button>
        </div>
      )}

      {/* Alerta visual de resultado de escaneo */}
      {resultadoScan && (
        <div
          className={`p-4 rounded-2xl border-2 shadow-md ${
            resultadoScan.tipo === 'OK'
              ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
              : 'bg-rose-50 border-rose-500 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            {resultadoScan.tipo === 'OK' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
            )}
            <span>{resultadoScan.mensaje}</span>
          </div>
          {resultadoScan.invitado && (
            <div className="mt-2 pl-8 text-xs space-y-0.5">
              <p className="font-bold text-base">{resultadoScan.invitado.nombre_completo}</p>
              <p>DNI: {resultadoScan.invitado.dni}</p>
              <p className="text-slate-600">Acompaña a: {resultadoScan.titular?.nombre_completo}</p>
            </div>
          )}
        </div>
      )}

      {/* Respaldo Manual en 2 Pasos */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
          Respaldo Manual (Sin QR / Sin Batería)
        </p>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setEgresadoSeleccionadoId(null);
            }}
            placeholder="Buscar por Nombre, DNI o ENT-1001..."
            className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm outline-none focus:border-slate-900"
          />
        </div>

        {/* Paso 1: Lista de egresados coincidentes */}
        {q && !fichaEgresado && (
          <div className="space-y-2 pt-1">
            {egresadosFiltrados.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-3">Sin coincidencias.</p>
            )}
            {egresadosFiltrados.map((eg) => {
              const invs = invitados.filter((i) => i.egresado_id === eg.id);
              const presentes = invs.filter((i) => i.asistio).length;
              return (
                <button
                  key={eg.id}
                  onClick={() => setEgresadoSeleccionadoId(eg.id)}
                  className="w-full text-left p-3 border rounded-xl hover:bg-slate-50 flex items-center justify-between"
                >
                  <div>
                    <p className="font-bold text-sm">{eg.nombre_completo}</p>
                    <p className="text-xs text-slate-500">DNI: {eg.dni}</p>
                  </div>
                  <span className="text-xs font-semibold bg-slate-100 px-2.5 py-1 rounded-lg">
                    Invitados: {presentes}/{invs.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Paso 2: Ficha del grupo familiar para tildar Asistió */}
        {fichaEgresado && (
          <div className="space-y-2.5 pt-2 border-t">
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm">{fichaEgresado.nombre_completo}</p>
              <button
                onClick={() => setEgresadoSeleccionadoId(null)}
                className="text-xs text-indigo-600 font-semibold"
              >
                ← Volver
              </button>
            </div>

            {/* Check egresado */}
            <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-indigo-950">EGRESADO TITULAR</p>
                <p className="text-xs text-indigo-700">DNI: {fichaEgresado.dni}</p>
              </div>
              <button
                onClick={() => toggleAsistenciaEgresado(fichaEgresado)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  fichaEgresado.asistio
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white border border-slate-300 text-slate-700'
                }`}
              >
                {fichaEgresado.asistio ? '✓ Asistió' : 'Marcar Presente'}
              </button>
            </div>

            {/* Check familiares */}
            {invitados
              .filter((i) => i.egresado_id === fichaEgresado.id)
              .map((inv) => (
                <div key={inv.id} className="p-2.5 border rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded">{inv.codigo_entrada}</span>
                    <p className="text-sm font-semibold">{inv.nombre_completo}</p>
                    <p className="text-xs text-slate-500">DNI: {inv.dni}</p>
                  </div>
                  <button
                    onClick={() => toggleAsistenciaInvitado(inv)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      inv.asistio
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    {inv.asistio ? '✓ Asistió' : 'Marcar Presente'}
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== MÓDULO A: PANEL ADMINISTRACIÓN Y COORDINACIÓN ==================== */
function PanelAdmin({
  perfilStaff, config, egresados, invitados, docentes, vips, solicitudes, usuariosStaff, onRefresh
}) {
  const [tab, setTab] = useState('VACANTES'); // VACANTES | PADRON | DOCENTES_VIP | REPORTES | USUARIOS
  const [nuevoEgNombre, setNuevoEgNombre] = useState('');
  const [nuevoEgDni, setNuevoEgDni] = useState('');
  const [nuevoDocNombre, setNuevoDocNombre] = useState('');
  const [nuevoDocDni, setNuevoDocDni] = useState('');
  const [nuevoVipNombre, setNuevoVipNombre] = useState('');
  const [nuevoVipDni, setNuevoVipDni] = useState('');

  // Cálculo dinámico de aforo sobre 525
  const totalEgresados = egresados.length;
  const totalDocentes = docentes.length;
  const totalVips = vips.length;
  const cuposFamiliaresAsignados = egresados.reduce((acc, e) => acc + e.cupo_familiares, 0);
  const ocupacionTotal = totalEgresados + totalDocentes + totalVips + cuposFamiliaresAsignados;
  const vacantesDisponibles = config.capacidad_total - ocupacionTotal;

  // Lugares reservados pero no cargados por los alumnos
  const cuposSinUsarEnPadron = egresados.reduce((acc, e) => {
    const cargados = invitados.filter((i) => i.egresado_id === e.id).length;
    return acc + Math.max(0, e.cupo_familiares - cargados);
  }, 0);

  const cambiarEtapaGlobal = async (etapa) => {
    await supabase.from('configuracion_evento').update({ etapa_global: etapa }).eq('id', 1);
    onRefresh();
  };

  const recuperarVacantesMasivo = async () => {
    if (!window.confirm(`¿Recuperar ${cuposSinUsarEnPadron} lugares vacíos sin usar del padrón para poder reasignarlos?`)) return;
    for (const eg of egresados) {
      const cargados = invitados.filter((i) => i.egresado_id === eg.id).length;
      if (eg.cupo_familiares > cargados) {
        await supabase.from('egresados').update({ cupo_familiares: cargados }).eq('id', eg.id);
      }
    }
    onRefresh();
  };

  const resolverSolicitud = async (sol, aprobar, cantidadOtorgada) => {
    const eg = egresados.find((e) => e.id === sol.egresado_id);
    if (!eg) return;
    if (aprobar) {
      await supabase
        .from('egresados')
        .update({
          cupo_familiares: eg.cupo_familiares + Number(cantidadOtorgada),
          cerrado_por_alumno: false,
          habilitado_excepcional: true
        })
        .eq('id', eg.id);
      await supabase
        .from('solicitudes_butacas')
        .update({ estado: 'APROBADA', cantidad_aprobada: Number(cantidadOtorgada) })
        .eq('id', sol.id);
    } else {
      await supabase.from('solicitudes_butacas').update({ estado: 'RECHAZADA' }).eq('id', sol.id);
    }
    onRefresh();
  };

  const asignarDirecto = async (egId, delta) => {
    const eg = egresados.find((e) => e.id === egId);
    if (!eg) return;
    const nuevoCupo = Math.max(0, eg.cupo_familiares + delta);
    await supabase
      .from('egresados')
      .update({
        cupo_familiares: nuevoCupo,
        cerrado_por_alumno: delta > 0 ? false : eg.cerrado_por_alumno,
        habilitado_excepcional: delta > 0 ? true : eg.habilitado_excepcional
      })
      .eq('id', egId);
    onRefresh();
  };

  const importarExcelEgresados = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const registros = rows
        .map((r) => ({
          dni: cleanDni(r.DNI || r.dni || r.Documento),
          nombre_completo: String(r.Nombre || r.nombre || r.Alumno || r['Nombre y Apellido'] || '').trim()
        }))
        .filter((r) => r.dni.length >= 7 && r.nombre_completo);
      if (registros.length > 0) {
        await supabase.from('egresados').upsert(registros, { onConflict: 'dni' });
        alert(`Se importaron ${registros.length} egresados correctamente.`);
        onRefresh();
      }
    };
    reader.readAsBinaryString(file);
  };

  const agregarEgresadoManual = async (e) => {
    e.preventDefault();
    if (!nuevoEgNombre.trim() || nuevoEgDni.length < 7) return;
    await supabase.from('egresados').insert({ dni: cleanDni(nuevoEgDni), nombre_completo: nuevoEgNombre.trim() });
    setNuevoEgNombre('');
    setNuevoEgDni('');
    onRefresh();
  };

  const agregarDocente = async (e) => {
    e.preventDefault();
    if (!nuevoDocNombre.trim() || nuevoDocDni.length < 7) return;
    await supabase.from('docentes').insert({ dni: cleanDni(nuevoDocDni), nombre_completo: nuevoDocNombre.trim() });
    setNuevoDocNombre('');
    setNuevoDocDni('');
    onRefresh();
  };

  const agregarVip = async (e) => {
    e.preventDefault();
    if (!nuevoVipNombre.trim() || nuevoVipDni.length < 7) return;
    await supabase.from('invitados_especiales').insert({ dni: cleanDni(nuevoVipDni), nombre_completo: nuevoVipNombre.trim() });
    setNuevoVipNombre('');
    setNuevoVipDni('');
    onRefresh();
  };

  const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE');

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Monitor de Aforo en Tiempo Real (525 Butacas) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border shadow-sm">
          <p className="text-[11px] text-slate-500">Egresados</p>
          <p className="text-xl font-bold">{totalEgresados}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border shadow-sm">
          <p className="text-[11px] text-slate-500">Docentes</p>
          <p className="text-xl font-bold">{totalDocentes}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border shadow-sm">
          <p className="text-[11px] text-slate-500">Especiales / VIP</p>
          <p className="text-xl font-bold">{totalVips}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border shadow-sm">
          <p className="text-[11px] text-slate-500">Cupos Familiares</p>
          <p className="text-xl font-bold">{cuposFamiliaresAsignados}</p>
        </div>
        <div className={`p-3.5 rounded-xl border shadow-sm ${vacantesDisponibles >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-300'}`}>
          <p className="text-[11px] font-semibold text-slate-600">Vacantes Libres (de {config.capacidad_total})</p>
          <p className={`text-xl font-bold ${vacantesDisponibles >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {vacantesDisponibles}
          </p>
        </div>
      </div>

      {/* Selector de 3 Etapas Globales */}
      <div className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Etapa Global de Carga</p>
          <p className="text-xs text-slate-600">Controlá cuándo los egresados pueden cargar o cuándo congelar para reubicar vacantes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'ABIERTO', label: '1. Carga Abierta' },
            { id: 'CIERRE_PARCIAL', label: '2. Cierre Parcial (Reubicar Vacantes)' },
            { id: 'CIERRE_DEFINITIVO', label: '3. Cierre Definitivo' }
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => cambiarEtapaGlobal(st.id)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                config.etapa_global === st.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Navegación de pestañas */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {[
          { id: 'VACANTES', label: `Solicitudes y Vacantes (${pendientes.length})` },
          { id: 'PADRON', label: `Egresados (${totalEgresados})` },
          { id: 'DOCENTES_VIP', label: `Docentes (${totalDocentes}) y VIP (${totalVips})` },
          { id: 'REPORTES', label: 'Acreditación en Vivo' },
          ...(perfilStaff.rol === 'ADMIN' ? [{ id: 'USUARIOS', label: 'Usuarios del Sistema' }] : [])
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
              tab === t.id ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 border'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: SOLICITUDES Y REUBICACIÓN EN CIERRE PARCIAL */}
      {tab === 'VACANTES' && (
        <div className="space-y-4">
          {config.etapa_global === 'CIERRE_PARCIAL' && (
            <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-bold text-sm text-amber-950">Modo Cierre Parcial Activo</p>
                <p className="text-xs text-amber-800">
                  Hay <b>{cuposSinUsarEnPadron} lugares asignados sin cargar</b> en el padrón. Podés recuperarlos para sumarlos a tus <b>{vacantesDisponibles} vacantes libres</b>.
                </p>
              </div>
              {cuposSinUsarEnPadron > 0 && (
                <button
                  onClick={recuperarVacantesMasivo}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shrink-0"
                >
                  Recuperar {cuposSinUsarEnPadron} Vacantes Sin Usar
                </button>
              )}
            </div>
          )}

          <div className="bg-white p-4 rounded-2xl border shadow-sm space-y-3">
            <h3 className="font-bold text-sm">Pedidos de Butacas Extra de Egresados</h3>
            {solicitudes.length === 0 && <p className="text-xs text-slate-400">No hay solicitudes registradas.</p>}
            {solicitudes.map((sol) => {
              const eg = egresados.find((e) => e.id === sol.egresado_id);
              const textoWa = encodeURIComponent(
                `Hola ${eg?.nombre_completo}, te avisamos desde la organización de la Colación 2026 que se te aprobaron +${sol.cantidad_aprobada || sol.cantidad_solicitada} butacas extra. Ya podés ingresar con tu DNI al portal para cargar los datos y descargar las entradas QR.`
              );
              return (
                <div key={sol.id} className="p-3.5 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm">{eg?.nombre_completo} (DNI {eg?.dni})</p>
                    <p className="text-xs text-slate-600">
                      Solicita: <b>+{sol.cantidad_solicitada} lugares</b> {sol.motivo && `· Motivo: "${sol.motivo}"`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sol.estado === 'PENDIENTE' ? (
                      <>
                        <button
                          onClick={() => resolverSolicitud(sol, true, sol.cantidad_solicitada)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg"
                        >
                          Aprobar +{sol.cantidad_solicitada}
                        </button>
                        <button
                          onClick={() => resolverSolicitud(sol, false, 0)}
                          className="bg-rose-100 text-rose-700 text-xs font-bold px-3 py-2 rounded-lg"
                        >
                          Rechazar
                        </button>
                      </>
                    ) : (
                      <>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${sol.estado === 'APROBADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {sol.estado} {sol.estado === 'APROBADA' && `(+${sol.cantidad_aprobada})`}
                        </span>
                        {sol.estado === 'APROBADA' && (
                          <a
                            href={`https://wa.me/?text=${textoWa}`}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
                          >
                            <Send className="w-3.5 h-3.5" /> Avisar por WhatsApp
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PADRÓN DE EGRESADOS Y IMPORTACIÓN EXCEL */}
      {tab === 'PADRON' && (
        <div className="bg-white p-4 rounded-2xl border shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
            <form onSubmit={agregarEgresadoManual} className="flex flex-wrap gap-2">
              <input
                type="text"
                required
                placeholder="Nombre y Apellido"
                value={nuevoEgNombre}
                onChange={(e) => setNuevoEgNombre(e.target.value)}
                className="border rounded-xl px-3 py-2 text-xs"
              />
              <input
                type="text"
                required
                placeholder="DNI (8 dígitos)"
                value={nuevoEgDni}
                onChange={(e) => setNuevoEgDni(cleanDni(e.target.value))}
                className="border rounded-xl px-3 py-2 text-xs font-mono w-36"
              />
              <button className="bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-xl">
                + Agregar Egresado
              </button>
            </form>

            <label className="cursor-pointer bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 w-fit">
              <Upload className="w-4 h-4" /> Importar Excel/CSV (DNI, Nombre)
              <input type="file" accept=".xlsx,.xls,.csv" onChange={importarExcelEgresados} className="hidden" />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">Egresado</th>
                  <th>DNI</th>
                  <th>Invitados Cargados / Cupo</th>
                  <th>Reubicar Cupo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {egresados.map((eg) => {
                  const cargados = invitados.filter((i) => i.egresado_id === eg.id).length;
                  return (
                    <tr key={eg.id}>
                      <td className="py-2.5 font-semibold">{eg.nombre_completo}</td>
                      <td className="font-mono">{eg.dni}</td>
                      <td>
                        <b>{cargados}</b> / {eg.cupo_familiares}
                      </td>
                      <td className="space-x-1">
                        <button
                          onClick={() => asignarDirecto(eg.id, -1)}
                          className="px-2 py-0.5 border rounded bg-slate-50 hover:bg-slate-100 font-bold"
                        >
                          -1
                        </button>
                        <button
                          onClick={() => asignarDirecto(eg.id, 1)}
                          className="px-2 py-0.5 border rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold"
                        >
                          +1
                        </button>
                      </td>
                      <td>
                        {eg.cerrado_por_alumno ? (
                          <span className="text-[11px] bg-slate-200 px-2 py-0.5 rounded">Cerrado</span>
                        ) : (
                          <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">Habilitado</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DOCENTES Y INVITADOS ESPECIALES VIP */}
      {tab === 'DOCENTES_VIP' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl border shadow-sm space-y-3">
            <h3 className="font-bold text-sm">Docentes ({docentes.length})</h3>
            <form onSubmit={agregarDocente} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Nombre docente"
                value={nuevoDocNombre}
                onChange={(e) => setNuevoDocNombre(e.target.value)}
                className="flex-1 border rounded-xl px-3 py-2 text-xs"
              />
              <input
                type="text"
                required
                placeholder="DNI"
                value={nuevoDocDni}
                onChange={(e) => setNuevoDocDni(cleanDni(e.target.value))}
                className="w-28 border rounded-xl px-3 py-2 text-xs font-mono"
              />
              <button className="bg-slate-900 text-white text-xs font-bold px-3 rounded-xl">+</button>
            </form>
            <div className="divide-y max-h-64 overflow-y-auto text-xs">
              {docentes.map((d) => (
                <div key={d.id} className="py-2 flex justify-between">
                  <span>{d.nombre_completo} <span className="text-slate-400">({d.dni})</span></span>
                  <button onClick={async () => { await supabase.from('docentes').delete().eq('id', d.id); onRefresh(); }} className="text-rose-600">Quitar</button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border shadow-sm space-y-3">
            <h3 className="font-bold text-sm">Invitados Especiales / Autoridades ({vips.length})</h3>
            <form onSubmit={agregarVip} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Nombre autoridad / VIP"
                value={nuevoVipNombre}
                onChange={(e) => setNuevoVipNombre(e.target.value)}
                className="flex-1 border rounded-xl px-3 py-2 text-xs"
              />
              <input
                type="text"
                required
                placeholder="DNI"
                value={nuevoVipDni}
                onChange={(e) => setNuevoVipDni(cleanDni(e.target.value))}
                className="w-28 border rounded-xl px-3 py-2 text-xs font-mono"
              />
              <button className="bg-slate-900 text-white text-xs font-bold px-3 rounded-xl">+</button>
            </form>
            <div className="divide-y max-h-64 overflow-y-auto text-xs">
              {vips.map((v) => (
                <div key={v.id} className="py-2 flex justify-between">
                  <span>{v.nombre_completo} <span className="text-slate-400">({v.dni})</span></span>
                  <button onClick={async () => { await supabase.from('invitados_especiales').delete().eq('id', v.id); onRefresh(); }} className="text-rose-600">Quitar</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: REPORTES EN VIVO PARA CEREMONIAL */}
      {tab === 'REPORTES' && (
        <div className="bg-white p-4 rounded-2xl border shadow-sm space-y-3">
          <h3 className="font-bold text-sm">Egresados Acreditados en Sala (Para entrega de diplomas)</h3>
          <p className="text-xs text-slate-500">
            Presentes: <b>{egresados.filter((e) => e.asistio).length}</b> de {egresados.length} egresados.
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
            {egresados.map((eg) => (
              <div
                key={eg.id}
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                  eg.asistio ? 'bg-emerald-50 border-emerald-300 font-bold' : 'bg-slate-50 text-slate-400'
                }`}
              >
                <span>{eg.nombre_completo}</span>
                <span>{eg.asistio ? '✓ Presente' : 'Ausente'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: USUARIOS STAFF (EXCLUSIVO ADMIN) */}
      {tab === 'USUARIOS' && perfilStaff.rol === 'ADMIN' && (
        <div className="bg-white p-4 rounded-2xl border shadow-sm space-y-3">
          <h3 className="font-bold text-sm">Usuarios del Sistema Habilitados</h3>
          <p className="text-xs text-slate-500">
            Para agregar nuevos Coordinadores o personal de Puerta, crealos en Supabase → Authentication → Users y asignales rol en <code>perfiles_usuarios</code>.
          </p>
          <div className="divide-y text-xs">
            {usuariosStaff.map((u) => (
              <div key={u.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-bold">{u.nombre}</p>
                  <p className="text-slate-500">{u.email}</p>
                </div>
                <span className="font-mono font-bold bg-slate-100 px-2.5 py-1 rounded">{u.rol}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
