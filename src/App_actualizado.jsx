import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import {
  Users, GraduationCap, UserCheck, Shield, QrCode, Search, Plus, Trash2,
  Upload, Download, CheckCircle2, AlertTriangle, XCircle, Lock, Unlock,
  LogOut, RefreshCw, Send, MessageSquare, Award, ClipboardList, UserPlus,
  Settings, Eye, EyeOff, ArrowRight, Check, Info, Sparkles, Camera
} from 'lucide-react';

// Cliente secundario sin persistencia de sesión para crear usuarios sin cerrar la sesión del Administrador
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseAdminHelper = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

const CAPACIDAD_TOTAL = 525;
const CUPO_BASE_DEFAULT = 3; // 114 egresados * 3 = 342 + 114 + 39 = 495 (deja 30 libres en 525)

// Sanitización estricta de DNI: solo dígitos, máximo 8 caracteres
const sanitizarDNI = (valor) => {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\D/g, '').slice(0, 8);
};

// Parser robusto de CSV (soporta coma ',', punto y coma ';', comillas y BOM UTF-8)
const parsearCSV = (texto) => {
  const limpio = texto.replace(/^\uFEFF/, '').trim();
  if (!limpio) return [];
  const lineas = limpio.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length < 2) return [];

  const primeraLinea = lineas[0];
  const sep = (primeraLinea.match(/;/g) || []).length > (primeraLinea.match(/,/g) || []).length ? ';' : ',';

  const splitLinea = (linea) => {
    const res = [];
    let actual = '';
    let enComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i];
      if (ch === '"') {
        enComillas = !enComillas;
      } else if (ch === sep && !enComillas) {
        res.push(actual.trim());
        actual = '';
      } else {
        actual += ch;
      }
    }
    res.push(actual.trim());
    return res;
  };

  const headers = splitLinea(lineas[0]).map((h) =>
    h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  );

  return lineas.slice(1).map((linea) => {
    const cols = splitLinea(linea);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] !== undefined ? cols[idx].trim() : '';
    });
    return obj;
  });
};

// Generador de código QR SVG/Canvas sin dependencias externas rotas (usa API rápida confiable con fallback SVG)
const QRVisual = ({ value, size = 180 }) => {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&margin=8`;
  return (
    <div className="inline-flex flex-col items-center justify-center bg-white p-3 rounded-xl border-2 border-slate-200 shadow-sm">
      <img
        src={qrUrl}
        alt={`QR ${value}`}
        width={size}
        height={size}
        className="rounded-md"
        crossOrigin="anonymous"
      />
      <span className="mt-2 font-mono text-xs font-bold tracking-widest text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded">
        {value}
      </span>
    </div>
  );
};

export default function App() {
  // Navegación principal: 'egresado' | 'login' | 'admin' | 'puerta'
  const [vista, setVista] = useState('egresado');
  const [usuarioAuth, setUsuarioAuth] = useState(null);
  const [perfilUsuario, setPerfilUsuario] = useState(null);
  const [cargandoGlobal, setCargandoGlobal] = useState(true);
  const [notificacion, setNotificacion] = useState(null);

  // Configuración global del sistema
  const [estadoEtapa, setEstadoEtapa] = useState('abierta'); // 'abierta' | 'parcial' | 'cerrada'
  const [cupoBase, setCupoBase] = useState(CUPO_BASE_DEFAULT);

  // Datos principales
  const [egresados, setEgresados] = useState([]);
  const [familiares, setFamiliares] = useState([]);
  const [docentes, setDocentes] = useState([]);
  const [invitadosEspeciales, setInvitadosEspeciales] = useState([]);
  const [solicitudesExtra, setSolicitudesExtra] = useState([]);
  const [usuariosSistema, setUsuariosSistema] = useState([]);

  // Login Staff
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginCargando, setLoginCargando] = useState(false);

  // Portal Egresado
  const [dniAlumnoInput, setDniAlumnoInput] = useState('');
  const [alumnoActivoId, setAlumnoActivoId] = useState(null);
  const [formFamiliares, setFormFamiliares] = useState([]);
  const [guardandoAlumno, setGuardandoAlumno] = useState(false);
  const [modalExtraAbierto, setModalExtraAbierto] = useState(false);
  const [cantExtraSolicitada, setCantExtraSolicitada] = useState(1);
  const [motivoExtra, setMotivoExtra] = useState('');

  // Panel Admin tabs: 'aforo' | 'egresados' | 'docentes' | 'vip' | 'solicitudes' | 'usuarios' | 'reportes'
  const [tabAdmin, setTabAdmin] = useState('egresados');
  const [busquedaAdmin, setBusquedaAdmin] = useState('');

  // Modales / Formularios Admin
  const [nuevoEgresado, setNuevoEgresado] = useState({ dni: '', nombre_completo: '', curso: '5°1-Mañana' });
  const [nuevoDocente, setNuevoDocente] = useState({ dni: '', nombre_completo: '', area: '' });
  const [nuevoVip, setNuevoVip] = useState({ dni: '', nombre_completo: '', cargo: 'Autoridad / Invitado Especial' });

  // Gestión de Usuarios del Sistema
  const [nuevoUsuario, setNuevoUsuario] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'puerta',
  });
  const [mostrarPassNuevo, setMostrarPassNuevo] = useState(false);
  const [creandoUsuario, setCreandoUsuario] = useState(false);

  // Reubicación de vacantes en Cierre Parcial
  const [egresadoReubicarId, setEgresadoReubicarId] = useState('');
  const [cantidadReubicar, setCantidadReubicar] = useState(1);

  // Control de Acceso en Puerta
  const [busquedaPuerta, setBusquedaPuerta] = useState('');
  const [egresadoPuertaSeleccionado, setEgresadoPuertaSeleccionado] = useState(null);
  const [codigoManualQR, setCodigoManualQR] = useState('');
  const [resultadoEscaneo, setResultadoEscaneo] = useState(null);
  const [escanerCamaraActivo, setEscanerCamaraActivo] = useState(false);
  const videoRef = useRef(null);

  const avisar = (tipo, texto) => {
    setNotificacion({ tipo, texto });
    setTimeout(() => {
      setNotificacion((prev) => (prev && prev.texto === texto ? null : prev));
    }, 5500);
  };

  // Carga inicial y suscripción en tiempo real
  const cargarTodo = async () => {
    try {
      const [
        resCfg,
        resEgr,
        resFam,
        resDoc,
        resVip,
        resSol,
        resUsr,
      ] = await Promise.all([
        supabase.from('configuracion').select('*').limit(1),
        supabase.from('egresados').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('familiares').select('*').order('numero_entrada', { ascending: true }),
        supabase.from('docentes').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('invitados_especiales').select('*').order('nombre_completo', { ascending: true }),
        supabase.from('solicitudes_butacas').select('*').order('created_at', { ascending: false }),
        supabase.from('usuarios_sistema').select('*').order('created_at', { ascending: true }),
      ]);

      if (resCfg.data && resCfg.data.length > 0) {
        if (resCfg.data[0].estado_etapa) setEstadoEtapa(resCfg.data[0].estado_etapa);
        if (resCfg.data[0].cupo_base) setCupoBase(Number(resCfg.data[0].cupo_base));
      }
      if (resEgr.data) setEgresados(resEgr.data);
      if (resFam.data) setFamiliares(resFam.data);
      if (resDoc.data) setDocentes(resDoc.data);
      if (resVip.data) setInvitadosEspeciales(resVip.data);
      if (resSol.data) setSolicitudesExtra(resSol.data);
      if (resUsr.data) setUsuariosSistema(resUsr.data);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setCargandoGlobal(false);
    }
  };

  useEffect(() => {
    cargarTodo();

    // Verificar sesión activa de staff
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUsuarioAuth(session.user);
        await resolverPerfilStaff(session.user);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUsuarioAuth(session.user);
        await resolverPerfilStaff(session.user);
      } else {
        setUsuarioAuth(null);
        setPerfilUsuario(null);
      }
    });

    // Realtime channels
    const canal = supabase
      .channel('colacion-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'egresados' }, cargarTodo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'familiares' }, cargarTodo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docentes' }, cargarTodo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitados_especiales' }, cargarTodo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_butacas' }, cargarTodo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios_sistema' }, cargarTodo)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracion' }, cargarTodo)
      .subscribe();

    return () => {
      listener?.subscription?.unsubscribe();
      supabase.removeChannel(canal);
    };
  }, []);

  const resolverPerfilStaff = async (user) => {
    const email = (user.email || '').toLowerCase();
    const { data } = await supabase
      .from('usuarios_sistema')
      .select('*')
      .ilike('email', email)
      .limit(1);

    if (data && data.length > 0) {
      setPerfilUsuario(data[0]);
      if (data[0].rol === 'puerta') setVista('puerta');
      else setVista('admin');
    } else {
      // Fallback para administradores principales
      const esAdminPrincipal = ['salaticesrn5@gmail.com', 'maurosandri@gmail.com'].includes(email);
      const perfil = {
        email,
        nombre: user.user_metadata?.nombre || email.split('@')[0],
        rol: esAdminPrincipal ? 'admin' : 'coordinador',
      };
      setPerfilUsuario(perfil);
      setVista('admin');
    }
  };

  // ==================== CÁLCULOS DINÁMICOS DE AFORO (525 BUTACAS) ====================
  const metricasAforo = useMemo(() => {
    const totalEgresados = egresados.length;
    const totalDocentes = docentes.length;
    const totalVip = invitadosEspeciales.length;

    // Cupos familiares comprometidos:
    // Si el egresado ya cerró ('cerrado_alumno' o estadoEtapa === 'cerrada'), cuenta solo los familiares efectivamente cargados.
    // Si sigue abierto, cuenta su cupo asignado (cupo_asignado ?? cupoBase) o los cargados si son más.
    let cuposFamiliaresComprometidos = 0;
    let cuposVacantesRecuperables = 0;

    egresados.forEach((eg) => {
      const famsEg = familiares.filter((f) => f.egresado_id === eg.id && f.nombre_completo?.trim());
      const cupoEg = Number(eg.cupo_asignado ?? cupoBase);
      if (eg.cerrado || estadoEtapa === 'cerrada') {
        cuposFamiliaresComprometidos += famsEg.length;
      } else {
        cuposFamiliaresComprometidos += Math.max(cupoEg, famsEg.length);
        if (cupoEg > famsEg.length) {
          cuposVacantesRecuperables += cupoEg - famsEg.length;
        }
      }
    });

    const ocupadosTotales = totalEgresados + totalDocentes + totalVip + cuposFamiliaresComprometidos;
    const libresRecinto = CAPACIDAD_TOTAL - ocupadosTotales;

    // Asistencia en vivo (Puerta)
    const egresadosPresentes = egresados.filter((e) => e.asistio).length;
    const familiaresPresentes = familiares.filter((f) => f.asistio).length;
    const docentesPresentes = docentes.filter((d) => d.asistio).length;
    const vipPresentes = invitadosEspeciales.filter((v) => v.asistio).length;
    const totalEnSala = egresadosPresentes + familiaresPresentes + docentesPresentes + vipPresentes;

    return {
      totalEgresados,
      totalDocentes,
      totalVip,
      cuposFamiliaresComprometidos,
      cuposVacantesRecuperables,
      ocupadosTotales,
      libresRecinto,
      egresadosPresentes,
      familiaresPresentes,
      docentesPresentes,
      vipPresentes,
      totalEnSala,
    };
  }, [egresados, familiares, docentes, invitadosEspeciales, cupoBase, estadoEtapa]);

  // ==================== AUTENTICACIÓN STAFF ====================
  const handleLoginStaff = async (e) => {
    e.preventDefault();
    setLoginCargando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPass,
      });
      if (error) throw error;
      avisar('ok', 'Sesión iniciada correctamente.');
      setLoginPass('');
    } catch (err) {
      avisar('error', err.message || 'Credenciales incorrectas.');
    } finally {
      setLoginCargando(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUsuarioAuth(null);
    setPerfilUsuario(null);
    setVista('egresado');
    avisar('ok', 'Sesión cerrada.');
  };

  // ==================== GESTIÓN DE USUARIOS DEL SISTEMA (FIX DEFINITIVO) ====================
  const handleCrearUsuarioSistema = async (e) => {
    e.preventDefault();
    if (perfilUsuario?.rol !== 'admin') {
      avisar('error', 'Solo un Administrador puede crear usuarios.');
      return;
    }

    const nombre = nuevoUsuario.nombre.trim();
    const email = nuevoUsuario.email.trim().toLowerCase();
    const password = nuevoUsuario.password.trim();
    const rol = nuevoUsuario.rol;

    if (!nombre || !email || password.length < 6) {
      avisar('error', 'Completá nombre, correo válido y una contraseña de al menos 6 caracteres.');
      return;
    }

    setCreandoUsuario(true);
    try {
      // 1. Verificar si ya existe en usuarios_sistema
      const { data: existente } = await supabase
        .from('usuarios_sistema')
        .select('id, email')
        .ilike('email', email)
        .limit(1);

      if (existente && existente.length > 0) {
        avisar('error', `El correo ${email} ya está registrado en Usuarios y Roles.`);
        setCreandoUsuario(false);
        return;
      }

      // 2. Registrar en Supabase Auth usando el cliente secundario (no cierra la sesión actual del Admin)
      if (!supabaseAdminHelper) {
        throw new Error('Faltan variables de entorno de Supabase.');
      }

      const { data: signUpData, error: signUpError } = await supabaseAdminHelper.auth.signUp({
        email,
        password,
        options: {
          data: { nombre, rol },
        },
      });

      // Si el usuario ya existía previamente en Auth pero no en la tabla usuarios_sistema, permitimos vincularlo
      const yaExistiaEnAuth =
        signUpError &&
        (signUpError.message.toLowerCase().includes('already registered') ||
          signUpError.message.toLowerCase().includes('already exists'));

      if (signUpError && !yaExistiaEnAuth) {
        throw signUpError;
      }

      // 3. Guardar perfil y rol en la tabla `usuarios_sistema`
      const { error: insertError } = await supabase.from('usuarios_sistema').insert([
        {
          auth_id: signUpData?.user?.id || null,
          nombre,
          email,
          rol,
          activo: true,
        },
      ]);

      if (insertError) throw insertError;

      setNuevoUsuario({ nombre: '', email: '', password: '', rol: 'puerta' });
      await cargarTodo();

      if (yaExistiaEnAuth) {
        avisar(
          'ok',
          `Perfil vinculado para ${email} con rol ${rol.toUpperCase()}. (Ya tenía cuenta previa en Auth).`
        );
      } else {
        avisar(
          'ok',
          `Usuario ${nombre} (${email}) creado correctamente con rol ${rol.toUpperCase()}.`
        );
      }
    } catch (err) {
      console.error('Error creando usuario:', err);
      avisar(
        'error',
        `No se pudo crear el usuario: ${err.message}. Revisá en Supabase Auth > Providers > Email que "Confirm email" esté desactivado para acceso inmediato.`
      );
    } finally {
      setCreandoUsuario(false);
    }
  };

  const handleCambiarRolUsuario = async (usr, nuevoRol) => {
    if (perfilUsuario?.rol !== 'admin') return;
    const { error } = await supabase
      .from('usuarios_sistema')
      .update({ rol: nuevoRol })
      .eq('id', usr.id);
    if (error) {
      avisar('error', 'Error al actualizar rol: ' + error.message);
    } else {
      avisar('ok', `Rol actualizado a ${nuevoRol.toUpperCase()} para ${usr.nombre}.`);
      cargarTodo();
    }
  };

  const handleEliminarUsuarioSistema = async (usr) => {
    if (perfilUsuario?.rol !== 'admin') return;
    if (usr.email?.toLowerCase() === usuarioAuth?.email?.toLowerCase()) {
      avisar('error', 'No podés eliminar tu propio usuario administrador en uso.');
      return;
    }
    if (!window.confirm(`¿Eliminar el acceso de ${usr.nombre} (${usr.email}) del sistema?`)) return;

    const { error } = await supabase.from('usuarios_sistema').delete().eq('id', usr.id);
    if (error) {
      avisar('error', 'Error al eliminar usuario: ' + error.message);
    } else {
      avisar('ok', 'Usuario eliminado del panel.');
      cargarTodo();
    }
  };

  // ==================== VACIAR PADRÓN (EGRESADOS Y DOCENTES) ====================
  const handleVaciarEgresados = async () => {
    if (egresados.length === 0) {
      avisar('error', 'El padrón de egresados ya está vacío.');
      return;
    }
    const paso1 = window.confirm(
      `⚠️ ATENCIÓN: Vas a eliminar los ${egresados.length} egresados cargados actualmente junto con todos sus familiares y solicitudes.\n\n¿Estás seguro de continuar?`
    );
    if (!paso1) return;

    const confirmacionTexto = window.prompt(
      'Para confirmar el borrado total del padrón de Egresados, escribí la palabra VACIAR en mayúsculas:'
    );
    if (confirmacionTexto !== 'VACIAR') {
      avisar('error', 'Operación cancelada. No se borró ningún dato.');
      return;
    }

    try {
      // Borrar en orden por integridad referencial (solicitudes -> familiares -> egresados)
      await supabase.from('solicitudes_butacas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('familiares').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const { error } = await supabase
        .from('egresados')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      await cargarTodo();
      avisar('ok', 'Padrón de Egresados vaciado por completo. Ya podés importar el listado limpio.');
    } catch (err) {
      avisar('error', 'Error al vaciar egresados: ' + err.message);
    }
  };

  const handleVaciarDocentes = async () => {
    if (docentes.length === 0) {
      avisar('error', 'El padrón de docentes ya está vacío.');
      return;
    }
    const paso1 = window.confirm(
      `⚠️ ATENCIÓN: Vas a eliminar los ${docentes.length} docentes cargados actualmente.\n\n¿Confirmás vaciar el listado de docentes?`
    );
    if (!paso1) return;

    const confirmacionTexto = window.prompt(
      'Para confirmar el borrado total de Docentes, escribí VACIAR en mayúsculas:'
    );
    if (confirmacionTexto !== 'VACIAR') {
      avisar('error', 'Operación cancelada.');
      return;
    }

    try {
      const { error } = await supabase
        .from('docentes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      await cargarTodo();
      avisar('ok', 'Padrón de Docentes vaciado por completo.');
    } catch (err) {
      avisar('error', 'Error al vaciar docentes: ' + err.message);
    }
  };

  // ==================== IMPORTACIÓN MASIVA CSV (EGRESADOS Y DOCENTES) ====================
  const handleImportarCSV = async (e, tipo) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const texto = await file.text();
      const filas = parsearCSV(texto);
      if (filas.length === 0) {
        avisar('error', 'El archivo CSV está vacío o no tiene formato válido.');
        return;
      }

      const dnisExistentes = new Set(
        (tipo === 'egresados' ? egresados : docentes).map((item) => sanitizarDNI(item.dni))
      );

      const registrosNuevos = [];
      let omitidosDuplicados = 0;
      let omitidosInvalidos = 0;

      filas.forEach((fila) => {
        const dni = sanitizarDNI(fila.dni || fila.documento || fila['nro doc'] || '');
        let nombreCompleto =
          fila['nombre completo'] ||
          fila.nombrecompleto ||
          fila.estudiante ||
          fila.docente ||
          '';

        if (!nombreCompleto && (fila.apellido || fila.nombre)) {
          nombreCompleto = `${fila.nombre || ''} ${fila.apellido || ''}`.trim();
        }
        nombreCompleto = nombreCompleto.replace(/\s+/g, ' ').trim().toUpperCase();

        if (!dni || dni.length < 7 || !nombreCompleto) {
          omitidosInvalidos++;
          return;
        }
        if (dnisExistentes.has(dni)) {
          omitidosDuplicados++;
          return;
        }
        dnisExistentes.add(dni);

        if (tipo === 'egresados') {
          const curso = (fila.curso || fila.division || fila.seccion || '5° Año').trim();
          registrosNuevos.push({
            dni,
            nombre_completo: nombreCompleto,
            curso,
            cupo_asignado: cupoBase,
            cerrado: false,
            habilitado_reubicacion: false,
            asistio: false,
          });
        } else {
          const area = (
            fila.area ||
            fila['curso / area'] ||
            fila.materia ||
            fila.cargo ||
            'Docente'
          )
            .trim()
            .toUpperCase();
          registrosNuevos.push({
            dni,
            nombre_completo: nombreCompleto,
            area,
            asistio: false,
          });
        }
      });

      if (registrosNuevos.length === 0) {
        avisar(
          'error',
          `No se importaron registros nuevos (${omitidosDuplicados} ya existían, ${omitidosInvalidos} inválidos).`
        );
        return;
      }

      const tabla = tipo === 'egresados' ? 'egresados' : 'docentes';
      const { error } = await supabase.from(tabla).insert(registrosNuevos);
      if (error) throw error;

      await cargarTodo();
      avisar(
        'ok',
        `Se importaron ${registrosNuevos.length} ${tipo} nuevos correctamente.` +
          (omitidosDuplicados > 0 ? ` (${omitidosDuplicados} duplicados omitidos).` : '')
      );
    } catch (err) {
      avisar('error', `Error al importar CSV de ${tipo}: ` + err.message);
    }
  };

  // ==================== ABM INDIVIDUAL (EGRESADOS, DOCENTES, VIP) ====================
  const handleAgregarEgresado = async (e) => {
    e.preventDefault();
    const dni = sanitizarDNI(nuevoEgresado.dni);
    const nombre_completo = nuevoEgresado.nombre_completo.trim().toUpperCase();
    if (!dni || !nombre_completo) {
      avisar('error', 'Ingresá DNI (hasta 8 dígitos) y Nombre Completo.');
      return;
    }
    if (egresados.some((eg) => sanitizarDNI(eg.dni) === dni)) {
      avisar('error', 'Ya existe un egresado con ese DNI.');
      return;
    }
    const { error } = await supabase.from('egresados').insert([
      {
        dni,
        nombre_completo,
        curso: nuevoEgresado.curso.trim() || '5° Año',
        cupo_asignado: cupoBase,
        cerrado: false,
        habilitado_reubicacion: false,
        asistio: false,
      },
    ]);
    if (error) avisar('error', error.message);
    else {
      setNuevoEgresado({ dni: '', nombre_completo: '', curso: nuevoEgresado.curso });
      avisar('ok', 'Egresado agregado.');
      cargarTodo();
    }
  };

  const handleAgregarDocente = async (e) => {
    e.preventDefault();
    const dni = sanitizarDNI(nuevoDocente.dni);
    const nombre_completo = nuevoDocente.nombre_completo.trim().toUpperCase();
    if (!dni || !nombre_completo) {
      avisar('error', 'Ingresá DNI (hasta 8 dígitos) y Nombre Completo.');
      return;
    }
    if (docentes.some((d) => sanitizarDNI(d.dni) === dni)) {
      avisar('error', 'Ya existe un docente con ese DNI.');
      return;
    }
    const { error } = await supabase.from('docentes').insert([
      {
        dni,
        nombre_completo,
        area: nuevoDocente.area.trim().toUpperCase() || 'DOCENTE',
        asistio: false,
      },
    ]);
    if (error) avisar('error', error.message);
    else {
      setNuevoDocente({ dni: '', nombre_completo: '', area: '' });
      avisar('ok', 'Docente agregado.');
      cargarTodo();
    }
  };

  const handleAgregarVip = async (e) => {
    e.preventDefault();
    const dni = sanitizarDNI(nuevoVip.dni);
    const nombre_completo = nuevoVip.nombre_completo.trim().toUpperCase();
    if (!nombre_completo) {
      avisar('error', 'Ingresá el nombre del Invitado Especial / Autoridad.');
      return;
    }
    const { error } = await supabase.from('invitados_especiales').insert([
      {
        dni: dni || '00000000',
        nombre_completo,
        cargo: nuevoVip.cargo.trim() || 'Autoridad',
        asistio: false,
      },
    ]);
    if (error) avisar('error', error.message);
    else {
      setNuevoVip({ dni: '', nombre_completo: '', cargo: 'Autoridad / Invitado Especial' });
      avisar('ok', 'Invitado Especial agregado.');
      cargarTodo();
    }
  };

  // ==================== CONTROL DE ETAPAS Y REUBICACIÓN DE VACANTES ====================
  const handleCambiarEtapa = async (nuevaEtapa) => {
    const { data: cfg } = await supabase.from('configuracion').select('id').limit(1);
    if (cfg && cfg.length > 0) {
      await supabase.from('configuracion').update({ estado_etapa: nuevaEtapa }).eq('id', cfg[0].id);
    } else {
      await supabase.from('configuracion').insert([{ estado_etapa: nuevaEtapa, cupo_base: cupoBase }]);
    }
    setEstadoEtapa(nuevaEtapa);
    avisar('ok', `Estado de carga actualizado a: ${nuevaEtapa.toUpperCase()}.`);
    cargarTodo();
  };

  const handleActualizarCupoBase = async (nuevoCupo) => {
    const val = Math.max(1, Math.min(8, Number(nuevoCupo) || 3));
    setCupoBase(val);
    const { data: cfg } = await supabase.from('configuracion').select('id').limit(1);
    if (cfg && cfg.length > 0) {
      await supabase.from('configuracion').update({ cupo_base: val }).eq('id', cfg[0].id);
    } else {
      await supabase.from('configuracion').insert([{ estado_etapa: estadoEtapa, cupo_base: val }]);
    }
    // Actualizar cupo base a egresados que aún no tienen invitados extra asignados
    await supabase.from('egresados').update({ cupo_asignado: val }).eq('cerrado', false);
    avisar('ok', `Cupo base configurado en ${val} familiares por egresado.`);
    cargarTodo();
  };

  const handleRecuperarTodasVacantes = async () => {
    if (
      !window.confirm(
        '¿Recuperar todos los cupos vacíos no utilizados por los egresados para pasarlos a la bolsa de Butacas Vacantes Disponibles?'
      )
    )
      return;

    for (const eg of egresados) {
      const famsCargados = familiares.filter(
        (f) => f.egresado_id === eg.id && f.nombre_completo?.trim()
      ).length;
      const cupoActual = Number(eg.cupo_asignado ?? cupoBase);
      if (cupoActual > famsCargados) {
        await supabase
          .from('egresados')
          .update({ cupo_asignado: famsCargados, cerrado: true })
          .eq('id', eg.id);
      }
    }
    await cargarTodo();
    avisar('ok', 'Vacantes no utilizadas recuperadas y liberadas al aforo disponible.');
  };

  const handleReubicarButacas = async (egresadoId, cantidadAgregar, solicitudId = null) => {
    const eg = egresados.find((x) => x.id === egresadoId);
    if (!eg) return;
    const cant = Number(cantidadAgregar);
    if (cant <= 0) return;

    if (metricasAforo.libresRecinto < cant) {
      avisar(
        'error',
        `No hay suficientes lugares libres en el recinto (disponibles: ${metricasAforo.libresRecinto}).`
      );
      return;
    }

    const nuevoCupo = Number(eg.cupo_asignado ?? cupoBase) + cant;
    const mensajeNotif = `¡Buenas noticias! Se te asignaron +${cant} butaca(s) extra. Ahora tenés ${nuevoCupo} invitaciones en total. Ya podés cargar a tus nuevos invitados y descargar sus QR.`;

    await supabase
      .from('egresados')
      .update({
        cupo_asignado: nuevoCupo,
        cerrado: false,
        habilitado_reubicacion: true,
        notificacion_portal: mensajeNotif,
      })
      .eq('id', eg.id);

    if (solicitudId) {
      await supabase
        .from('solicitudes_butacas')
        .update({ estado: 'aprobada', cantidad_aprobada: cant })
        .eq('id', solicitudId);
    }

    await cargarTodo();
    avisar('ok', `Se reubicaron +${cant} lugares a ${eg.nombre_completo} y se habilitó su portal.`);
  };

  // ==================== PORTAL EGRESADOS (AUTOGESTIÓN) ====================
  const alumnoActual = useMemo(
    () => egresados.find((e) => e.id === alumnoActivoId) || null,
    [egresados, alumnoActivoId]
  );

  const handleIngresarAlumno = (e) => {
    e.preventDefault();
    const dni = sanitizarDNI(dniAlumnoInput);
    if (!dni) {
      avisar('error', 'Ingresá tu DNI (solo números, sin puntos).');
      return;
    }
    const encontrado = egresados.find((eg) => sanitizarDNI(eg.dni) === dni);
    if (!encontrado) {
      avisar('error', 'No encontramos ese DNI en el padrón de 5° año. Consultá con Preceptoría.');
      return;
    }

    setAlumnoActivoId(encontrado.id);
    prepararSlotsAlumno(encontrado);
  };

  const prepararSlotsAlumno = (eg) => {
    const famsExistentes = familiares.filter((f) => f.egresado_id === eg.id);
    const totalSlots = Math.max(Number(eg.cupo_asignado ?? cupoBase), famsExistentes.length);
    const slots = [];
    for (let i = 0; i < totalSlots; i++) {
      if (famsExistentes[i]) {
        slots.push({ ...famsExistentes[i] });
      } else {
        slots.push({
          id: null,
          egresado_id: eg.id,
          nombre_completo: '',
          dni: '',
          numero_entrada: `ENT-${eg.dni.slice(-4)}-${i + 1}`,
          asistio: false,
        });
      }
    }
    setFormFamiliares(slots);
  };

  useEffect(() => {
    if (alumnoActual) {
      prepararSlotsAlumno(alumnoActual);
    }
  }, [familiares, alumnoActual?.cupo_asignado, alumnoActual?.cerrado]);

  const puedeEditarAlumno = useMemo(() => {
    if (!alumnoActual) return false;
    if (alumnoActual.cerrado) return false;
    if (estadoEtapa === 'abierta') return true;
    if (estadoEtapa === 'parcial' && alumnoActual.habilitado_reubicacion) return true;
    return false;
  }, [alumnoActual, estadoEtapa]);

  const handleGuardarFamiliaresAlumno = async (cerrarDefinitivo = false) => {
    if (!alumnoActual || !puedeEditarAlumno) return;

    if (cerrarDefinitivo) {
      const ok = window.confirm(
        '¿Confirmás que ya no vas a hacer más cambios? Una vez cerrado, tus invitaciones quedarán definitivas y tus cupos sin usar pasarán a disponibilidad.'
      );
      if (!ok) return;
    }

    setGuardandoAlumno(true);
    try {
      for (let i = 0; i < formFamiliares.length; i++) {
        const slot = formFamiliares[i];
        const nombre = (slot.nombre_completo || '').trim().toUpperCase();
        const dni = sanitizarDNI(slot.dni);

        if (nombre && dni.length < 7) {
          avisar('error', `Revisá el DNI del Invitado #${i + 1}: debe tener 7 u 8 números sin puntos.`);
          setGuardandoAlumno(false);
          return;
        }

        if (slot.id) {
          if (!nombre && !dni) {
            await supabase.from('familiares').delete().eq('id', slot.id);
          } else {
            await supabase
              .from('familiares')
              .update({ nombre_completo: nombre, dni })
              .eq('id', slot.id);
          }
        } else if (nombre && dni) {
          const numEntrada = `ENT-${alumnoActual.dni.slice(-4)}-${i + 1}-${Math.floor(
            100 + Math.random() * 900
          )}`;
          await supabase.from('familiares').insert([
            {
              egresado_id: alumnoActual.id,
              nombre_completo: nombre,
              dni,
              numero_entrada: numEntrada,
              asistio: false,
            },
          ]);
        }
      }

      if (cerrarDefinitivo) {
        const cargadosCount = formFamiliares.filter((s) => s.nombre_completo?.trim() && s.dni).length;
        await supabase
          .from('egresados')
          .update({
            cerrado: true,
            habilitado_reubicacion: false,
            cupo_asignado: cargadosCount,
          })
          .eq('id', alumnoActual.id);
      }

      await cargarTodo();
      avisar(
        'ok',
        cerrarDefinitivo
          ? '¡Carga cerrada definitivamente! Ya podés descargar tus invitaciones con QR.'
          : 'Datos guardados correctamente. Ya podés descargar los QR de tus invitados.'
      );
    } catch (err) {
      avisar('error', 'Error al guardar: ' + err.message);
    } finally {
      setGuardandoAlumno(false);
    }
  };

  const handleEnviarSolicitudExtra = async (e) => {
    e.preventDefault();
    if (!alumnoActual) return;
    try {
      const { error } = await supabase.from('solicitudes_butacas').insert([
        {
          egresado_id: alumnoActual.id,
          egresado_nombre: alumnoActual.nombre_completo,
          egresado_dni: alumnoActual.dni,
          egresado_curso: alumnoActual.curso,
          cantidad_solicitada: Number(cantExtraSolicitada),
          observacion: motivoExtra.trim(),
          estado: 'pendiente',
        },
      ]);
      if (error) throw error;
      setModalExtraAbierto(false);
      setMotivoExtra('');
      await cargarTodo();
      avisar('ok', 'Solicitud de butacas extra enviada. Te avisaremos cuando sea aprobada.');
    } catch (err) {
      avisar('error', 'No se pudo enviar la solicitud: ' + err.message);
    }
  };

  const descargarInvitacionPNG = (invitado, egresado) => {
    const canvas = document.createElement('canvas');
    canvas.width = 700;
    canvas.height = 920;
    const ctx = canvas.getContext('2d');

    // Fondo tarjeta
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 700, 920);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(28, 28, 644, 864, 24);
    ctx.fill();

    // Encabezado
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(28, 28, 644, 150);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ACTO DE COLACIÓN 2026', 350, 88);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#bfdbfe';
    ctx.fillText('ESRN N° 005 — CIPOLLETTI', 350, 125);

    // Datos invitado
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('PASE DE INGRESO NOMINAL', 350, 225);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(invitado.nombre_completo.slice(0, 32), 350, 270);

    ctx.fillStyle = '#334155';
    ctx.font = '22px monospace';
    ctx.fillText(`DNI: ${invitado.dni}`, 350, 310);

    ctx.fillStyle = '#1d4ed8';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`ENTRADA N°: ${invitado.numero_entrada}`, 350, 355);

    // Egresado titular
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(60, 385, 580, 90);
    ctx.fillStyle = '#475569';
    ctx.font = '14px sans-serif';
    ctx.fillText('INVITADO/A POR EL EGRESADO/A:', 350, 415);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${egresado.nombre_completo} (${egresado.curso})`, 350, 448);

    // Cargar imagen QR y descargar
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 210, 505, 280, 280);
      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.fillText('Presentar este código QR en puerta junto con el DNI.', 350, 825);
      ctx.fillText('Válido para un único ingreso.', 350, 850);

      const link = document.createElement('a');
      link.download = `Entrada_${invitado.numero_entrada}_${invitado.nombre_completo.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
      invitado.numero_entrada
    )}&margin=8`;
  };

  // ==================== CONTROL DE ACCESO EN PUERTA ====================
  const validarCodigoEntrada = async (codigoRaw) => {
    const codigo = (codigoRaw || '').trim().toUpperCase();
    if (!codigo) return;

    const fam = familiares.find((f) => f.numero_entrada?.toUpperCase() === codigo);
    if (!fam) {
      setResultadoEscaneo({
        tipo: 'invalido',
        titulo: 'CÓDIGO NO VÁLIDO',
        detalle: `El código "${codigo}" no pertenece a ninguna invitación registrada.`,
      });
      return;
    }

    const eg = egresados.find((e) => e.id === fam.egresado_id);

    if (fam.asistio) {
      setResultadoEscaneo({
        tipo: 'duplicado',
        titulo: '⚠️ ENTRADA YA UTILIZADA',
        detalle: `${fam.nombre_completo} (DNI ${fam.dni}) ya registró ingreso a las ${
          fam.hora_ingreso || 'hora previa'
        }.`,
        egresado: eg?.nombre_completo || '',
      });
      return;
    }

    const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const { error } = await supabase
      .from('familiares')
      .update({ asistio: true, hora_ingreso: hora })
      .eq('id', fam.id);

    if (error) {
      avisar('error', 'No se pudo registrar asistencia: ' + error.message);
      return;
    }

    await cargarTodo();
    setResultadoEscaneo({
      tipo: 'ok',
      titulo: '✅ INGRESO HABILITADO',
      detalle: `${fam.nombre_completo} — DNI ${fam.dni} (${fam.numero_entrada})`,
      egresado: eg ? `Egresado/a: ${eg.nombre_completo} (${eg.curso})` : '',
    });
  };

  // Escáner con BarcodeDetector nativo del navegador móvil
  useEffect(() => {
    let stream = null;
    let intervalo = null;

    const iniciarCamara = async () => {
      if (!escanerCamaraActivo) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if ('BarcodeDetector' in window) {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          intervalo = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState !== 4) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0 && codes[0].rawValue) {
                setEscanerCamaraActivo(false);
                validarCodigoEntrada(codes[0].rawValue);
              }
            } catch (_) {}
          }, 500);
        }
      } catch (err) {
        avisar('error', 'No se pudo acceder a la cámara. Usá el código o buscador manual debajo.');
        setEscanerCamaraActivo(false);
      }
    };

    iniciarCamara();
    return () => {
      if (intervalo) clearInterval(intervalo);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [escanerCamaraActivo]);

  const resultadosBusquedaPuerta = useMemo(() => {
    const q = busquedaPuerta.trim().toLowerCase();
    if (!q) return [];

    const coincidenciasEgresados = new Map();

    egresados.forEach((eg) => {
      if (
        eg.nombre_completo.toLowerCase().includes(q) ||
        sanitizarDNI(eg.dni).includes(q)
      ) {
        coincidenciasEgresados.set(eg.id, {
          egresado: eg,
          motivo: 'Egresado/a titular',
        });
      }
    });

    familiares.forEach((f) => {
      if (
        f.nombre_completo?.toLowerCase().includes(q) ||
        sanitizarDNI(f.dni).includes(q) ||
        f.numero_entrada?.toLowerCase().includes(q)
      ) {
        const eg = egresados.find((e) => e.id === f.egresado_id);
        if (eg && !coincidenciasEgresados.has(eg.id)) {
          coincidenciasEgresados.set(eg.id, {
            egresado: eg,
            motivo: `Invitado: ${f.nombre_completo} (${f.numero_entrada})`,
          });
        }
      }
    });

    return Array.from(coincidenciasEgresados.values()).slice(0, 15);
  }, [busquedaPuerta, egresados, familiares]);

  const toggleAsistenciaPuerta = async (tabla, item) => {
    const nuevoEstado = !item.asistio;
    const hora = nuevoEstado
      ? new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      : null;

    const payload =
      tabla === 'familiares'
        ? { asistio: nuevoEstado, hora_ingreso: hora }
        : { asistio: nuevoEstado };

    const { error } = await supabase.from(tabla).update(payload).eq('id', item.id);
    if (error) {
      avisar('error', 'Error al marcar asistencia: ' + error.message);
    } else {
      cargarTodo();
    }
  };

  // ==================== RENDER ====================
  if (cargandoGlobal) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          <p className="font-medium">Cargando Sistema Colación 2026 — ESRN N° 005...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      {/* BARRA SUPERIOR */}
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div
            onClick={() => !usuarioAuth && setVista('egresado')}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="bg-blue-600 p-2 rounded-xl">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Colación 2026 — ESRN N° 005</h1>
              <p className="text-xs text-slate-400">Control de Aforo e Invitaciones · Cipolletti</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!usuarioAuth ? (
              <>
                <button
                  onClick={() => setVista('egresado')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    vista === 'egresado'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Portal Egresados
                </button>
                <button
                  onClick={() => setVista('login')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition ${
                    vista === 'login'
                      ? 'bg-amber-500 text-slate-900'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  Acceso Personal / Puerta
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {perfilUsuario?.rol !== 'puerta' && (
                  <button
                    onClick={() => setVista('admin')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      vista === 'admin'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Panel Gestión
                  </button>
                )}
                <button
                  onClick={() => setVista('puerta')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition ${
                    vista === 'puerta'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  Puerta
                </button>
                <span className="hidden sm:inline-block text-xs bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-full text-slate-300">
                  {perfilUsuario?.nombre} ({perfilUsuario?.rol?.toUpperCase()})
                </span>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg bg-red-600/20 text-red-300 hover:bg-red-600 hover:text-white transition"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ALERTA FLOTANTE */}
      {notificacion && (
        <div className="max-w-4xl mx-auto px-4 mt-4">
          <div
            className={`p-4 rounded-xl border flex items-start justify-between gap-3 shadow-sm ${
              notificacion.tipo === 'ok'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {notificacion.tipo === 'ok' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <p className="text-sm font-medium">{notificacion.texto}</p>
            </div>
            <button onClick={() => setNotificacion(null)} className="text-slate-500 hover:text-slate-800">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ==================== VISTA 1: PORTAL DE AUTOGESTIÓN DE EGRESADOS ==================== */}
      {vista === 'egresado' && (
        <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {!alumnoActual ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
              <div className="text-center max-w-md mx-auto space-y-2 mb-6">
                <span className="inline-block bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
                  AUTOGESTIÓN DE INVITACIONES
                </span>
                <h2 className="text-2xl font-bold text-slate-900">Ingresá con tu DNI</h2>
                <p className="text-sm text-slate-600">
                  Cargá a tus familiares invitados, descargá sus entradas con código QR y gestioná tus lugares.
                </p>
              </div>

              <form onSubmit={handleIngresarAlumno} className="max-w-sm mx-auto space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    DNI del Egresado/a (sin puntos ni espacios)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="Ej: 49138706"
                    value={dniAlumnoInput}
                    onChange={(e) => setDniAlumnoInput(sanitizarDNI(e.target.value))}
                    className="w-full text-center font-mono text-2xl tracking-widest px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-sm transition flex items-center justify-center gap-2"
                >
                  Ingresar a mis Invitaciones
                  <ArrowRight className="w-5 h-5" />
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Notificación destacada si le aprobaron butacas extra */}
              {alumnoActual.notificacion_portal && (
                <div className="bg-emerald-600 text-white rounded-2xl p-5 shadow-md flex items-start gap-3">
                  <Sparkles className="w-6 h-6 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-base">Actualización sobre tus butacas</p>
                    <p className="text-sm text-emerald-50 mt-1">{alumnoActual.notificacion_portal}</p>
                  </div>
                </div>
              )}

              {/* Tarjeta Identidad Egresado */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                    Egresado/a Verificado/a · {alumnoActual.curso}
                  </p>
                  <h2 className="text-xl font-bold text-slate-900">{alumnoActual.nombre_completo}</h2>
                  <p className="text-sm text-slate-500 font-mono">DNI: {alumnoActual.dni}</p>
                </div>
                <button
                  onClick={() => {
                    setAlumnoActivoId(null);
                    setDniAlumnoInput('');
                  }}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 px-3 py-2 rounded-lg"
                >
                  Cambiar DNI
                </button>
              </div>

              {/* Estado de ventana */}
              {!puedeEditarAlumno && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-900 text-sm flex items-start gap-2.5">
                  <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Formulario en modo solo lectura</p>
                    <p>
                      {alumnoActual.cerrado
                        ? 'Ya confirmaste el cierre definitivo de tus invitaciones. Podés descargar tus pases QR debajo.'
                        : 'La ventana de carga se encuentra cerrada temporalmente por la organización.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Aviso obligatorio de revisión de datos */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-900 text-sm flex items-start gap-2.5">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Importante:</strong> Revisá cuidadosamente el <strong>Nombre Completo</strong> y el{' '}
                  <strong>DNI (hasta 8 números sin puntos)</strong> de cada invitado antes de guardar o cerrar, para
                  evitar demoras en el ingreso al salón el día del acto.
                </p>
              </div>

              {/* Lista de Slots de Familiares */}
              <div className="space-y-4">
                {formFamiliares.map((slot, idx) => {
                  const yaGuardado = Boolean(slot.id && slot.nombre_completo && slot.dni);
                  return (
                    <div
                      key={idx}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-900 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                            Invitado #{idx + 1}
                          </span>
                          <span className="font-mono text-xs text-slate-500">{slot.numero_entrada}</span>
                        </div>
                        {yaGuardado && (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                            ✓ Guardado con QR listo
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Nombre y Apellido del Invitado
                          </label>
                          <input
                            type="text"
                            disabled={!puedeEditarAlumno}
                            placeholder="Ej: MARÍA LAURA GÓMEZ"
                            value={slot.nombre_completo}
                            onChange={(e) => {
                              const copia = [...formFamiliares];
                              copia[idx].nombre_completo = e.target.value;
                              setFormFamiliares(copia);
                            }}
                            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm uppercase disabled:bg-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            DNI del Invitado (sin puntos)
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={8}
                            disabled={!puedeEditarAlumno}
                            placeholder="Ej: 28456123"
                            value={slot.dni}
                            onChange={(e) => {
                              const copia = [...formFamiliares];
                              copia[idx].dni = sanitizarDNI(e.target.value);
                              setFormFamiliares(copia);
                            }}
                            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono disabled:bg-slate-100"
                          />
                        </div>
                      </div>

                      {/* Vista previa QR y Descarga inmediata */}
                      {yaGuardado && (
                        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl">
                          <QRVisual value={slot.numero_entrada} size={120} />
                          <div className="text-center sm:text-left space-y-2">
                            <p className="text-sm font-bold text-slate-800">{slot.nombre_completo}</p>
                            <p className="text-xs text-slate-500">
                              Descargá la tarjeta con QR y envíasela por WhatsApp a tu invitado.
                            </p>
                            <button
                              type="button"
                              onClick={() => descargarInvitacionPNG(slot, alumnoActual)}
                              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm transition"
                            >
                              <Download className="w-4 h-4" />
                              Descargar Invitación QR
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Botones de Acción del Egresado */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
                {puedeEditarAlumno && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={guardandoAlumno}
                      onClick={() => handleGuardarFamiliaresAlumno(false)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
                    >
                      <Check className="w-5 h-5" />
                      Guardar Cambios Parciales
                    </button>

                    <button
                      type="button"
                      disabled={guardandoAlumno}
                      onClick={() => handleGuardarFamiliaresAlumno(true)}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      Ya no hago más cambios (Cerrar)
                    </button>
                  </div>
                )}

                {estadoEtapa !== 'cerrada' && (
                  <button
                    type="button"
                    onClick={() => setModalExtraAbierto(true)}
                    className="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Solicitar más butacas extra
                  </button>
                )}
              </div>

              {/* Modal Solicitud Butacas Extra */}
              {modalExtraAbierto && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
                    <h3 className="text-lg font-bold text-slate-900">Solicitar Butacas Extra</h3>
                    <p className="text-sm text-slate-600">
                      Las solicitudes se evalúan según los lugares vacantes del salón.
                    </p>
                    <form onSubmit={handleEnviarSolicitudExtra} className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold mb-1">Cantidad de lugares extra</label>
                        <select
                          value={cantExtraSolicitada}
                          onChange={(e) => setCantExtraSolicitada(Number(e.target.value))}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2.5"
                        >
                          <option value={1}>+1 butaca extra</option>
                          <option value={2}>+2 butacas extra</option>
                          <option value={3}>+3 butacas extra</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1">Observación (opcional)</label>
                        <textarea
                          rows={2}
                          placeholder="Ej: Vienen mis abuelos..."
                          value={motivoExtra}
                          onChange={(e) => setMotivoExtra(e.target.value)}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setModalExtraAbierto(false)}
                          className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-medium"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold"
                        >
                          Enviar Solicitud
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* ==================== VISTA 2: LOGIN PERSONAL / PUERTA ==================== */}
      {vista === 'login' && (
        <main className="max-w-md mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Acceso Personal Autorizado</h2>
              <p className="text-sm text-slate-500">Administradores, Coordinadores y Control de Puerta</p>
            </div>

            <form onSubmit={handleLoginStaff} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Correo electrónico</label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="usuario@escuela.edu.ar"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Contraseña</label>
                <input
                  type="password"
                  required
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl"
                />
              </div>
              <button
                type="submit"
                disabled={loginCargando}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition"
              >
                {loginCargando ? 'Ingresando...' : 'Iniciar Sesión'}
              </button>
            </form>
          </div>
        </main>
      )}

      {/* ==================== VISTA 3: PANEL DE ADMINISTRACIÓN Y COORDINACIÓN ==================== */}
      {vista === 'admin' && usuarioAuth && (
        <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          {/* MONITOR DE AFORO EN TIEMPO REAL (525 BUTACAS) */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Monitor de Aforo en Tiempo Real (525 Butacas)</h2>
                <p className="text-xs text-slate-500">
                  Cupo base actual: <strong>{cupoBase} familiares</strong> por egresado · Etapa:{' '}
                  <strong className="uppercase text-blue-700">{estadoEtapa}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    metricasAforo.libresRecinto >= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {metricasAforo.libresRecinto >= 0
                    ? `${metricasAforo.libresRecinto} butacas libres`
                    : `EXCEDIDO POR ${Math.abs(metricasAforo.libresRecinto)} BUTACAS`}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500">Capacidad Total</p>
                <p className="text-2xl font-extrabold text-slate-900">{CAPACIDAD_TOTAL}</p>
              </div>
              <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200">
                <p className="text-xs text-blue-700">Egresados</p>
                <p className="text-2xl font-extrabold text-blue-900">{metricasAforo.totalEgresados}</p>
              </div>
              <div className="bg-indigo-50 p-3.5 rounded-xl border border-indigo-200">
                <p className="text-xs text-indigo-700">Docentes</p>
                <p className="text-2xl font-extrabold text-indigo-900">{metricasAforo.totalDocentes}</p>
              </div>
              <div className="bg-purple-50 p-3.5 rounded-xl border border-purple-200">
                <p className="text-xs text-purple-700">Invitados VIP</p>
                <p className="text-2xl font-extrabold text-purple-900">{metricasAforo.totalVip}</p>
              </div>
              <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200">
                <p className="text-xs text-amber-700">Cupos Familiares</p>
                <p className="text-2xl font-extrabold text-amber-900">
                  {metricasAforo.cuposFamiliaresComprometidos}
                </p>
              </div>
              <div
                className={`p-3.5 rounded-xl border ${
                  metricasAforo.libresRecinto >= 0
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-300'
                }`}
              >
                <p className="text-xs font-semibold text-slate-700">Vacantes / Libres</p>
                <p
                  className={`text-2xl font-extrabold ${
                    metricasAforo.libresRecinto >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {metricasAforo.libresRecinto}
                </p>
              </div>
            </div>
          </section>

          {/* NAVEGACIÓN DE PESTAÑAS DEL PANEL */}
          <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
            {[
              { id: 'egresados', label: `Egresados (${egresados.length})`, icon: GraduationCap },
              { id: 'docentes', label: `Docentes (${docentes.length})`, icon: Users },
              { id: 'vip', label: `Invitados Especiales (${invitadosEspeciales.length})`, icon: Award },
              {
                id: 'solicitudes',
                label: `Etapas y Solicitudes (${solicitudesExtra.filter((s) => s.estado === 'pendiente').length})`,
                icon: Settings,
              },
              { id: 'reportes', label: 'Acreditación en Vivo', icon: ClipboardList },
              ...(perfilUsuario?.rol === 'admin'
                ? [{ id: 'usuarios', label: `Usuarios del Sistema (${usuariosSistema.length})`, icon: Shield }]
                : []),
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTabAdmin(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                    tabAdmin === t.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* TAB: EGRESADOS (CON IMPORTAR CSV + VACIAR PADRÓN) */}
          {tabAdmin === 'egresados' && (
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Padrón de Egresados (5° Año)</h3>
                  <p className="text-xs text-slate-500">
                    Importá masivamente desde CSV, agregá manualmente o vaciá el listado de prueba.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition">
                    <Upload className="w-4 h-4" />
                    Importar CSV Egresados
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => handleImportarCSV(e, 'egresados')}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleVaciarEgresados}
                    className="bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    Vaciar Padrón
                  </button>
                </div>
              </div>

              {/* Alta manual individual */}
              <form onSubmit={handleAgregarEgresado} className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="DNI (8 dígitos)"
                  value={nuevoEgresado.dni}
                  onChange={(e) => setNuevoEgresado({ ...nuevoEgresado, dni: sanitizarDNI(e.target.value) })}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono bg-white"
                />
                <input
                  type="text"
                  placeholder="Apellido y Nombre"
                  value={nuevoEgresado.nombre_completo}
                  onChange={(e) => setNuevoEgresado({ ...nuevoEgresado, nombre_completo: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm uppercase bg-white"
                />
                <input
                  type="text"
                  placeholder="Curso (ej: 5°1-Mañana)"
                  value={nuevoEgresado.curso}
                  onChange={(e) => setNuevoEgresado({ ...nuevoEgresado, curso: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
                />
                <button
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold py-2 px-4 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Egresado
                </button>
              </form>

              {/* Buscador */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Buscar egresado por nombre, DNI o curso..."
                  value={busquedaAdmin}
                  onChange={(e) => setBusquedaAdmin(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </div>

              {/* Tabla Egresados */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-700 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">DNI</th>
                      <th className="px-4 py-3">Egresado/a</th>
                      <th className="px-4 py-3">Curso</th>
                      <th className="px-4 py-3 text-center">Invitados</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {egresados
                      .filter(
                        (eg) =>
                          eg.nombre_completo.toLowerCase().includes(busquedaAdmin.toLowerCase()) ||
                          eg.dni.includes(busquedaAdmin) ||
                          (eg.curso || '').toLowerCase().includes(busquedaAdmin.toLowerCase())
                      )
                      .map((eg) => {
                        const famsEg = familiares.filter(
                          (f) => f.egresado_id === eg.id && f.nombre_completo?.trim()
                        );
                        return (
                          <tr key={eg.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono font-semibold">{eg.dni}</td>
                            <td className="px-4 py-3 font-medium">{eg.nombre_completo}</td>
                            <td className="px-4 py-3 text-slate-600">{eg.curso}</td>
                            <td className="px-4 py-3 text-center font-semibold">
                              {famsEg.length} / {eg.cupo_asignado ?? cupoBase}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {eg.cerrado ? (
                                <span className="bg-slate-200 text-slate-800 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                                  Cerrado
                                </span>
                              ) : (
                                <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                                  Abierto
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right space-x-2">
                              {eg.cerrado && (
                                <button
                                  onClick={async () => {
                                    await supabase
                                      .from('egresados')
                                      .update({ cerrado: false })
                                      .eq('id', eg.id);
                                    cargarTodo();
                                  }}
                                  className="text-xs text-blue-600 hover:underline font-semibold"
                                >
                                  Reabrir
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  if (!window.confirm(`¿Eliminar a ${eg.nombre_completo}?`)) return;
                                  await supabase.from('familiares').delete().eq('egresado_id', eg.id);
                                  await supabase.from('egresados').delete().eq('id', eg.id);
                                  cargarTodo();
                                }}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4 inline" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB: DOCENTES (CON IMPORTACIÓN MASIVA CSV + VACIAR PADRÓN) */}
          {tabAdmin === 'docentes' && (
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Padrón de Docentes y Personal</h3>
                  <p className="text-xs text-slate-500">
                    Cada docente cargado reserva automáticamente 1 butaca dentro de las 525 del recinto.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition">
                    <Upload className="w-4 h-4" />
                    Importar CSV Docentes
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => handleImportarCSV(e, 'docentes')}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleVaciarDocentes}
                    className="bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    Vaciar Docentes
                  </button>
                </div>
              </div>

              <form onSubmit={handleAgregarDocente} className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="DNI (8 dígitos)"
                  value={nuevoDocente.dni}
                  onChange={(e) => setNuevoDocente({ ...nuevoDocente, dni: sanitizarDNI(e.target.value) })}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono bg-white"
                />
                <input
                  type="text"
                  placeholder="Apellido y Nombre"
                  value={nuevoDocente.nombre_completo}
                  onChange={(e) => setNuevoDocente({ ...nuevoDocente, nombre_completo: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm uppercase bg-white"
                />
                <input
                  type="text"
                  placeholder="Área / Cargo (ej: QUÍMICA)"
                  value={nuevoDocente.area}
                  onChange={(e) => setNuevoDocente({ ...nuevoDocente, area: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm uppercase bg-white"
                />
                <button
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold py-2 px-4 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Docente
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-700 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">DNI</th>
                      <th className="px-4 py-3">Docente</th>
                      <th className="px-4 py-3">Área / Cargo</th>
                      <th className="px-4 py-3 text-center">Presente</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {docentes.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-semibold">{doc.dni}</td>
                        <td className="px-4 py-3 font-medium">{doc.nombre_completo}</td>
                        <td className="px-4 py-3 text-slate-600">{doc.area}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleAsistenciaPuerta('docentes', doc)}
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              doc.asistio
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {doc.asistio ? '✓ Asistió' : 'Pendiente'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={async () => {
                              if (!window.confirm(`¿Eliminar a ${doc.nombre_completo}?`)) return;
                              await supabase.from('docentes').delete().eq('id', doc.id);
                              cargarTodo();
                            }}
                            className="text-red-600 hover:text-red-800 p-1"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB: INVITADOS ESPECIALES (AUTORIDADES / VIP) */}
          {tabAdmin === 'vip' && (
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Invitados Especiales y Autoridades</h3>
                <p className="text-xs text-slate-500">
                  Bloque flexible (base estimada ~20 lugares, ampliable o reducible en tiempo real).
                </p>
              </div>

              <form onSubmit={handleAgregarVip} className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="DNI (opcional)"
                  value={nuevoVip.dni}
                  onChange={(e) => setNuevoVip({ ...nuevoVip, dni: sanitizarDNI(e.target.value) })}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono bg-white"
                />
                <input
                  type="text"
                  placeholder="Nombre y Apellido"
                  value={nuevoVip.nombre_completo}
                  onChange={(e) => setNuevoVip({ ...nuevoVip, nombre_completo: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm uppercase bg-white"
                />
                <input
                  type="text"
                  placeholder="Cargo / Institución"
                  value={nuevoVip.cargo}
                  onChange={(e) => setNuevoVip({ ...nuevoVip, cargo: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
                />
                <button
                  type="submit"
                  className="bg-purple-700 hover:bg-purple-800 text-white text-sm font-bold py-2 px-4 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Agregar VIP
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-700 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">DNI</th>
                      <th className="px-4 py-3">Invitado Especial</th>
                      <th className="px-4 py-3">Cargo</th>
                      <th className="px-4 py-3 text-center">Presente</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invitadosEspeciales.map((vip) => (
                      <tr key={vip.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono">{vip.dni}</td>
                        <td className="px-4 py-3 font-medium">{vip.nombre_completo}</td>
                        <td className="px-4 py-3 text-slate-600">{vip.cargo}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleAsistenciaPuerta('invitados_especiales', vip)}
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              vip.asistio
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {vip.asistio ? '✓ Asistió' : 'Pendiente'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={async () => {
                              await supabase.from('invitados_especiales').delete().eq('id', vip.id);
                              cargarTodo();
                            }}
                            className="text-red-600 hover:text-red-800 p-1"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB: ETAPAS, CIERRE PARCIAL Y SOLICITUDES DE BUTACAS EXTRA */}
          {tabAdmin === 'solicitudes' && (
            <section className="space-y-6">
              {/* Control de Etapas y Cupo Base */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Control de Etapas y Cupo Base</h3>
                    <p className="text-xs text-slate-500">
                      Gestioná la ventana de carga de los egresados y recuperá vacantes sin usar.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-xl">
                    <span className="text-xs font-bold text-slate-700">Cupo base por alumno:</span>
                    {[2, 3, 4].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleActualizarCupoBase(num)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                          cupoBase === num
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {num} fam.
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => handleCambiarEtapa('abierta')}
                    className={`p-4 rounded-xl border-2 text-left transition ${
                      estadoEtapa === 'abierta'
                        ? 'border-emerald-600 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="font-bold text-sm text-slate-900">1. Carga Inicial Abierta</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Todos los egresados pueden cargar a sus {cupoBase} familiares y descargar sus QR.
                    </p>
                  </button>

                  <button
                    onClick={() => handleCambiarEtapa('parcial')}
                    className={`p-4 rounded-xl border-2 text-left transition ${
                      estadoEtapa === 'parcial'
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="font-bold text-sm text-slate-900">2. Cierre Parcial (Reubicación)</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Congela el padrón general y habilita solo a quienes reciban butacas vacantes extra.
                    </p>
                  </button>

                  <button
                    onClick={() => handleCambiarEtapa('cerrada')}
                    className={`p-4 rounded-xl border-2 text-left transition ${
                      estadoEtapa === 'cerrada'
                        ? 'border-red-600 bg-red-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="font-bold text-sm text-slate-900">3. Cierre Definitivo</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Bloqueo total previo al acto para emitir padrones finales de puerta.
                    </p>
                  </button>
                </div>

                {/* Recupero y Reubicación Directa */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      Vacantes recuperables sin usar: {metricasAforo.cuposVacantesRecuperables} lugares
                    </p>
                    <p className="text-xs text-slate-500">
                      Liberá los cupos que los egresados no completaron para reasignarlos a otras familias.
                    </p>
                  </div>
                  <button
                    onClick={handleRecuperarTodasVacantes}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm"
                  >
                    Recuperar Vacantes No Utilizadas
                  </button>
                </div>

                {/* Asignación manual directa a cualquier egresado */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <select
                    value={egresadoReubicarId}
                    onChange={(e) => setEgresadoReubicarId(e.target.value)}
                    className="flex-1 min-w-[220px] border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="">Seleccionar egresado para asignar butacas extra...</option>
                    {egresados.map((eg) => (
                      <option key={eg.id} value={eg.id}>
                        {eg.nombre_completo} ({eg.curso}) — Actual: {eg.cupo_asignado ?? cupoBase}
                      </option>
                    ))}
                  </select>
                  <select
                    value={cantidadReubicar}
                    onChange={(e) => setCantidadReubicar(Number(e.target.value))}
                    className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value={1}>+1 butaca</option>
                    <option value={2}>+2 butacas</option>
                    <option value={3}>+3 butacas</option>
                  </select>
                  <button
                    type="button"
                    disabled={!egresadoReubicarId}
                    onClick={() => handleReubicarButacas(egresadoReubicarId, cantidadReubicar)}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm px-4 py-2.5 rounded-xl"
                  >
                    Asignar y Habilitar Portal
                  </button>
                </div>
              </div>

              {/* Bandeja de Solicitudes de Butacas Extra */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Bandeja de Solicitudes de Butacas Extra</h3>
                {solicitudesExtra.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay solicitudes registradas aún.</p>
                ) : (
                  <div className="space-y-3">
                    {solicitudesExtra.map((sol) => {
                      const msgWa = encodeURIComponent(
                        `Hola ${sol.egresado_nombre}, te avisamos desde la organización de la Colación 2026 (ESRN N° 005) que se aprobaron tus +${sol.cantidad_solicitada} butaca(s) extra. Ya podés ingresar con tu DNI a https://colacionesrn5.vercel.app para cargar a tus nuevos invitados y descargar sus QR.`
                      );
                      return (
                        <div
                          key={sol.id}
                          className="border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
                        >
                          <div>
                            <p className="font-bold text-slate-900">
                              {sol.egresado_nombre}{' '}
                              <span className="text-xs font-normal text-slate-500">
                                ({sol.egresado_curso} · DNI {sol.egresado_dni})
                              </span>
                            </p>
                            <p className="text-sm text-blue-700 font-semibold">
                              Solicita: +{sol.cantidad_solicitada} butaca(s)
                            </p>
                            {sol.observacion && (
                              <p className="text-xs text-slate-600 mt-0.5">"{sol.observacion}"</p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {sol.estado === 'pendiente' ? (
                              <>
                                <button
                                  onClick={() =>
                                    handleReubicarButacas(sol.egresado_id, sol.cantidad_solicitada, sol.id)
                                  }
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg"
                                >
                                  ✓ Aprobar (+{sol.cantidad_solicitada})
                                </button>
                                <button
                                  onClick={async () => {
                                    await supabase
                                      .from('solicitudes_butacas')
                                      .update({ estado: 'rechazada' })
                                      .eq('id', sol.id);
                                    cargarTodo();
                                  }}
                                  className="bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold px-3 py-2 rounded-lg"
                                >
                                  Rechazar
                                </button>
                              </>
                            ) : (
                              <span
                                className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                                  sol.estado === 'aprobada'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {sol.estado}
                              </span>
                            )}

                            <a
                              href={`https://wa.me/?text=${msgWa}`}
                              target="_blank"
                              rel="noreferrer"
                              className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-2 rounded-lg inline-flex items-center gap-1"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Notificar WhatsApp
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB: USUARIOS DEL SISTEMA (EXCLUSIVO ADMINISTRADOR) */}
          {tabAdmin === 'usuarios' && perfilUsuario?.rol === 'admin' && (
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Usuarios y Roles del Sistema</h3>
                <p className="text-xs text-slate-500">
                  Creá cuentas para Coordinadores y personal de Control de Acceso (Puerta) sin cerrar tu sesión.
                </p>
              </div>

              {/* Formulario Nuevo Usuario */}
              <form
                onSubmit={handleCrearUsuarioSistema}
                className="bg-slate-50 border border-slate-200 p-4 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
              >
                <input
                  type="text"
                  required
                  placeholder="Nombre y Apellido"
                  value={nuevoUsuario.nombre}
                  onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })}
                  className="px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white"
                />
                <input
                  type="email"
                  required
                  placeholder="Correo electrónico"
                  value={nuevoUsuario.email}
                  onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })}
                  className="px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white"
                />
                <div className="relative">
                  <input
                    type={mostrarPassNuevo ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Contraseña (mín. 6)"
                    value={nuevoUsuario.password}
                    onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })}
                    className="w-full px-3 py-2.5 pr-9 border border-slate-300 rounded-xl text-sm bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPassNuevo(!mostrarPassNuevo)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                  >
                    {mostrarPassNuevo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <select
                  value={nuevoUsuario.rol}
                  onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}
                  className="px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white font-semibold"
                >
                  <option value="puerta">Control de Acceso (Puerta)</option>
                  <option value="coordinador">Coordinador</option>
                  <option value="admin">Administrador</option>
                </select>
                <button
                  type="submit"
                  disabled={creandoUsuario}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  {creandoUsuario ? 'Creando...' : 'Agregar Usuario'}
                </button>
              </form>

              {/* Tabla de Usuarios Registrados */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-700 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Correo de Acceso</th>
                      <th className="px-4 py-3">Rol Asignado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usuariosSistema.map((usr) => (
                      <tr key={usr.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{usr.nombre}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{usr.email}</td>
                        <td className="px-4 py-3">
                          <select
                            value={usr.rol}
                            onChange={(e) => handleCambiarRolUsuario(usr, e.target.value)}
                            className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold bg-white"
                          >
                            <option value="admin">ADMINISTRADOR</option>
                            <option value="coordinador">COORDINADOR</option>
                            <option value="puerta">PUERTA</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleEliminarUsuarioSistema(usr)}
                            className="text-red-600 hover:text-red-800 p-1"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB: REPORTES Y ACREDITACIÓN EN VIVO */}
          {tabAdmin === 'reportes' && (
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                  <p className="text-xs text-emerald-700 font-semibold">Total Ingresados</p>
                  <p className="text-2xl font-extrabold text-emerald-900">
                    {metricasAforo.totalEnSala} / {CAPACIDAD_TOTAL}
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                  <p className="text-xs text-blue-700 font-semibold">Egresados Presentes</p>
                  <p className="text-2xl font-extrabold text-blue-900">
                    {metricasAforo.egresadosPresentes} / {metricasAforo.totalEgresados}
                  </p>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                  <p className="text-xs text-amber-700 font-semibold">Familiares Presentes</p>
                  <p className="text-2xl font-extrabold text-amber-900">
                    {metricasAforo.familiaresPresentes}
                  </p>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl">
                  <p className="text-xs text-indigo-700 font-semibold">Docentes Presentes</p>
                  <p className="text-2xl font-extrabold text-indigo-900">
                    {metricasAforo.docentesPresentes} / {metricasAforo.totalDocentes}
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl">
                  <p className="text-xs text-purple-700 font-semibold">VIP Presentes</p>
                  <p className="text-2xl font-extrabold text-purple-900">
                    {metricasAforo.vipPresentes} / {metricasAforo.totalVip}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-3">
                  Listado en Vivo de Egresados Acreditados (Ceremonial y Diplomas)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-700">
                      <tr>
                        <th className="px-4 py-2.5">Curso</th>
                        <th className="px-4 py-2.5">Egresado/a</th>
                        <th className="px-4 py-2.5">DNI</th>
                        <th className="px-4 py-2.5 text-center">Estado Ceremonial</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {egresados.map((eg) => (
                        <tr key={eg.id}>
                          <td className="px-4 py-2.5 text-slate-600">{eg.curso}</td>
                          <td className="px-4 py-2.5 font-semibold">{eg.nombre_completo}</td>
                          <td className="px-4 py-2.5 font-mono">{eg.dni}</td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => toggleAsistenciaPuerta('egresados', eg)}
                              className={`px-3 py-1 rounded-full text-xs font-bold ${
                                eg.asistio
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {eg.asistio ? '✓ PRESENTE EN ACTO' : 'Ausente'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </main>
      )}

      {/* ==================== VISTA 4: CONTROL DE ACCESO EN PUERTA (CELULAR) ==================== */}
      {vista === 'puerta' && usuarioAuth && (
        <main className="max-w-xl mx-auto px-4 py-6 space-y-5">
          {/* Conteo rápido en puerta */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Ingresos Registrados en Sala</p>
              <p className="text-2xl font-extrabold">
                {metricasAforo.totalEnSala} <span className="text-sm font-normal text-slate-400">/ 525</span>
              </p>
            </div>
            <button
              onClick={() => setEscanerCamaraActivo(!escanerCamaraActivo)}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-4 py-3 rounded-xl flex items-center gap-2 shadow-md"
            >
              <Camera className="w-5 h-5" />
              {escanerCamaraActivo ? 'Cerrar Cámara' : 'Escanear QR'}
            </button>
          </div>

          {/* Visor Cámara QR */}
          {escanerCamaraActivo && (
            <div className="bg-black rounded-2xl overflow-hidden relative aspect-video border-2 border-emerald-500">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              <div className="absolute inset-0 border-4 border-emerald-400/50 pointer-events-none flex items-end justify-center pb-3">
                <span className="bg-black/70 text-white text-xs px-3 py-1 rounded-full">
                  Apuntá al código QR de la invitación...
                </span>
              </div>
            </div>
          )}

          {/* Resultado de escaneo */}
          {resultadoEscaneo && (
            <div
              className={`rounded-2xl p-5 border-2 shadow-sm ${
                resultadoEscaneo.tipo === 'ok'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                  : resultadoEscaneo.tipo === 'duplicado'
                  ? 'bg-amber-50 border-amber-500 text-amber-950'
                  : 'bg-red-50 border-red-500 text-red-950'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-extrabold">{resultadoEscaneo.titulo}</h3>
                  <p className="text-sm font-semibold mt-1">{resultadoEscaneo.detalle}</p>
                  {resultadoEscaneo.egresado && (
                    <p className="text-xs mt-1 opacity-80">{resultadoEscaneo.egresado}</p>
                  )}
                </div>
                <button
                  onClick={() => setResultadoEscaneo(null)}
                  className="text-sm font-bold px-2 py-1 rounded bg-black/10"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Validación rápida por código de entrada */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              validarCodigoEntrada(codigoManualQR);
              setCodigoManualQR('');
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              placeholder="Código entrada (ej: ENT-8706-1)"
              value={codigoManualQR}
              onChange={(e) => setCodigoManualQR(e.target.value)}
              className="flex-1 px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono uppercase"
            />
            <button
              type="submit"
              className="bg-slate-900 text-white font-bold text-sm px-4 py-2.5 rounded-xl"
            >
              Validar
            </button>
          </form>

          {/* Respaldo Minimalista en 2 Pasos */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Buscar por Nombre, DNI (8 dígitos) o N° Entrada..."
                value={busquedaPuerta}
                onChange={(e) => {
                  setBusquedaPuerta(e.target.value);
                  setEgresadoPuertaSeleccionado(null);
                }}
                className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Paso 1: Tarjetas de Egresados coincidentes */}
            {!egresadoPuertaSeleccionado && resultadosBusquedaPuerta.length > 0 && (
              <div className="space-y-2">
                {resultadosBusquedaPuerta.map(({ egresado, motivo }) => (
                  <button
                    key={egresado.id}
                    onClick={() => setEgresadoPuertaSeleccionado(egresado)}
                    className="w-full text-left p-3.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{egresado.nombre_completo}</p>
                      <p className="text-xs text-slate-500">
                        DNI {egresado.dni} · {egresado.curso} · <span className="text-blue-700">{motivo}</span>
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </button>
                ))}
              </div>
            )}

            {/* Paso 2: Ficha del grupo para tildar "Asistió" */}
            {egresadoPuertaSeleccionado && (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-blue-600 uppercase">Grupo Familiar</p>
                    <h4 className="font-bold text-slate-900">{egresadoPuertaSeleccionado.nombre_completo}</h4>
                  </div>
                  <button
                    onClick={() => setEgresadoPuertaSeleccionado(null)}
                    className="text-xs bg-slate-100 px-2.5 py-1.5 rounded-lg font-semibold"
                  >
                    ← Volver
                  </button>
                </div>

                {/* Check Egresado */}
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm text-blue-950">
                      🎓 {egresadoPuertaSeleccionado.nombre_completo}
                    </p>
                    <p className="text-xs text-blue-700 font-mono">DNI {egresadoPuertaSeleccionado.dni}</p>
                  </div>
                  <button
                    onClick={() => toggleAsistenciaPuerta('egresados', egresadoPuertaSeleccionado)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                      egresados.find((x) => x.id === egresadoPuertaSeleccionado.id)?.asistio
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white border border-slate-300 text-slate-700'
                    }`}
                  >
                    {egresados.find((x) => x.id === egresadoPuertaSeleccionado.id)?.asistio
                      ? '✓ Asistió'
                      : 'Marcar Asistió'}
                  </button>
                </div>

                {/* Checks Familiares */}
                {familiares
                  .filter((f) => f.egresado_id === egresadoPuertaSeleccionado.id)
                  .map((fam) => (
                    <div
                      key={fam.id}
                      className="p-3 rounded-xl border border-slate-200 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-sm text-slate-900">{fam.nombre_completo}</p>
                        <p className="text-xs text-slate-500 font-mono">
                          DNI {fam.dni} · {fam.numero_entrada}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleAsistenciaPuerta('familiares', fam)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                          fam.asistio
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {fam.asistio ? '✓ Asistió' : 'Marcar Asistió'}
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
