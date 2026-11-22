import React, { useState, useEffect, useRef, useMemo } from 'react';
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
// Si la red queda "colgada" (wifi sin internet), cada pedido se corta a los 12 s y se trata como sin conexión
const fetchConTiempo = (url, opts = {}) => {
  if (opts.signal || typeof AbortController === 'undefined') return fetch(url, opts);
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  return fetch(url, { ...opts, signal: ctrl.signal }).catch((e) => { throw (e && e.name === 'AbortError') ? new TypeError('Failed to fetch (sin respuesta en 12 s)') : e; }).finally(() => clearTimeout(t));
};
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchConTiempo } });

const createTempAuthClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

const sanitizeDNI = (val) => String(val || '').replace(/\D/g, '').slice(0, 8);
// Aviso en rojo debajo de un campo del portal (grande y fijo: no desaparece hasta que se corrige)
function AvisoCampo({ msg }) {
  return <p role="alert" className="mt-1 flex items-start gap-1.5 text-sm font-bold text-rose-700 bg-rose-50 border border-rose-300 rounded-lg px-2.5 py-1.5"><span aria-hidden="true">⚠️</span><span>{msg}</span></p>;
}
// Validaciones del portal (se usan al salir de cada campo y al guardar)
const validarNombreInvitado = (nombre) => {
  const n = String(nombre || '').trim();
  if (!n) return '';
  const palabras = n.split(/\s+/).filter((w) => w.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').length >= 2);
  if (palabras.length < 2 || /\d/.test(n)) return 'Escribí nombre y apellido completos (sin números).';
  return '';
};
const validarDniInvitado = (dniVal, dniEgresado) => {
  const d = sanitizeDNI(dniVal);
  if (!d) return '';
  if (d.length < 7 || /^(\d)\1+$/.test(d)) return `El DNI ${d} no es válido: tiene que tener 7 u 8 números.`;
  if (dniEgresado && d === sanitizeDNI(dniEgresado)) return 'Ese es tu propio DNI. Cargá el DNI de tu invitado.';
  return '';
};
// Celular argentino: 10 números (característica + número), sin 0 ni 15. Ej: 2994444444
const validarCelularPortal = (val, obligatorio) => {
  const d = String(val || '').replace(/\D/g, '');
  if (!d) return obligatorio ? 'El celular es obligatorio: 10 números, sin 0 ni 15 (ej: 2994444444).' : '';
  if (d.length !== 10 || d.startsWith('0') || /^(\d)\1+$/.test(d)) return 'El celular no es válido: tienen que ser 10 números, sin 0 ni 15 (ej: 2994444444).';
  return '';
};
// Respuesta de la verificación con los 4 números del celular (v25)
const textoClavePortal = (v, conWhatsapp = false) => {
  const t = String(v || '');
  if (t === 'falta') return 'Escribí los últimos 4 números de tu celular.';
  if (t === 'bloqueado') return 'Por seguridad, el acceso con este DNI quedó bloqueado 15 minutos por demasiados intentos. ' + (conWhatsapp
    ? 'Si no recordás el celular que cargaste, pedí ayuda tocando el botón verde de WhatsApp (abajo a la derecha).'
    : 'Si no recordás el celular que cargaste, comunicate con la escuela.');
  if (t.startsWith('incorrecta')) { const n = Number(t.split(':')[1]); return `Los números no coinciden con el celular cargado.${n ? ` Te quedan ${n} intento${n === 1 ? '' : 's'}.` : ''}`; }
  return 'No se pudo verificar el celular.';
};
const fechaHoraAR = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const CAPACIDAD_MAXIMA = 525;
const CAPACIDAD_DEFINITIVA = 525; // número definitivo de butacas (decisión del 19/11/2026)
const CUPO_BASE_DEFECTO = 4;
const VERSION_APP = 'v33 · 22/11/2026'; // cambiarla en cada entrega para saber qué versión está publicada
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

// ---------- Historial de cambios (se muestra con el botón "📋 Novedades"). Agregar arriba en cada entrega. ----------
const NOVEDADES = [
  { v: 'v33', fecha: '22/11/2026', items: [
    'Al cerrar la carga (Cierre Parcial): ya no se pueden pedir butacas extra, y los invitados guardados no se pueden cambiar. Los que tienen extras aprobadas solo completan esos lugares nuevos. Todos pueden seguir entrando a ver y descargar sus QR.',
    'Administración: si se aprueba una extra con la carga cerrada, el egresado queda con lo que tenía cargado + las aprobadas (los lugares que no usó no se reabren).',
    'Portal: los lugares libres (por ejemplo, las butacas extra aprobadas) aparecen abiertos para completar directo, con un aviso y un botón "Guardar". El botón "Editar" queda solo para cambiar a los invitados ya guardados.',
    'Portal: si el acceso se bloquea por equivocarse 5 veces con el celular, el mensaje indica pedir ayuda con el botón verde de WhatsApp (si está activado).'] },
  { v: 'v32', fecha: '22/11/2026', items: [
    'Portal: el "Pase del Grupo Familiar" ahora aparece al pie del formulario, justo debajo del botón "Guardar", después de cargar los invitados.',
    'Portal: los errores se avisan apenas el egresado sale del campo, en rojo y grande debajo del campo (celular, nombre, DNI y motivo de las extras). No hace falta esperar a "Guardar".',
    'Al apretar "Guardar" con un error, la página lleva directo al campo a corregir.',
    'Los carteles de aviso ahora son más grandes, aparecen abajo al centro y tienen una ✕ para cerrarlos. En el portal, los de error duran 15 segundos.'] },
  { v: 'v31', fecha: '21/11/2026', items: [
    'El botón "📋 Novedades" ahora está solo en Administración y lo ven solo los administradores.',
    'Portal: el celular del egresado es siempre obligatorio y tiene que tener 10 números, sin 0 ni 15 (ej: 2994444444).',
    'Portal: cada invitado tiene que tener nombre y apellido (2 palabras, sin números) y un DNI de 7 u 8 números. No se acepta el DNI del propio egresado.',
    'Portal: el pedido de butacas extra exige escribir el motivo y para quién son.'] },
  { v: 'v30', fecha: '21/11/2026', items: [
    'Portal: si la base no tiene todavía la verificación del celular, el portal sigue funcionando igual (antes, al guardar por segunda vez o pedir extras salía "falta configurar la base").',
    'Registro de actividad exportado con la hora en formato de 24 horas.',
    'Aforo y Sala: grupo de sector nuevo "VIP, autoridades y movilidad reducida". Los VIP y las FAMILIAS COMPLETAS con alguien con movilidad reducida se sientan ahí: lo ven en sus pases y se cuentan juntos en "asignadas vs. necesarias".',
    'Pases de las familias con movilidad reducida en color naranja (grupo e individuales), para reconocerlos en la Puerta.',
    'Portal: queda registrado cuando el egresado descarga su QR, el del grupo familiar o el de cada invitado (y cuando abre el video).',
    'Egresados: filtro "QR descargados" (Bajaron su QR / No bajaron / Familia sin bajar), y en la ficha de persona se ve si y cuándo descargó cada QR.',
    'Aforo y Sala: la primera fila (F1, cortesía) tiene ahora 25 butacas completas; el croquis suma 523.',
    'Panel de Mantenimiento: botón "🧹 Preparar para abrir". Muestra lo que hay, pide bajar el respaldo y con "LIMPIAR" borra todo lo de las pruebas (invitados, solicitudes, presentes, marcas del portal, pedidos de ayuda y registros de prueba), con la opción de borrar los celulares. Reactiva egresados, docentes y VIP en "No asiste". Deja cupo 3 y etapa Abierta.'] },
  { v: 'v29', fecha: '20/11/2026', items: [
    'Puerta: lo que quedó guardado sin conexión en un celular se descarta a las 12 horas. Así ningún ingreso de las pruebas se sube después de reiniciar la base.'] },
  { v: 'v28', fecha: '20/11/2026', items: [
    'Si un invitado de un egresado tiene movilidad reducida, TODA esa familia entra por el acceso de abajo y la atiende el puesto de Docentes y VIP: se ve en los pases, en el portal, en la Puerta, en la ficha y en el aviso del día anterior.',
    'Resumen Papel: lista 4 con esas familias (para el puesto de Docentes y VIP) y aviso en la fila del egresado de su curso.'] },
  { v: 'v27', fecha: '20/11/2026', items: [
    'Egresados: filtro de asistencia (Todos / Asisten / No asisten) y botón "📄 PDF de los que no asisten", por curso o de todos.',
    'Portal: el botón "No podré asistir" pasó a estar justo debajo del QR del egresado y aclara que libera también las butacas de sus invitados.'] },
  { v: 'v26', fecha: '20/11/2026', items: ['Botón "📋 Novedades" con este historial de cambios.'] },
  { v: 'v25', fecha: '20/11/2026', items: [
    'Puerta sin conexión: si se corta internet sigue registrando y cuando vuelve la señal sube todo solo, con la hora real.',
    'Cada usuario de Puerta tiene su puesto (Egresados, Familias de un curso, Docentes y VIP); avisa si escanean a alguien de otro puesto.',
    'Cambio automático de etapa por fecha (se activa y desactiva en Administración).',
    'Portal: opción de pedir los últimos 4 números del celular para entrar (5 errores bloquean 15 minutos).',
    'Portal: el egresado ve cuándo se modificó su lista por última vez.',
    'Respaldo completo de todas las tablas en un Excel.',
    'Aviso del día anterior por WhatsApp, con lista para imprimir de los que no tienen celular.',
    'Coordinadores ven la historia del registro en la ficha de persona.'] },
  { v: 'v24', fecha: '19–20/11/2026', items: [
    'Botón 🆘 "Pedir ayuda a coordinación" en la Puerta, con motivos rápidos y estado "va en camino".',
    'Avisos automáticos a coordinación: 3 QR no encontrados seguidos o búsquedas manuales sin resultado; botón "No lo encuentro".',
    'Cartel rojo con alarma para coordinación y admin en cualquier pantalla, con "Voy yo", "Resuelto" e historial.',
    'Teléfonos de coordinación (uno o varios) para llamar cuando no hay internet.',
    'Hoja "Pedidos de ayuda" en el Excel de estadística.'] },
  { v: 'v23', fecha: '19/11/2026', items: [
    'Solapa "🔎 Buscar persona": cualquiera del sistema por DNI o nombre, también con errores de carga, con su ficha e historia.',
    'Puerta: "¿Quisiste decir…?" en la búsqueda manual.',
    'Registro de la Puerta preparado para estadística y botón "Estadística de la Puerta (Excel)".',
    'Selector de curso más visible.'] },
  { v: 'v22', fecha: '19/11/2026', items: [
    'Puerta: respeta si el QR es de VIP o de docente cuando el DNI está en dos listas.',
    'Egresados: filtro por curso y por "entró / no entró al portal"; botón para reiniciar esas marcas.',
    'Invitados: filtro por curso y exportar solo lo filtrado.',
    'Resumen Papel ordenado por curso, con opción de imprimir un solo curso.',
    'Curso en los pases y en la Puerta. Bip y vibración al escanear, con botón para silenciar.',
    'Video tutorial en el portal (con interruptor).',
    'VIP: DNI visible en la lista y aviso al cambiar DNI o nombre.'] },
  { v: 'Base real', fecha: '19/11/2026', items: ['Arreglo del portal VIP (columna "activo"), VIP sin DNI permitidos y estado de solicitudes en minúscula.'] },
  { v: 'v19 a v21', fecha: '19/11/2026', items: [
    'Escudo con opción de usarlo o no; fila VIP.',
    'Registro de lo que hacen las familias en el portal y marca de quién entró.',
    'Portal: el celular ya no se corta en 8 números.'] },
  { v: 'Seguridad (Etapa C)', fecha: '18–19/11/2026', items: [
    'El portal pasó a funciones seguras de la base: sin sesión no se pueden ver ni modificar los padrones.',
    'Puerta solo puede marcar asistencia; admin puede cambiar la contraseña de otros usuarios.'] },
  { v: 'Tanda 14', fecha: '18/11/2026', items: [
    'Aforo y Sala con el croquis del Teatro CCC, capacidad configurable y sectores; la ubicación sale en los pases y en la Puerta.',
    'Hora real de ingreso de egresados, docentes y VIP.',
    'Importar docentes con la columna "Ocupa butaca". Ícono de la página.'] },
  { v: 'Tanda 13', fecha: '18/11/2026', items: [
    'Orientación y división de los 114 egresados.',
    'QR propio del grupo familiar; el QR del egresado registra solo al egresado.',
    'Accesos por orientación, colores de pase y movilidad reducida.',
    'Una sola solicitud de butacas extra por egresado, con aprobación total o parcial.',
    'Etapas Abierta / Cierre Parcial / Definitivo.',
    '"No asistiré" bloquea en la Puerta al grupo de ese egresado. Escudo institucional.'] },
  { v: 'Pases', fecha: '18/11/2026', items: ['Pases de docentes regenerados con el QR correcto; QR sin tildes; aviso de "pase antiguo" en la Puerta.'] },
  { v: 'Tandas 10 a 12', fecha: '17/11/2026', items: [
    'Corregidos los QR de invitados y los QR ficticios del panel; el grupo entra con un solo QR.',
    'El portal ya no dice "guardado" si falló al guardar.',
    'Al aplicar el cupo se pueden recortar los invitados que sobran.'] },
  { v: 'Tandas 2 a 9', fecha: '16/11/2026', items: [
    'Importación de CSV rehecha, con vista previa y "Deshacer última importación". Pestaña "Invitados de egresados".',
    'Interruptores de Portal VIP y de WhatsApp.',
    'Docentes con y sin butaca.',
    'Simulador de cupo y cantidad de invitados para todos de una vez.',
    'La Puerta deja registro de todo; exportar el registro de actividad.',
    '"No asiste" libera la plaza y bloquea en la Puerta.',
    'Búsqueda manual completa en la Puerta, reporte de asistencia en Excel y alerta de aforo.',
    'Panel de usuarios: cambiar rol y activar o desactivar.'] },
  { v: 'Puerta y varios celulares', fecha: '16/11/2026', items: [
    'Se registra el ingreso del egresado; duplicados detectados aunque escaneen dos celulares a la vez.',
    'Lector de QR para iPhone; el rol Puerta entra directo a la Puerta.'] },
  { v: 'Inicio', fecha: '15/11/2026', items: ['Buscadores en las listas y recuperación de las funciones que se habían perdido (agregar, eliminar, importar).'] },
];
function ModalNovedades({ cerrar }) {
  useEffect(() => { try { localStorage.setItem('novedades_vista', NOVEDADES[0].v); } catch (_) { /* nada */ } }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 print:hidden" onClick={cerrar}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl border-t-4 border-[#6B1D2F]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-3 p-5 border-b">
          <div><h3 className="font-extrabold text-lg">📋 Novedades del sistema</h3><p className="text-xs text-slate-500">Todos los cambios, del más nuevo al más viejo. Versión publicada: {VERSION_APP}</p></div>
          <button type="button" onClick={cerrar} className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold cursor-pointer">Cerrar</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {NOVEDADES.map((n, i) => (
            <div key={n.v} className={`rounded-xl border p-3 ${i === 0 ? 'border-[#6B1D2F] bg-rose-50/40' : ''}`}>
              <p className="font-extrabold text-sm text-[#6B1D2F]">{n.v} <span className="text-xs font-semibold text-slate-500">· {n.fecha}</span>{i === 0 && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-[#6B1D2F] text-white">ACTUAL</span>}</p>
              <ul className="mt-1.5 space-y-1 text-sm text-slate-700 list-disc pl-5">{n.items.map((t, k) => <li key={k}>{t}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [vista, setVista] = useState('portal'); // 'portal', 'login', 'puerta', 'admin', 'reporte_papel'
  const [session, setSession] = useState(null);
  const [perfilStaff, setPerfilStaff] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const yaUbicadoRef = useRef(false);
  const [modalClave, setModalClave] = useState(false);
  const [claveNueva, setClaveNueva] = useState('');
  const [claveRepetida, setClaveRepetida] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);

  // Cada usuario puede cambiar SU PROPIA contraseña (no hace falta nada especial en el servidor)
  const cambiarMiClave = async (e) => {
    e.preventDefault();
    if (claveNueva.length < 8) { notify('La contraseña nueva tiene que tener al menos 8 caracteres.', 'error'); return; }
    if (claveNueva !== claveRepetida) { notify('Las dos contraseñas no coinciden.', 'error'); return; }
    setGuardandoClave(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: claveNueva });
      if (error) throw error;
      await registrarLog('USUARIOS', 'Contraseña', 'Cambió su propia contraseña.');
      setModalClave(false); setClaveNueva(''); setClaveRepetida('');
      notify('Contraseña cambiada. La próxima vez que entres usá la nueva.');
    } catch (err) {
      const m = String(err?.message || '');
      notify(/different from the old|same as/i.test(m) ? 'La contraseña nueva tiene que ser distinta de la actual.'
        : /reauthentication|nonce/i.test(m) ? 'Supabase pide volver a iniciar sesión antes de cambiarla: cerrá sesión, entrá de nuevo y repetí.'
        : /weak|at least/i.test(m) ? 'La contraseña es muy débil: usá al menos 8 caracteres con letras y números.'
        : 'No se pudo cambiar la contraseña: ' + m, 'error');
    } finally {
      setGuardandoClave(false);
    }
  };

  const [config, setConfig] = useState({ id: null, estado_etapa: 'abierta', cupo_base: CUPO_BASE_DEFECTO, filas: 15, butacas_por_fila: 35 });
  const whatsappActivo = config.whatsapp_activo !== false;
  const vipPortalActivo = config.portal_vip_activo !== false;
  const videoActivo = config.video_activo === true;
  const [egresados, setEgresados] = useState([]);
  const [invitados, setInvitados] = useState([]);
  if (session) actualizarFamiliasMovilidad(invitados); // v28: familias con movilidad reducida → acceso de abajo
  const [docentes, setDocentes] = useState([]);
  const [especiales, setEspeciales] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [usuariosSistema, setUsuariosSistema] = useState([]);
  const [logsSistema, setLogsSistema] = useState([]);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const notify = (msg, type = 'success', opciones = {}) => {
    setToast({ msg, type });
    clearTimeout(toastTimerRef.current);
    // Los errores del portal de egresados quedan 15 s (se pueden cerrar con la ✕). El resto, como siempre, para no tapar la Puerta.
    toastTimerRef.current = setTimeout(() => setToast(null), opciones.largo ? 15000 : 4500);
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
        try { if (rol === 'puerta') localStorage.setItem('puerta_perfil_v1', JSON.stringify({ ...data, rol })); } catch (_) { /* nada */ }
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
      // Sin conexión: un celular de Puerta sigue con el perfil que tenía guardado
      try { const g = JSON.parse(localStorage.getItem('puerta_perfil_v1') || 'null'); if (g && String(g.email || '').toLowerCase() === String(user?.email || '').toLowerCase() && !navigator.onLine) { setPerfilStaff(g); setVista('puerta'); yaUbicadoRef.current = true; return; } } catch (_) { /* nada */ }
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
      // Cambio automático de etapa (v25): por si el reloj de la base no corrió todavía
      try {
        const { data: c0 } = await supabase.from('configuracion').select('etapa_auto, etapa_auto_aplicada, fecha_cierre_parcial, fecha_definitivo').limit(1).maybeSingle();
        const rango = (v) => ({ cierre_parcial: 1, cierre_definitivo: 2 }[v] || 0);
        const ya = (f) => f && new Date(f) <= new Date();
        const toca = c0 && c0.etapa_auto === true ? (ya(c0.fecha_definitivo) ? 2 : ya(c0.fecha_cierre_parcial) ? 1 : 0) : 0;
        if (toca > rango(c0?.etapa_auto_aplicada)) await supabase.rpc('aplicar_etapa_automatica');
      } catch (_) { /* sin SQL v25 o sin conexión */ }
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
  // Si hay un sector "VIP / Autoridades", sus butacas cuentan como ocupadas aunque haya menos VIP cargados.
  // Las butacas del sector "Reservado / No usar" siempre cuentan como ocupadas.
  const butacasSectorVip = salaConfigDe(config).sectores.filter((s) => s.grupo === 'vip').reduce((a, s) => a + butacasDeSector(s).length, 0);
  const butacasReservadas = salaConfigDe(config).sectores.filter((s) => s.grupo === 'reservado').reduce((a, s) => a + butacasDeSector(s).length, 0);
  const butacasVipOcupadas = Math.max(totalEspeciales, butacasSectorVip);
  // Plazas familiares: en etapa Abierta cuenta el cupo completo de cada egresado.
  // Desde el Cierre Parcial, a quien NO tiene plazas extra aprobadas solo se le cuentan los invitados cargados
  // (el resto del cupo queda libre para reasignar). En el Cierre Definitivo, a todos se les cuentan los cargados.
  const totalCuposFamiliares = egresadosActivos.reduce((acc, e) => acc + plazasFamiliaresDe(e, { config, invitados, solicitudes }), 0);
  const totalOcupado = totalEgresados + totalDocentesConButaca + butacasVipOcupadas + butacasReservadas + totalCuposFamiliares;
  const CAPACIDAD = capacidadDe(config);
  const vacantesLibres = CAPACIDAD - totalOcupado;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans relative pb-24 overflow-x-hidden">
      {toast && (
        <div role="alert" className={`fixed bottom-5 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[min(92vw,640px)] z-[60] flex items-start gap-3 px-5 py-4 rounded-2xl shadow-2xl text-white text-base font-semibold leading-snug ring-4 ring-white/70 ${
          toast.type === 'error' ? 'bg-rose-700' : toast.type === 'warning' ? 'bg-amber-700' : 'bg-emerald-700'
        }`}>
          {toast.type === 'error' ? <XCircle className="w-7 h-7 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-7 h-7 shrink-0 mt-0.5" />}
          <span className="flex-1">{toast.msg}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={() => { clearTimeout(toastTimerRef.current); setToast(null); }} className="shrink-0 -mr-1 -mt-1 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white text-xl font-bold cursor-pointer">✕</button>
        </div>
      )}

      {/* Encabezado Institucional ESRN N° 005 */}
      <header className="bg-[#6B1D2F] text-white shadow-md sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2.5 cursor-pointer min-w-0" onClick={() => setVista('portal')}>
            {escudoDe(config) ? (
              <img src={escudoDe(config)} alt="Escudo" className="w-9 h-9 bg-white rounded-full object-contain p-0.5 shadow shrink-0" />
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
              <>
              {perfilStaff?.rol === 'admin' && (
              <button
                onClick={() => { setModalClave(true); setClaveNueva(''); setClaveRepetida(''); }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition"
                title="Cambiar mi contraseña"
              >
                🔑<span className="hidden sm:inline"> Mi contraseña</span>
              </button>
              )}
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white transition"
                title="Cerrar Sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                Salir
              </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {session && puedeAdministrar && <AvisosCoordinacion perfilStaff={perfilStaff} notify={notify} />}
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
            totalEgresados={totalEgresados} totalDocentes={totalDocentes} totalDocentesConButaca={totalDocentesConButaca} totalDocentesSinButaca={totalDocentesSinButaca} totalEspeciales={totalEspeciales} butacasVipOcupadas={butacasVipOcupadas} butacasReservadas={butacasReservadas}
            totalCuposFamiliares={totalCuposFamiliares} totalOcupado={totalOcupado} vacantesLibres={vacantesLibres} recargar={cargarDatosGlobales} notify={notify}
            abrirResumenPapel={() => setVista('reporte_papel')}
            reiniciarAsistenciasGeneral={reiniciarAsistenciasGeneral}
            borrarInvitadosEgresados={borrarInvitadosEgresados} registrarLog={registrarLog}
          />
        ) : vista === 'reporte_papel' && session && puedeAdministrar ? (
          <ReporteResumenPapel egresados={egresados} invitados={invitados} docentes={docentes} especiales={especiales} config={config} volver={() => setVista('admin')} />
        ) : (
          <PortalPrincipalDNI vipPortalActivo={vipPortalActivo} whatsappActivo={whatsappActivo} videoActivo={videoActivo} config={config} notify={notify} />
        )}
      </main>

      {modalClave && perfilStaff?.rol === 'admin' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 print:hidden">
          <form onSubmit={cambiarMiClave} className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-3 border-t-4 border-[#6B1D2F]">
            <h3 className="font-extrabold text-base text-slate-900">🔑 Cambiar mi contraseña</h3>
            <p className="text-xs text-slate-500">Cuenta: <b>{perfilStaff?.email || session?.user?.email}</b></p>
            <div className="relative">
              <input type={verClave ? 'text' : 'password'} autoComplete="new-password" placeholder="Contraseña nueva (mínimo 8)" value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" required />
              <button type="button" onClick={() => setVerClave(!verClave)} className="absolute right-3 top-2.5 text-slate-400 cursor-pointer">{verClave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
            <input type={verClave ? 'text' : 'password'} autoComplete="new-password" placeholder="Repetí la contraseña nueva" value={claveRepetida} onChange={(e) => setClaveRepetida(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" required />
            <div className="flex gap-2 pt-2 border-t">
              <button type="button" onClick={() => setModalClave(false)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold cursor-pointer">Cancelar</button>
              <button type="submit" disabled={guardandoClave} className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60">{guardandoClave ? 'Guardando...' : 'Cambiar contraseña'}</button>
            </div>
          </form>
        </div>
      )}

      <p className="text-center text-[10px] text-slate-400 mt-2 print:hidden">
        Control de Acceso Colación 2026 · {VERSION_APP}
      </p>

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

// Llama a una función del portal. Si la base todavía no tiene la versión que acepta p_clave
// (sql_v25 sin correr o incompleto), reintenta sin ese dato para que la familia no quede trabada.
const rpcPortal = async (fn, params) => {
  let r = await supabase.rpc(fn, params);
  if (r.error && params && 'p_clave' in params && (r.error.code === 'PGRST202' || r.error.code === '42883' || /could not find the function|function .* does not exist/i.test(r.error.message || ''))) {
    const { p_clave: _omitida, ...resto } = params;
    r = await supabase.rpc(fn, resto);
  }
  return r;
};

const VIDEO_TUTORIAL = '/tutorial.mp4';
function ModalVideoTutorial({ cerrar }) {
  const [fallo, setFallo] = useState(false);
  useEffect(() => { const esc = (e) => { if (e.key === 'Escape') cerrar(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [cerrar]);
  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-3" onClick={cerrar}>
      <div className="w-full max-w-sm space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center text-white">
          <p className="font-bold text-sm">▶ Cómo cargar a tus invitados</p>
          <button type="button" onClick={cerrar} className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-bold cursor-pointer">✕ Cerrar</button>
        </div>
        {fallo ? (
          <div className="bg-white rounded-xl p-5 text-center text-sm text-slate-700">El video no está disponible en este momento. Si tenés dudas, usá el botón verde de WhatsApp.</div>
        ) : (
          <video src={VIDEO_TUTORIAL} controls autoPlay playsInline preload="metadata" onError={() => setFallo(true)} className="w-full max-h-[80vh] rounded-xl bg-black" />
        )}
      </div>
    </div>
  );
}

function PortalPrincipalDNI({ vipPortalActivo, whatsappActivo, videoActivo, config, notify }) {
  const celularObligatorio = true; // 21/11: siempre obligatorio (sirve para avisos y como clave de 4 números)
  const [verVideo, setVerVideo] = useState(false);
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
  const [tocados, setTocados] = useState({}); // campos que el egresado ya dejó (para avisar al salir del campo)
  const tocar = (k) => setTocados((t) => (t[k] ? t : { ...t, [k]: true }));
  const errNombreFila = (fila, idx) => {
    if (!tocados['n' + idx]) return '';
    const n = String(fila.nombre_completo || '').trim();
    if (!n && sanitizeDNI(fila.dni) && tocados['d' + idx]) return 'Falta el nombre y apellido de este invitado.';
    return validarNombreInvitado(n);
  };
  const errDniFila = (fila, idx) => {
    if (!tocados['d' + idx]) return '';
    const d = sanitizeDNI(fila.dni);
    if (!d && String(fila.nombre_completo || '').trim()) return 'Falta el DNI de este invitado.';
    return validarDniInvitado(d, datosPersona?.dni || dni);
  };
  const [enviandoSol, setEnviandoSol] = useState(false);
  const [avisoSolicitud, setAvisoSolicitud] = useState(false);
  const [pideClave, setPideClave] = useState(null); // {nombre} cuando hay que escribir los 4 números del celular
  const [clave, setClave] = useState('');
  const claveRef = useRef('');
  const [ultimoCambio, setUltimoCambio] = useState(null);
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

  // Registro de lo que hacen las familias en el portal (no frena nada si falla o si falta el SQL)
  const registrarPortal = (accion, detalle, dniUsado) => {
    try {
      const d = sanitizeDNI(dniUsado || datosPersona?.dni || dni);
      supabase.rpc('portal_registrar', { p_tipo: tipoUsuario, p_dni: d, p_accion: accion, p_detalle: String(detalle || '').slice(0, 900) }).then(() => {}, () => {});
    } catch (_) { /* nada */ }
  };
  const errorPortal = (contexto, msg) => { notify(msg, 'error', { largo: true }); registrarPortal('ERROR', `${contexto}: ${msg}`); };

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
      const claveEnviada = pideClave ? String(clave || '').replace(/\D/g, '').slice(0, 4) : '';
      if (pideClave && claveEnviada.length !== 4) { setError('Escribí los últimos 4 números de tu celular.'); return; }
      const params = { p_tipo: tipoUsuario, p_dni: limpio };
      if (claveEnviada) params.p_clave = claveEnviada;
      const { data, error: errRpc } = await rpcPortal('portal_consultar', params);
      if (errRpc) throw errRpc;
      if (!data || !data.encontrado) {
        if (data?.motivo !== 'vip_desactivado') registrarPortal('NO_ENCONTRADO', `Buscó un DNI que no está en ${tipoUsuario.toUpperCase()}`, limpio);
        setError(data?.motivo === 'vip_desactivado'
          ? 'El acceso de invitados VIP por este portal no está habilitado.'
          : `No se encontró ningún registro con ese DNI en ${tipoUsuario.toUpperCase()}.`);
        return;
      }
      if (data.persona?.activo === false) {
        registrarPortal('ERROR', 'Intentó entrar pero figura como "No asiste"', limpio);
        setError('Figurás como que no asistirás al acto. Si cambiaste de opinión, comunicate con la escuela.');
        return;
      }
      if (data.requiere_clave) {
        setPideClave({ nombre: data.persona?.nombre_completo || '' });
        if (data.clave !== 'falta') {
          setError(textoClavePortal(data.clave, whatsappActivo));
          registrarPortal('ERROR', data.clave === 'bloqueado' ? 'Acceso bloqueado 15 min por intentos fallidos con el celular' : 'Escribió mal los 4 números del celular', limpio);
        }
        return;
      }
      claveRef.current = claveEnviada;
      setPideClave(null); setClave('');
      if (tipoUsuario === 'egresado') { aplicarDatosEgresado(data); setUltimoCambio(data.ultimo_cambio || null); }
      else setDatosPersona(data.persona);
      const nInv = Array.isArray(data.invitados) ? data.invitados.length : 0;
      registrarPortal('INGRESO', tipoUsuario === 'egresado' ? `Entró al portal (tiene ${nInv} invitado/s cargado/s)` : 'Entró al portal', limpio);
    } catch (err) {
      registrarPortal('ERROR', `Buscar DNI: ${mensajeErrorRPC(err)}`, limpio);
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
      errorPortal('Guardar invitados', 'La carga de invitados está cerrada. Si necesitás un cambio, comunicate con la escuela.');
      return;
    }
    const todos = { cel: true }; filasInvitados.forEach((_, k) => { todos['n' + k] = true; todos['d' + k] = true; }); setTocados(todos);
    const irAlError = () => setTimeout(() => { const el = document.querySelector('[data-error-portal="1"]'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus?.(); } }, 50);
    const errCel = validarCelularPortal(celular, celularObligatorio);
    if (errCel) {
      if (!editando) setEditando(true);
      errorPortal('Guardar invitados', errCel);
      irAlError();
      return;
    }

    // Validación previa (la base vuelve a controlar todo): nombre Y DNI juntos, sin DNI repetidos
    const dnisVistos = new Set();
    for (let i = 0; i < filasInvitados.length; i++) {
      const nombre = (filasInvitados[i].nombre_completo || '').trim();
      const dniFila = sanitizeDNI(filasInvitados[i].dni || '');
      if ((nombre && !dniFila) || (!nombre && dniFila)) {
        errorPortal('Guardar invitados', `Invitado #${i + 1}: completá el nombre y el DNI (o dejá los dos vacíos).`);
        irAlError();
        return;
      }
      const errNom = validarNombreInvitado(nombre);
      if (errNom) {
        errorPortal('Guardar invitados', `Invitado #${i + 1}: ${errNom.charAt(0).toLowerCase() + errNom.slice(1)}`);
        irAlError();
        return;
      }
      const errDni = validarDniInvitado(dniFila, datosPersona?.dni || dni);
      if (errDni) {
        errorPortal('Guardar invitados', `Invitado #${i + 1}: ${errDni.charAt(0).toLowerCase() + errDni.slice(1)}`);
        irAlError();
        return;
      }
      if (dniFila) {
        if (dnisVistos.has(dniFila)) {
          errorPortal('Guardar invitados', `Invitado #${i + 1}: el DNI ${dniFila} está repetido en el formulario.`);
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
      const { data, error: errRpc } = await rpcPortal('portal_guardar_invitados', { p_dni: sanitizeDNI(datosPersona.dni || dni), p_celular: celular, p_invitados: payload, ...(claveRef.current ? { p_clave: claveRef.current } : {}) });
      if (errRpc) throw errRpc;
      if (data?.error_clave) throw new Error(textoClavePortal(data.error_clave, whatsappActivo) + ' Volvé a entrar con tu DNI.');
      if (celular) claveRef.current = String(celular).replace(/\D/g, '').slice(-4);
      const antes = new Map(misInvitadosGuardados.map((i) => [i.id, i]));
      const despues = Array.isArray(data?.invitados) ? data.invitados : [];
      const etiqueta = (i) => `${i.nombre_completo} (${i.dni})${i.es_grupal ? ' grupo' : ''}${i.movilidad_reducida ? ' ♿' : ''}`;
      const agregados = despues.filter((i) => !antes.has(i.id)).map(etiqueta);
      const quitados = misInvitadosGuardados.filter((i) => !despues.some((x) => x.id === i.id)).map(etiqueta);
      aplicarDatosEgresado(data);
      setEditando(false);
      notify('Invitados y datos guardados correctamente.');
      registrarPortal('GUARDAR_INVITADOS', `Quedan ${despues.length} invitado/s: ${despues.map(etiqueta).join('; ') || 'ninguno'}`
        + (agregados.length ? ` | Agregó: ${agregados.join('; ')}` : '') + (quitados.length ? ` | Quitó: ${quitados.join('; ')}` : ''));
    } catch (err) {
      console.error(err);
      errorPortal('Guardar invitados', `No se pudieron guardar los invitados. ${mensajeErrorRPC(err)}`);
    } finally {
      setGuardando(false);
    }
  };

  // Paso 1: al apretar "Solicitar" se muestra el aviso (las plazas no están garantizadas)
  const pedirSolicitudExtra = (e) => {
    e.preventDefault();
    if ((config.estado_etapa || 'abierta') !== 'abierta') {
      errorPortal('Solicitud extra', 'El plazo para pedir butacas extra terminó: la carga cerró.');
      return;
    }
    if (misSolicitudes.length > 0) {
      errorPortal('Solicitud extra', 'Ya enviaste una solicitud de butacas extra. Solo se puede pedir una vez.');
      return;
    }
    const cel = (celular || datosPersona?.celular || '').trim();
    if (validarCelularPortal(cel, true)) {
      errorPortal('Solicitud extra', 'Antes de pedir butacas extra, cargá tu celular (10 números, ej: 2994444444) y guardá los datos: por ahí te avisamos si se aprueba.');
      return;
    }
    if (obsExtra.trim().length < 10) {
      tocar('obs');
      errorPortal('Solicitud extra', 'Contanos el motivo del pedido y para quién son las butacas (por ejemplo: "abuela y tía que viajan desde Neuquén").');
      return;
    }
    setAvisoSolicitud(true);
  };

  // Paso 2: confirmado el aviso, se envía (la base controla que sea una sola por egresado)
  const enviarSolicitudExtra = async () => {
    setAvisoSolicitud(false);
    setEnviandoSol(true);
    try {
      const { data, error: errRpc } = await rpcPortal('portal_solicitar_extra', {
        p_dni: sanitizeDNI(datosPersona.dni || dni),
        p_cantidad: Number(cantExtra),
        p_observacion: obsExtra.trim(),
        p_celular: (celular || datosPersona.celular || '').trim(),
        ...(claveRef.current ? { p_clave: claveRef.current } : {}),
      });
      if (errRpc) throw errRpc;
      if (data?.error_clave) throw new Error(textoClavePortal(data.error_clave, whatsappActivo) + ' Volvé a entrar con tu DNI.');
      aplicarDatosEgresado(data);
      notify('Solicitud de butacas extra enviada.');
      registrarPortal('SOLICITUD_EXTRA', `Pidió ${Number(cantExtra)} butaca/s extra${obsExtra.trim() ? ` · "${obsExtra.trim().slice(0, 200)}"` : ''}`);
      setObsExtra('');
    } catch (err) {
      errorPortal('Solicitud extra', 'Error: ' + mensajeErrorRPC(err));
    } finally {
      setEnviandoSol(false);
    }
  };

  const marcarNoAsistire = async () => {
    const aviso = tipoUsuario === 'egresado'
      ? '¿Estás seguro de que no asistirás?\n\nSe liberará tu butaca y también las de tus invitados: tus pases y los de tu grupo dejarán de servir para ingresar.'
      : '¿Estás seguro de que no asistirás? Esto liberará tu plaza.';
    if (!window.confirm(aviso)) return;
    const { data: dNo, error: errRpc } = await rpcPortal('portal_no_asistire', { p_tipo: tipoUsuario, p_dni: sanitizeDNI(datosPersona.dni || dni), ...(claveRef.current ? { p_clave: claveRef.current } : {}) });
    if (errRpc) { errorPortal('No asistiré', 'No se pudo registrar: ' + mensajeErrorRPC(errRpc)); return; }
    if (dNo?.error_clave) { errorPortal('No asistiré', textoClavePortal(dNo.error_clave, whatsappActivo) + ' Volvé a entrar con tu DNI.'); return; }
    registrarPortal('NO_ASISTIRE', tipoUsuario === 'egresado' ? 'Se dio de baja (libera su butaca y las de sus invitados)' : 'Se dio de baja');
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
  if (tipoUsuario === 'egresado' && datosPersona?.id) marcarFamiliaMovilidad(datosPersona.id, misInvitadosGuardados.some(tieneMovilidad));
  const miGrupo = misInvitadosGuardados.filter(esGrupal);
  const hayGuardados = misInvitadosGuardados.length > 0;
  // Lugares vacíos (por ejemplo, butacas extra aprobadas): se completan directo, sin apretar "Editar".
  // "Editar" queda solo para cambiar a los invitados ya guardados.
  const filaAbierta = (fila) => editando || (cargaHabilitada && !fila.guardado);
  const lugaresNuevos = cargaHabilitada && !editando ? filasInvitados.filter((f) => !f.guardado).length : 0;
  const descargarMiPase = () => {
    if (!personaPase) return;
    if (tipoUsuario === 'egresado') paseEgresado(personaPase, config);
    else if (tipoUsuario === 'docente') paseDocente(personaPase, config);
    else paseVip(personaPase, config);
    registrarPortal('DESCARGA_QR', tipoUsuario === 'egresado' ? '[EGRESADO] Descargó su QR de egresado' : `[${tipoUsuario.toUpperCase()}] Descargó su pase`);
  };
  const descargarQrGrupo = () => {
    paseGrupo(datosPersona, miGrupo, config);
    registrarPortal('DESCARGA_QR', `[GRUPO] Descargó el QR del grupo familiar (${miGrupo.length}: ${miGrupo.map((i) => i.nombre_completo).join(', ')})`.slice(0, 900));
  };
  const descargarQrInvitado = (inv) => {
    paseInvitado(inv, datosPersona, config);
    registrarPortal('DESCARGA_QR', `[INVITADO] Descargó el QR individual de ${inv.nombre_completo} (DNI ${inv.dni || 'S/D'})`);
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      {verVideo && <ModalVideoTutorial cerrar={() => setVerVideo(false)} />}
      <div className="bg-gradient-to-r from-[#6B1D2F] to-[#8a253c] text-white rounded-xl shadow-md p-5 text-center">
        {escudoDe(config) && <img src={escudoDe(config)} alt="Escudo institucional" className="w-20 h-20 mx-auto mb-2 bg-white rounded-full object-contain p-1.5 shadow" />}
        <h2 className="text-xl font-bold mb-1">¡Bienvenidos al Acto de Colación 2026! 🎉</h2>
        <p className="text-xs text-rose-100 leading-relaxed">
          Seleccioná tu rol e ingresá tu DNI para consultar tu pase QR institucional.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6 border-t-4 border-[#6B1D2F]">
        <h3 className="text-lg font-bold text-[#6B1D2F] mb-1 text-center">Portal de Acceso por DNI</h3>
        <p className="text-xs text-gray-500 text-center mb-4">Seleccioná tu rol y consultá tu pase</p>

        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
          <button type="button" onClick={() => { setTipoUsuario('egresado'); setDatosPersona(null); setError(''); setPideClave(null); setClave(''); }} className={`flex-1 py-2 rounded-md font-medium text-xs transition ${tipoUsuario === 'egresado' ? 'bg-[#6B1D2F] text-white shadow' : 'text-gray-600'}`}>🎓 Egresado</button>
          <button type="button" onClick={() => { setTipoUsuario('docente'); setDatosPersona(null); setError(''); setPideClave(null); setClave(''); }} className={`flex-1 py-2 rounded-md font-medium text-xs transition ${tipoUsuario === 'docente' ? 'bg-[#6B1D2F] text-white shadow' : 'text-gray-600'}`}>📚 Docente</button>
          {vipPortalActivo && (
            <button type="button" onClick={() => { setTipoUsuario('vip'); setDatosPersona(null); setError(''); setPideClave(null); setClave(''); }} className={`flex-1 py-2 rounded-md font-medium text-xs transition ${tipoUsuario === 'vip' ? 'bg-amber-600 text-white shadow' : 'text-gray-600'}`}>⭐ VIP</button>
          )}
        </div>

        {!datosPersona ? (
          <form onSubmit={buscarPorDNI} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DNI de {tipoUsuario.toUpperCase()}</label>
              <input type="text" maxLength={8} value={dni} onChange={(e) => { setDni(sanitizeDNI(e.target.value)); setPideClave(null); setClave(''); }} placeholder="Ej: 40123456" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#6B1D2F]" required />
            </div>
            {pideClave && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 space-y-2">
                <p className="text-sm font-bold text-amber-900">🔒 {pideClave.nombre ? `Hola, ${pideClave.nombre.split(' ').slice(-1)[0]}. ` : ''}Por seguridad, escribí los <u>últimos 4 números</u> del celular que cargaste.</p>
                <input type="text" inputMode="numeric" autoFocus maxLength={4} value={clave} onChange={(e) => setClave(String(e.target.value || '').replace(/\D/g, '').slice(0, 4))} placeholder="Ej: 4521" className="w-full px-3 py-2 border-2 border-amber-400 rounded-lg text-center text-lg font-bold tracking-[0.4em]" aria-label="Últimos 4 números del celular" />
                <p className="text-[11px] text-amber-800">¿Cambiaste de celular o no te acordás? {whatsappActivo ? <>Pedí ayuda tocando el <b>botón verde de WhatsApp</b> (abajo a la derecha) y lo corrigen.</> : 'Comunicate con la escuela y lo corrigen.'}</p>
              </div>
            )}
            {error && <p role="alert" className="flex items-start gap-1.5 text-sm font-bold text-rose-700 bg-rose-50 border-2 border-rose-300 rounded-lg px-3 py-2"><span aria-hidden="true">⚠️</span><span>{error}</span></p>}
            <button type="submit" disabled={buscando} className="w-full py-2.5 bg-[#6B1D2F] text-white rounded-lg hover:bg-opacity-90 font-medium shadow disabled:opacity-60">
              {buscando ? 'Buscando...' : pideClave ? 'Entrar' : 'Continuar'}
            </button>
            {videoActivo && tipoUsuario === 'egresado' && (
              <button type="button" onClick={() => setVerVideo(true)} className="w-full py-2.5 bg-white border-2 border-[#6B1D2F] text-[#6B1D2F] rounded-lg font-bold text-sm cursor-pointer">▶ Ver video: cómo cargar a tus invitados</button>
            )}
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
              {tipoUsuario === 'egresado' && ultimoCambio && (
                <p className="text-[11px] text-slate-600 bg-white border rounded-lg px-2 py-1.5">📝 Tu lista de invitados se modificó por última vez el <b>{fechaHoraAR(ultimoCambio)}</b>. Si no fuiste vos, avisá a la escuela.</p>
              )}
              {tipoUsuario === 'egresado' && config.etapa_auto === true && (config.estado_etapa || 'abierta') === 'abierta' && config.fecha_cierre_parcial && new Date(config.fecha_cierre_parcial) > new Date() && (
                <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">⏰ Podés cargar y modificar tus invitados hasta el {fechaHoraAR(config.fecha_cierre_parcial)}.</p>
              )}
              <button type="button" onClick={descargarMiPase} className={`w-full py-2.5 hover:bg-opacity-90 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow cursor-pointer ${tipoUsuario === 'vip' ? 'bg-amber-700' : tipoUsuario === 'docente' ? 'bg-slate-700' : 'bg-[#6B1D2F]'}`}>
                <Download className="w-4 h-4" /> {tipoUsuario === 'egresado' ? 'Descargar QR de Egresado' : tipoUsuario === 'docente' ? 'Descargar QR de Docente' : 'Descargar QR VIP'}
              </button>
              <p className="text-[11px] font-bold text-slate-600">📍 {tipoUsuario === 'egresado' ? ACCESO_TEXTO.egresados : ACCESO_TEXTO.abajo}</p>
              {tipoUsuario === 'egresado' && (
                <p className="text-[11px] text-slate-500 text-center">Este QR es <b>solo para vos</b>. Tus invitados marcados <b>en grupo</b> entran juntos con el <b>QR del Grupo Familiar</b>, y los <b>individuales</b> con su propio QR.</p>
              )}
              {tipoUsuario === 'egresado' && (
                <button type="button" onClick={marcarNoAsistire} className="w-full py-2.5 bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  <XCircle className="w-4 h-4" /> No podré asistir: se liberan mi butaca y las de mis invitados
                </button>
              )}
            </div>


            <div className="hidden" ref={qrRef}>
              <QRCodeSVG value={valorQRPrincipal} size={300} level="H" includeMargin={true} />
            </div>

            {tipoUsuario === 'egresado' && (
              <>
                {videoActivo && (
                  <button type="button" onClick={() => { setVerVideo(true); registrarPortal('VIDEO', 'Abrió el video tutorial'); }} className="w-full py-2 bg-white border-2 border-[#6B1D2F] text-[#6B1D2F] rounded-lg font-bold text-xs cursor-pointer">▶ ¿Dudas? Mirá el video paso a paso</button>
                )}
                <div className="border-2 border-emerald-500 bg-emerald-50 p-4 rounded-xl space-y-2">
                  <label className="block text-xs font-bold text-emerald-900 uppercase">📱 Tu Celular{whatsappActivo ? ' / WhatsApp' : ''} <span className="text-rose-600">* Obligatorio</span></label>
                  {config.portal_verificar_celular === true && <p className="text-[11px] text-emerald-800">🔒 Guardá bien este número: la próxima vez que entres te vamos a pedir sus <b>últimos 4 números</b>.</p>}
                  <input 
                    type="text" 
                    maxLength={15}
                    placeholder="10 números, sin 0 ni 15. Ej: 2994444444" 
                    value={celular} 
                    onChange={(e) => setCelular(String(e.target.value || '').replace(/\D/g, '').slice(0, 15))} 
                    onBlur={() => tocar('cel')}
                    disabled={!editando}
                    required
                    data-error-portal={editando && tocados.cel && validarCelularPortal(celular, celularObligatorio) ? '1' : undefined}
                    className={`w-full px-3 py-2 border-2 rounded-lg text-sm font-semibold text-emerald-900 outline-none ${editando && tocados.cel && validarCelularPortal(celular, celularObligatorio) ? 'border-rose-600 ring-2 ring-rose-200' : 'border-emerald-500'} ${!editando ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white'}`} 
                  />
                  {editando && tocados.cel && validarCelularPortal(celular, celularObligatorio) && <AvisoCampo msg={validarCelularPortal(celular, celularObligatorio)} />}
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
                  {hayGuardados && lugaresNuevos > 0 && (
                    <p className="text-sm font-bold text-indigo-900 bg-indigo-50 border-2 border-indigo-300 rounded-lg px-3 py-2">🆕 Tenés {lugaresNuevos} lugar{lugaresNuevos === 1 ? '' : 'es'} libre{lugaresNuevos === 1 ? '' : 's'} para completar. Cargá nombre y DNI y tocá <b>"Guardar"</b> (abajo).</p>
                  )}
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
                              onClick={() => descargarQrInvitado(guardadoInv)} 
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
                        onBlur={() => tocar('n' + idx)}
                        disabled={!filaAbierta(fila)}
                        data-error-portal={filaAbierta(fila) && errNombreFila(fila, idx) ? '1' : undefined}
                        className={`w-full px-2.5 py-1.5 border rounded text-xs ${filaAbierta(fila) && errNombreFila(fila, idx) ? 'border-2 border-rose-600 ring-2 ring-rose-200' : ''} ${!filaAbierta(fila) ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white'}`} 
                      />
                      {filaAbierta(fila) && errNombreFila(fila, idx) && <AvisoCampo msg={errNombreFila(fila, idx)} />}

                      <input 
                        type="text" 
                        maxLength={8} 
                        placeholder="DNI (Solo números)" 
                        value={fila.dni} 
                        onChange={(e) => { const arr = [...filasInvitados]; arr[idx].dni = sanitizeDNI(e.target.value); setFilasInvitados(arr); }} 
                        onBlur={() => tocar('d' + idx)}
                        disabled={!filaAbierta(fila)}
                        data-error-portal={filaAbierta(fila) && errDniFila(fila, idx) ? '1' : undefined}
                        className={`w-full px-2.5 py-1.5 border rounded text-xs font-mono ${filaAbierta(fila) && errDniFila(fila, idx) ? 'border-2 border-rose-600 ring-2 ring-rose-200' : ''} ${!filaAbierta(fila) ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'bg-white'}`} 
                      />
                      {filaAbierta(fila) && errDniFila(fila, idx) && <AvisoCampo msg={errDniFila(fila, idx)} />}

                      <div className="flex items-center gap-2 pt-1">
                        <input 
                          type="checkbox" 
                          id={`grupal-${idx}`}
                          checked={fila.es_grupal}
                          disabled={!filaAbierta(fila)}
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
                          disabled={!filaAbierta(fila)}
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
                {(filasInvitados.some((f) => f.movilidad_reducida === true && String(f.nombre_completo || '').trim()) || familiaConMovilidad(datosPersona)) && (
                  <p className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-2">♿ Como en tu grupo hay una persona con movilidad reducida, <u>todos tus invitados</u> entran por el <b>acceso de abajo</b>, que es el más cómodo. Lo vas a ver en los pases.</p>
                )}

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
                  <div className="space-y-2">
                    {lugaresNuevos > 0 && (
                      <button onClick={guardarInvitados} disabled={guardando} className="w-full py-2.5 bg-[#6B1D2F] text-white rounded-lg text-sm font-bold hover:bg-opacity-95 shadow cursor-pointer">
                        {guardando ? 'Guardando...' : `💾 Guardar ${lugaresNuevos === 1 ? 'el invitado nuevo' : 'los invitados nuevos'} y generar QR`}
                      </button>
                    )}
                    {etapaCarga === 'abierta' ? (
                      <button type="button" onClick={() => setEditando(true)} className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold shadow cursor-pointer">
                        ✏️ Editar invitados ya guardados
                      </button>
                    ) : (
                      <p className="text-xs text-slate-600 bg-slate-100 border border-slate-300 rounded-lg px-3 py-2">🔒 La carga cerró: los invitados ya guardados no se pueden cambiar. Solo podés completar los lugares extra aprobados.</p>
                    )}
                  </div>
                ))}

                {tipoUsuario === 'egresado' && miGrupo.length > 0 && (
                  <div className="p-4 rounded-lg border-2 text-center space-y-2" style={{ borderColor: colorFamiliaDe(datosPersona) }}>
                    <p className="font-bold text-sm" style={{ color: colorFamiliaDe(datosPersona) }}>👨‍👩‍👧 Pase del Grupo Familiar ({miGrupo.length} persona{miGrupo.length === 1 ? '' : 's'})</p>
                    <ul className="text-xs text-slate-700 space-y-0.5">
                      {miGrupo.map((g) => <li key={g.id}>{g.nombre_completo}{tieneMovilidad(g) ? ' ♿' : ''}</li>)}
                    </ul>
                    <button type="button" onClick={descargarQrGrupo} className="w-full py-2.5 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow cursor-pointer" style={{ backgroundColor: colorFamiliaDe(datosPersona) }}>
                      <Download className="w-4 h-4" /> Descargar QR del Grupo Familiar
                    </button>
                    <p className="text-[11px] font-bold text-slate-600">📍 {accesoFamiliaDe(datosPersona)}</p>
                    <p className="text-[11px] text-slate-500">Un solo QR para todo el grupo: con escanearlo una vez ingresan todos los que figuran en la lista.</p>
                  </div>
                )}

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
                        {est === 'aprobada' && cargaHabilitada && <p>Ya podés cargar a tus invitados adicionales arriba, en los lugares libres, y tocar "Guardar".</p>}
                        {est !== 'aprobada' && <p className="opacity-80">Solo se puede enviar una solicitud por egresado.</p>}
                      </div>
                    );
                  })() : etapaCarga !== 'abierta' ? (
                    <p className="text-sm font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg px-3 py-2">🔒 El plazo para pedir butacas extra terminó: la carga cerró. Ya no se reciben solicitudes.</p>
                  ) : (
                    <>
                      <form onSubmit={pedirSolicitudExtra} className="flex flex-col sm:flex-row gap-2">
                        <select value={cantExtra} onChange={(e) => setCantExtra(e.target.value)} className="px-2 py-2 border rounded-xl text-xs bg-white">
                          <option value={1}>+1</option><option value={2}>+2</option><option value={3}>+3</option>
                        </select>
                        <input type="text" placeholder="Motivo y para quién (obligatorio, ej: abuela y tía)" value={obsExtra} onChange={(e) => setObsExtra(e.target.value)} onBlur={() => { if (obsExtra) tocar('obs'); }} className={`w-full sm:flex-1 px-3 py-2 border rounded-xl text-xs bg-white outline-none ${tocados.obs && obsExtra.trim().length < 10 ? 'border-2 border-rose-600 ring-2 ring-rose-200' : ''}`} />
                        <button type="submit" disabled={enviandoSol} className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow shrink-0 cursor-pointer">{enviandoSol ? 'Enviando...' : 'Solicitar'}</button>
                      </form>
                      {tocados.obs && obsExtra.trim().length < 10 && <AvisoCampo msg='Contanos el motivo y para quién son las butacas (por ejemplo: "abuela y tía que viajan desde Neuquén").' />}
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

            {tipoUsuario !== 'egresado' && <div className="pt-2 border-t">
              <button type="button" onClick={marcarNoAsistire} className="w-full py-2.5 bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer">
                <XCircle className="w-4 h-4" /> No podré asistir / Liberar cupo
              </button>
            </div>}

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
  movilidad: '#C2410C', // familias con alguien con movilidad reducida (v30): entran por abajo y se sientan con VIP
  familia: '#475569',  // familiares sin orientación cargada
  docente: '#374151',  // gris oscuro
  vip: '#A16207',      // dorado
};

// Por dónde entra cada uno (para cambiar un texto, se cambia solo acá)
const ACCESO_TEXTO = {
  egresados: 'INGRESO POR DETRÁS DE LA ÚLTIMA FILA',
  arriba: 'INGRESO POR EL ACCESO DE ARRIBA',
  abajo: 'INGRESO POR EL ACCESO DE ABAJO',
  abajoMovilidad: 'INGRESO POR EL ACCESO DE ABAJO (MOVILIDAD REDUCIDA)',
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
// Familias con al menos un invitado con movilidad reducida: TODO el grupo entra por el acceso de abajo
// y lo atiende el puesto de Docentes y VIP (v28). Se arma con los invitados que tiene cargados la pantalla.
const FAMILIAS_MOVILIDAD = new Set();
const actualizarFamiliasMovilidad = (invitados) => { FAMILIAS_MOVILIDAD.clear(); (invitados || []).forEach((i) => { if (i && i.movilidad_reducida === true && i.egresado_id) FAMILIAS_MOVILIDAD.add(i.egresado_id); }); };
const marcarFamiliaMovilidad = (egrId, tiene) => { if (!egrId) return; if (tiene) FAMILIAS_MOVILIDAD.add(egrId); else FAMILIAS_MOVILIDAD.delete(egrId); };
const familiaConMovilidad = (egr) => !!(egr && egr.id && FAMILIAS_MOVILIDAD.has(egr.id));
const accesoFamiliaDe = (egr) => (familiaConMovilidad(egr) ? ACCESO_TEXTO.abajoMovilidad : ({ cn: ACCESO_TEXTO.abajo, edu: ACCESO_TEXTO.arriba }[tipoOrientacion(egr)] || ACCESO_TEXTO.aConfirmar));
const colorFamiliaDe = (egr) => (familiaConMovilidad(egr) ? COLOR_PASE.movilidad : (COLOR_PASE[tipoOrientacion(egr)] || COLOR_PASE.familia));
const textoCurso = (egr) => [egr?.division, etiquetaOrientacion(egr)].filter(Boolean).join(' · ');
// Orden de los cursos: primero turno mañana (TM), después tarde (TT); dentro de cada turno, por sección
const claveCurso = (div) => {
  const d = String(div || '');
  if (!d) return '9';
  const t = /TT/i.test(d) ? 1 : /TM/i.test(d) ? 0 : 2;
  const n = parseInt((d.match(/(\d+)\s*ª/) || [])[1] || '9', 10);
  return `${t}-${String(n).padStart(2, '0')}-${d}`;
};
const SIN_CURSO = '__sin_curso__';

// ---------- Búsqueda tolerante a errores de carga (DNI y nombres parecidos) ----------
const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
const normNombre = (t) => sinTildes(String(t || '')).toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
const distancia = (a, b) => { // Levenshtein corto
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
};
// Compara un DNI buscado con uno cargado. Devuelve null si no se parecen, o {exacto, motivo, marcas:[posiciones distintas en el cargado]}
const compararDni = (buscado, cargado) => {
  const q = soloDigitos(buscado), d = soloDigitos(cargado);
  if (q.length < 4 || !d) return null;
  if (q === d) return { exacto: true, motivo: 'DNI exacto', marcas: [] };
  if (q.length === d.length) {
    const dif = []; for (let i = 0; i < d.length; i++) if (q.charAt(i) !== d.charAt(i)) dif.push(i);
    if (dif.length === 1) return { exacto: false, motivo: 'un número distinto', marcas: dif };
    if (dif.length === 2 && dif[1] === dif[0] + 1 && q.charAt(dif[0]) === d.charAt(dif[1]) && q.charAt(dif[1]) === d.charAt(dif[0])) return { exacto: false, motivo: 'dos números invertidos', marcas: dif };
  }
  if (Math.abs(q.length - d.length) === 1 && q.length >= 6) {
    const [lar, cor] = q.length > d.length ? [q, d] : [d, q];
    for (let i = 0; i < lar.length; i++) if (lar.slice(0, i) + lar.slice(i + 1) === cor) return { exacto: false, motivo: q.length > d.length ? 'tiene un número de menos' : 'tiene un número de más', marcas: q.length < d.length ? [i] : [] };
  }
  if (q.length >= 4 && d.includes(q)) { const i = d.indexOf(q); return { exacto: false, motivo: 'contiene lo buscado', marcas: Array.from({ length: q.length }, (_, k) => i + k) }; }
  return null;
};
// Compara un nombre buscado con uno cargado (sin importar orden, tildes ni mayúsculas)
const compararNombre = (buscado, cargado) => {
  const qs = normNombre(buscado).split(' ').filter((x) => x.length >= 2), ns = normNombre(cargado).split(' ').filter(Boolean);
  if (!qs.length || !ns.length) return null;
  if (qs.every((t) => ns.some((n) => n === t || (t.length >= 3 && n.startsWith(t))))) return { exacto: true, motivo: 'nombre', marcas: [] };
  const tol = (t) => (t.length <= 4 ? 1 : 2);
  const malos = []; let suma = 0;
  const ok = qs.every((t) => ns.some((n) => { const dd = distancia(t, n); if (dd > 0 && dd <= tol(t)) { malos.push(n); suma += dd; return true; } return dd === 0 || (t.length >= 4 && n.startsWith(t)); }));
  return ok && malos.length ? { exacto: false, motivo: `nombre parecido (${malos.join(', ')})`, marcas: [], d: suma } : null;
};
// Busca en todos los padrones. Devuelve {exactos:[], parecidos:[]} con {clase, item, motivo, marcas}
const buscarPersonas = (consulta, { egresados = [], invitados = [], docentes = [], especiales = [], personal = [] }) => {
  const q = String(consulta || '').trim();
  const exactos = [], parecidos = [];
  if (q.length < 2) return { exactos, parecidos };
  const dig = soloDigitos(q), esDni = dig.length >= 4 && dig.length >= q.replace(/[\s.]/g, '').length - 1;
  const grupos = [['egresado', egresados], ['invitado', invitados], ['docente', docentes], ['vip', especiales], ['personal', personal]];
  grupos.forEach(([clase, lista]) => lista.forEach((item) => {
    let r = null;
    if (esDni) {
      r = compararDni(dig, item.dni);
      if (!r && clase === 'invitado' && item.numero_entrada && String(item.numero_entrada).toUpperCase().includes(q.toUpperCase())) r = { exacto: true, motivo: 'número de entrada', marcas: [] };
    } else {
      r = compararNombre(q, item.nombre_completo || item.nombre);
      if (!r && clase === 'personal' && String(item.email || '').toLowerCase().includes(q.toLowerCase())) r = { exacto: true, motivo: 'email', marcas: [] };
      if (!r && clase === 'invitado' && item.numero_entrada && String(item.numero_entrada).toUpperCase().includes(q.toUpperCase())) r = { exacto: true, motivo: 'número de entrada', marcas: [] };
    }
    if (r) (r.exacto ? exactos : parecidos).push({ clase, item, motivo: r.motivo, marcas: r.marcas, d: r.d });
  }));
  parecidos.sort((a, b) => (a.d || 1) - (b.d || 1)); // primero los más parecidos
  return { exactos, parecidos: parecidos.slice(0, 30) };
};
const DniMarcado = ({ dni, marcas = [] }) => {
  const d = soloDigitos(dni);
  if (!d) return <span className="text-slate-400">sin DNI</span>;
  return <span className="font-mono">{d.split('').map((ch, i) => <span key={i} className={marcas.includes(i) ? 'bg-amber-300 text-slate-900 rounded px-px font-bold' : ''}>{ch}</span>)}</span>;
};
const CLASE_PERSONA = { egresado: { t: 'Egresado/a', c: COLOR_PASE.egresado, i: '🎓' }, invitado: { t: 'Invitado/a de egresado', c: COLOR_PASE.cn, i: '👨‍👩‍👧' }, docente: { t: 'Docente', c: COLOR_PASE.docente, i: '📚' }, vip: { t: 'VIP / autoridad', c: COLOR_PASE.vip, i: '⭐' }, personal: { t: 'Personal del sistema', c: '#334155', i: '👤' } };

// Lee un registro de Puerta (formato fijo desde la v23; los anteriores se interpretan por la acción)
const RE_LOG_PUERTA = /^\[([A-Z]+)\] \[([^\]]*)\] \[([^\]]*)\] \[(-?\d+) pers\] \[([^\]]*)\] (.*?)(?: \[([^\]]*)\])?$/;
const leerLogPuerta = (l) => {
  const m = RE_LOG_PUERTA.exec(String(l.detalle || ''));
  if (m) {
    const seg = /^(\d+) s$/.exec(m[5]);
    return { metodo: m[1], tipo: m[2] === '-' ? '' : m[2], curso: m[3] === '-' ? '' : m[3], personas: Number(m[4]) || 0, seg: seg ? Number(seg[1]) : null, texto: m[6], dispositivo: m[7] || '', nuevo: true };
  }
  const d = String(l.detalle || '');
  const manual = l.accion === 'INGRESO_MANUAL' || /^Manual:/.test(d);
  const personas = l.accion === 'INGRESO' || l.accion === 'INGRESO_MANUAL' ? 1 : l.accion === 'INGRESO_GRUPAL' ? (d.split(':').slice(-1)[0].split(',').filter((x) => x.trim() && !/ya hab/.test(x)).length) : 0;
  return { metodo: manual ? 'MANUAL' : 'CAMARA', tipo: (/^(egresado|familiar|docente|VIP)/.exec(d) || [])[1] || (/grupo/.test(d) ? 'grupo' : ''), curso: '', personas, seg: null, texto: d, dispositivo: (/\[([^\]]*)\]$/.exec(d) || [])[1] || '', nuevo: false };
};
const cursosDe = (egrs) => [...new Set((egrs || []).map((e) => e.division || ''))].sort((a, b) => claveCurso(a).localeCompare(claveCurso(b)));
const coincideCurso = (egr, filtro) => !filtro || (filtro === SIN_CURSO ? !egr?.division : (egr?.division || '') === filtro);
// Selector de curso reutilizable (Egresados, Invitados)
const SelectorCurso = ({ egresados, valor, onChange }) => (
  <label className={`inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-xl border-2 text-sm font-bold ${valor ? 'bg-[#6B1D2F] border-[#6B1D2F] text-white' : 'bg-rose-50 border-[#6B1D2F]/50 text-[#6B1D2F]'}`}>
  🎓 Curso:
  <select value={valor} onChange={(e) => onChange(e.target.value)} className={`px-2 py-1.5 rounded-lg text-sm font-bold outline-none cursor-pointer ${valor ? 'bg-white text-[#6B1D2F]' : 'bg-white text-slate-700 border border-[#6B1D2F]/30'}`} aria-label="Filtrar por curso">
    <option value="">Todos los cursos</option>
    {cursosDe(egresados).filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}
    {(egresados || []).some((e) => !e.division) && <option value={SIN_CURSO}>Sin curso</option>}
  </select>
  </label>
);
const esGrupal = (inv) => inv?.es_grupal === true;
const tieneMovilidad = (p) => p?.movilidad_reducida === true;
// Escudo que se usa en pantalla y en los pases: ninguno si está apagado el interruptor "Escudo"
const escudoDe = (config) => (config?.escudo && config?.escudo_activo !== false ? config.escudo : null);

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
  escudo: escudoDe(config), archivo: `Egresado-${egr.nombre_completo}`,
});
const paseGrupo = (egr, integrantes, config) => descargarPase({
  nombre: egr.nombre_completo,
  subtitulo: [`Grupo familiar · ${integrantes.length} persona(s)`, textoCurso(egr)].filter(Boolean).join(' · '),
  rol: 'GRUPO FAMILIAR', valor: valorQRGrupo(egr), color: colorFamiliaDe(egr),
  acceso: accesoFamiliaDe(egr), ubicacion: ubicacionPara({ tipo: 'invitado', egr }, config),
  integrantes, escudo: escudoDe(config), archivo: `Grupo-Familiar-${egr.nombre_completo}`,
});
const paseInvitado = (inv, egr, config) => descargarPase({
  nombre: inv.nombre_completo,
  subtitulo: [`Invitado/a de ${egr?.nombre_completo || 'egresado/a'}`, textoCurso(egr)].filter(Boolean).join(' · '),
  rol: 'INVITADO INDIVIDUAL', valor: inv.numero_entrada, color: colorFamiliaDe(egr),
  acceso: accesoFamiliaDe(egr), ubicacion: ubicacionPara({ tipo: 'invitado', egr, movilidad: tieneMovilidad(inv) }, config),
  movilidad: tieneMovilidad(inv), escudo: escudoDe(config), archivo: `Invitado-${inv.nombre_completo}`,
});
const paseDocente = (doc, config) => descargarPase({
  nombre: doc.nombre_completo, subtitulo: `DNI: ${doc.dni}`,
  rol: 'DOCENTE', valor: valorQRDocente(doc), color: COLOR_PASE.docente,
  acceso: ACCESO_TEXTO.abajo, ubicacion: doc.ocupa_butaca === false ? '' : ubicacionPara({ tipo: 'docente' }, config),
  escudo: escudoDe(config), archivo: `Docente-${doc.nombre_completo}`,
});
const paseVip = (vip, config) => descargarPase({
  nombre: vip.nombre_completo, subtitulo: vip.dni ? `DNI: ${vip.dni}` : 'Autoridad / Invitado especial',
  rol: 'INVITADO VIP', valor: valorQRVip(vip), color: COLOR_PASE.vip,
  acceso: ACCESO_TEXTO.abajo, ubicacion: ubicacionPara({ tipo: 'vip', movilidad: tieneMovilidad(vip) }, config),
  movilidad: tieneMovilidad(vip), escudo: escudoDe(config), archivo: `VIP-${vip.nombre_completo}`,
});

// ============================================================================
// SALA: croquis del Teatro CCC, capacidad y sectores asignables por grupo
// ============================================================================
// Butacas numeradas de mayor (izquierda) a 1 (derecha), mirando al escenario.
// Cada fila tiene tramos [desde, hasta] de butacas que existen.
const FILAS_TEATRO = [
  { fila: 'F1', bloque: 'delantero', tramos: [[1, 25]], cortesia: true }, // 25 butacas (Mauro, 20/11)
  ...['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'].map((f) => ({ fila: f, bloque: 'delantero', tramos: [[1, 25]] })),
  { fila: 'F10', bloque: 'delantero', tramos: [[16, 25], [1, 10]] }, // área técnica: 11 a 15
  { fila: 'F11', bloque: 'delantero', tramos: [[17, 25], [1, 9]] },  // área técnica: 10 a 16
  ...Array.from({ length: 10 }, (_, k) => ({ fila: `F${12 + k}`, bloque: 'trasero', tramos: [[22, 26], [6, 21], [1, 5]] })),
];
const numeroFila = (f) => Number(String(f || '').replace(/\D/g, '')) || 0;
const existeButaca = (filaObj, n) => filaObj.tramos.some(([a, b]) => n >= a && n <= b);
const butacasDeFila = (filaObj) => filaObj.tramos.reduce((acc, [a, b]) => acc + (b - a + 1), 0);
const BUTACAS_CROQUIS = FILAS_TEATRO.reduce((acc, f) => acc + butacasDeFila(f), 0); // 523
const BUTACAS_CORTESIA = butacasDeFila(FILAS_TEATRO[0]); // 25

const GRUPOS_SALA = [
  { valor: 'egresados', etiqueta: 'Egresados', color: COLOR_PASE.egresado },
  { valor: 'familias_cn', etiqueta: 'Familias de Cs. Naturales (TM)', color: COLOR_PASE.cn },
  { valor: 'familias_edu', etiqueta: 'Familias de Educación (TT)', color: COLOR_PASE.edu },
  { valor: 'familias', etiqueta: 'Familias (cualquier orientación)', color: '#0F766E' },
  { valor: 'docentes', etiqueta: 'Docentes', color: COLOR_PASE.docente },
  { valor: 'vip', etiqueta: 'VIP / Autoridades', color: COLOR_PASE.vip },
  { valor: 'vip_movilidad', etiqueta: 'VIP, autoridades y movilidad reducida', color: '#B45309' },
  { valor: 'movilidad', etiqueta: 'Movilidad reducida (sola)', color: '#D97706' },
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
  else if (tipo === 'vip') grupos = ['vip', 'vip_movilidad'];
  else grupos = [{ cn: 'familias_cn', edu: 'familias_edu' }[tipoOrientacion(egr)], 'familias'].filter(Boolean);
  if (movilidad && de('movilidad').length) return `${textoSectores(de('movilidad'))} (movilidad reducida)`;
  if (movilidad && de('vip_movilidad').length) return `${textoSectores(de('vip_movilidad'))} (movilidad reducida)`;
  // Toda la familia de alguien con movilidad reducida se sienta junta en ese sector
  if (tipo === 'invitado' && familiaConMovilidad(egr)) {
    if (de('vip_movilidad').length) return `${textoSectores(de('vip_movilidad'))} (grupo con movilidad reducida)`;
    if (de('movilidad').length) return `${textoSectores(de('movilidad'))} (grupo con movilidad reducida)`;
  }
  for (const g of grupos) if (de(g).length) return textoSectores(de(g));
  return '';
};

// Hora real de ingreso (columna hora_ingreso_real). Si la columna todavía no existe, la Puerta no se frena.
const TABLAS_HORA_REAL = ['egresados', 'docentes', 'invitados_especiales'];
const tablasSinHoraReal = new Set();
const esErrorColumna = (err, columna) => new RegExp(columna, 'i').test(err?.message || '') || err?.code === 'PGRST204' || err?.code === '42703';

// Sonido y vibración de la Puerta. El navegador genera los tonos (no hay archivos de audio).
// Los celulares habilitan el sonido recién después del primer toque en la pantalla.
let audioCtxPuerta = null;
const prepararAudioPuerta = () => {
  try {
    if (!audioCtxPuerta) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtxPuerta = new AC(); }
    if (audioCtxPuerta && audioCtxPuerta.state === 'suspended') audioCtxPuerta.resume();
  } catch (_) { /* sin audio */ }
};
const tonosPuerta = {
  // [frecuencia Hz, duración s, pausa antes s]
  alarma: [[988, 0.18, 0], [740, 0.18, 0.06], [988, 0.18, 0.06], [740, 0.22, 0.06]],
  success: [[1320, 0.13, 0]],
  movilidad: [[1320, 0.12, 0], [1760, 0.14, 0.05]],
  warning: [[880, 0.11, 0], [880, 0.11, 0.08]],
  error: [[260, 0.5, 0]],
};
const vibracionPuerta = { success: [80], movilidad: [80, 60, 80], warning: [90, 70, 90], error: [400] };
const sonarPuerta = (tipo) => {
  try { if (navigator.vibrate) navigator.vibrate(vibracionPuerta[tipo] || [80]); } catch (_) { /* nada */ }
  try {
    prepararAudioPuerta();
    const ctx = audioCtxPuerta;
    if (!ctx) return;
    let t = ctx.currentTime + 0.01;
    (tonosPuerta[tipo] || tonosPuerta.success).forEach(([f, d, pausa]) => {
      t += pausa;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = tipo === 'error' ? 'sawtooth' : 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d + 0.02);
      t += d;
    });
  } catch (_) { /* sin audio */ }
};

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
const localizarCodigo = (code, esQrEgresado, datos, preferido = '', solo = false) => {
  const { egresados: egrs, invitados: invs, docentes: docs, especiales: vips } = datos;
  const egr = () => egrs.find((e) => e.dni && String(e.dni) === code);
  if (esQrEgresado) { const e = egr(); if (e) return { tipo: 'egresado', fila: e }; }
  // Si el QR dice de qué tipo es (VIP o DOCENTE), se busca primero ahí: así una persona con el mismo DNI en dos padrones no se confunde
  if (preferido === 'vip') {
    const nom = sinTildes(code).toUpperCase();
    const v = vips.find((x) => x.dni && String(x.dni) === code) || vips.find((x) => !x.dni && sinTildes(x.nombre_completo).toUpperCase() === nom);
    if (v) return { tipo: 'vip', fila: v };
  }
  if (preferido === 'docente') { const d = docs.find((x) => x.dni && String(x.dni) === code); if (d) return { tipo: 'docente', fila: d }; }
  if (solo) return null;
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
const buscarCodigoEnBase = async (code, esQrEgresado, preferido = '', solo = false) => {
  // VIP sin DNI (el código es el nombre): se compara contra los VIP de la base
  if (preferido === 'vip' && !/^\d{7,8}$/.test(code)) {
    const { data, error } = await supabase.from('invitados_especiales').select('*');
    if (error) throw error;
    const nom = sinTildes(code).toUpperCase();
    const v = (data || []).find((x) => sinTildes(x.nombre_completo || '').toUpperCase() === nom);
    return v ? { tipo: 'vip', fila: v } : null;
  }
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) return null;
  const uno = async (tabla, col) => {
    const { data, error } = await supabase.from(tabla).select('*').eq(col, code).limit(1);
    if (error) throw error;
    return data && data[0] ? data[0] : null;
  };
  if (esQrEgresado) { const e = await uno('egresados', 'dni'); if (e) return { tipo: 'egresado', fila: e }; }
  if (preferido === 'vip') { const v = await uno('invitados_especiales', 'dni'); if (v) return { tipo: 'vip', fila: v }; }
  if (preferido === 'docente') { const d = await uno('docentes', 'dni'); if (d) return { tipo: 'docente', fila: d }; }
  if (solo) return null;
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

// ---------- Pedidos de ayuda: un puesto de Puerta avisa a coordinación ----------
const MOTIVOS_AYUDA = [
  ['cola', '👥', 'Se está juntando mucha gente'],
  ['equipo', '📵', 'La cámara o el celular no anda'],
  ['no_figura', '❓', 'Alguien no figura o no tiene QR'],
  ['persona', '⚠️', 'Problema con una persona (No asiste, discute, pase copiado)'],
  ['movilidad', '♿', 'Necesito acompañante para movilidad reducida'],
  ['otro', '✏️', 'Otro'],
];
const TEXTO_MOTIVO = { ...Object.fromEntries(MOTIVOS_AYUDA.map(([k, i, t]) => [k, `${i} ${t}`])), auto_errores: '🤖 Automático: varios "No encontrado" o errores seguidos', auto_manual: '🤖 Automático: buscan a mano y no lo encuentran' };
// "Martín 299 555-1234, Laura 2994443322" -> [{nombre, numero, tel}]
const telefonosCoordinacion = (texto) => String(texto || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
  const numero = (x.match(/[+\d][\d\s-]{5,}/) || [''])[0].trim(); const nombre = x.replace(numero, '').replace(/[:\-–]+$/, '').trim();
  return { nombre, numero, tel: numero.replace(/[^\d+]/g, '') };
}).filter((t) => t.tel.length >= 6);
const BotonesLlamar = ({ texto, className = '' }) => telefonosCoordinacion(texto).map((t) => (
  <a key={t.tel} href={`tel:${t.tel}`} className={className}>📞 Llamar{t.nombre ? ` a ${t.nombre}` : ' a coordinación'} · {t.numero}</a>
));
const haceCuanto = (v) => { const m = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000)); return m < 1 ? 'recién' : m === 1 ? 'hace 1 min' : `hace ${m} min`; };
const minutosEntre = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : '');
const nombreStaff = (p) => p?.nombre || p?.email || 'Sin nombre';
const esErrorRed = (err) => !navigator.onLine || /fetch|network|Failed to fetch|Load failed/i.test(String(err?.message || err || ''));
const faltaTablaAlertas = (err) => /alertas_puerta/i.test(err?.message || '') || err?.code === '42P01' || err?.code === 'PGRST205';

async function enviarAlertaPuerta({ puesto, dispositivo, curso, motivo, detalle, automatica = false }) {
  const { data, error } = await supabase.from('alertas_puerta').insert({ puesto, dispositivo, curso: curso || null, motivo, detalle: detalle || null, automatica }).select().single();
  if (error) throw error;
  supabase.from('logs_sistema').insert({ usuario: puesto, modulo: 'Ayuda', accion: automatica ? 'AYUDA_AUTOMATICA' : 'PEDIDO_AYUDA', detalle: `${TEXTO_MOTIVO[motivo] || motivo}${detalle ? ' · ' + detalle : ''}${curso ? ` [${curso}]` : ''} [${dispositivo}]` }).then(() => {});
  return data;
}

// Botón y estado del pedido en el celular de la Puerta
function AyudaPuerta({ perfilStaff, dispositivo, config, notify, ultimoCursoRef, registrarApi }) {
  const puesto = nombreStaff(perfilStaff);
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [alerta, setAlerta] = useState(null);
  const [sinRed, setSinRed] = useState(false);
  const alertaRef = useRef(null);
  const tel = telefonosCoordinacion(config?.telefono_coordinacion).length > 0;

  const consultar = async () => {
    try {
      const { data, error } = await supabase.from('alertas_puerta').select('*').eq('puesto', puesto).neq('estado', 'resuelta').order('created_at', { ascending: false }).limit(1);
      if (error) return;
      const nueva = (data && data[0]) || null;
      const previa = alertaRef.current;
      if (previa && !nueva) {
        const { data: d2 } = await supabase.from('alertas_puerta').select('*').eq('id', previa.id).limit(1);
        const r = d2 && d2[0];
        if (r && r.estado === 'resuelta' && r.resuelta_por !== puesto) { notify(`✓ Coordinación marcó tu pedido como resuelto${r.resuelta_por ? ' (' + r.resuelta_por + ')' : ''}.`); sonarPuerta('success'); }
      }
      if (previa && nueva && previa.estado === 'abierta' && nueva.estado === 'en_camino') { notify(`🏃 ${nueva.atiende || 'Un coordinador'} va en camino.`); sonarPuerta('movilidad'); }
      alertaRef.current = nueva; setAlerta(nueva);
    } catch (_) { /* sin red: se reintenta */ }
  };
  useEffect(() => { consultar(); const t = setInterval(consultar, 5000); return () => clearInterval(t); }, [puesto]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (m, d, automatica = false) => {
    if (alertaRef.current) { if (!automatica) notify('Ya tenés un pedido abierto. Usá "Insistir" si tardan.', 'warning'); return; }
    if (!navigator.onLine) { setSinRed(true); return; }
    setEnviando(true);
    try {
      const a = await enviarAlertaPuerta({ puesto, dispositivo, curso: perfilStaff?.puesto_grupo || ultimoCursoRef?.current || '', motivo: m, detalle: d, automatica });
      alertaRef.current = a; setAlerta(a); setAbierto(false); setMotivo(''); setDetalle('');
      notify(automatica ? (m === 'auto_manual' ? '🤖 Se avisó a coordinación: buscaron a mano y no lo encontraron.' : '🤖 Se avisó a coordinación: hubo varios "No encontrado" seguidos.') : '🆘 Pedido enviado a coordinación.', automatica ? 'warning' : 'success');
    } catch (err) {
      if (esErrorRed(err)) setSinRed(true);
      else notify(faltaTablaAlertas(err) ? 'Falta correr el SQL de la v24 (tabla alertas_puerta).' : 'No se pudo enviar el pedido: ' + (err.message || err), 'error');
    } finally { setEnviando(false); }
  };
  useEffect(() => { if (registrarApi) registrarApi.current = { automatica: (m = 'auto_errores', d = '') => enviar(m, d, true), pedir: (m, d) => enviar(m, d, false) }; });

  const insistir = async () => {
    const a = alertaRef.current; if (!a) return;
    if (a.ultima_insistencia && Date.now() - new Date(a.ultima_insistencia).getTime() < 30000) { notify('Ya insististe hace menos de 30 segundos.', 'warning'); return; }
    const { error } = await supabase.from('alertas_puerta').update({ insistencias: (a.insistencias || 0) + 1, ultima_insistencia: new Date().toISOString() }).eq('id', a.id);
    if (error) { if (esErrorRed(error)) setSinRed(true); else notify('No se pudo: ' + error.message, 'error'); return; }
    notify('🔔 Se volvió a avisar a coordinación.'); consultar();
  };
  const yaSeSoluciono = async () => {
    const a = alertaRef.current; if (!a) return;
    const { error } = await supabase.from('alertas_puerta').update({ estado: 'resuelta', resuelta_at: new Date().toISOString(), resuelta_por: puesto }).eq('id', a.id);
    if (error) { notify('No se pudo: ' + error.message, 'error'); return; }
    alertaRef.current = null; setAlerta(null); notify('Pedido cerrado.');
  };

  return (
    <>
      {alerta ? (
        <div className={`rounded-2xl p-4 border-2 text-left space-y-2 ${alerta.estado === 'en_camino' ? 'bg-emerald-50 border-emerald-400' : 'bg-rose-50 border-rose-400'}`}>
          <p className="font-extrabold text-base">{alerta.estado === 'en_camino' ? `🏃 ${alerta.atiende || 'Un coordinador'} va en camino` : '🆘 Pedido de ayuda enviado · esperando a coordinación'}</p>
          <p className="text-xs text-slate-600">{TEXTO_MOTIVO[alerta.motivo] || alerta.motivo}{alerta.detalle ? ` · ${alerta.detalle}` : ''} · {haceCuanto(alerta.created_at)}{alerta.insistencias ? ` · insististe ${alerta.insistencias} vez/veces` : ''}</p>
          <div className="flex flex-wrap gap-2">
            {alerta.estado === 'abierta' && <button type="button" onClick={insistir} className="px-3 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold cursor-pointer">🔔 Insistir</button>}
            <button type="button" onClick={yaSeSoluciono} className="px-3 py-2 bg-white border rounded-xl text-xs font-bold cursor-pointer">✓ Ya se solucionó</button>
            {tel && <BotonesLlamar texto={config?.telefono_coordinacion} className="px-3 py-2 bg-white border rounded-xl text-xs font-bold" />}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setAbierto(true); prepararAudioPuerta(); }} className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-base shadow cursor-pointer">🆘 Pedir ayuda a coordinación</button>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3" onClick={() => !enviando && setAbierto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-4 space-y-3 text-left" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-lg">🆘 ¿Qué pasa en tu puesto?</h3>
            <p className="text-xs text-slate-500">Tocá el motivo. Le llega a coordinación con tu puesto ({puesto}{perfilStaff?.puesto_grupo ? ` · ${perfilStaff.puesto_grupo}` : ''}){!perfilStaff?.puesto_grupo && ultimoCursoRef?.current ? ` y el último curso atendido (${ultimoCursoRef.current})` : ''}.</p>
            <input type="text" maxLength={120} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder={motivo === 'otro' ? 'Contá en pocas palabras qué pasa' : 'Detalle opcional (escribilo antes de tocar el motivo)'} className="w-full px-3 py-2.5 rounded-xl border text-sm" />
            <div className="grid gap-2">
              {MOTIVOS_AYUDA.map(([k, i, t]) => (
                <button key={k} type="button" disabled={enviando} onClick={() => (k === 'otro' ? setMotivo(k) : enviar(k, detalle))} className={`w-full text-left px-3 py-3 rounded-xl border-2 text-sm font-bold cursor-pointer ${motivo === k ? 'border-rose-500 bg-rose-50' : 'border-slate-200 hover:bg-slate-50'}`}>{i} {t}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className="flex-1 py-2.5 bg-slate-100 rounded-xl text-sm font-bold cursor-pointer">Cancelar</button>
              {motivo === 'otro' && <button type="button" disabled={enviando || !detalle.trim()} onClick={() => enviar('otro', detalle.trim())} className="flex-1 py-2.5 bg-rose-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold cursor-pointer">Enviar</button>}
            </div>
          </div>
        </div>
      )}

      {sinRed && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={() => setSinRed(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-3xl">📵</p>
            <h3 className="font-extrabold text-lg">Sin internet: no se pudo avisar</h3>
            {tel ? (
              <div className="space-y-2"><BotonesLlamar texto={config?.telefono_coordinacion} className="block w-full py-3 bg-emerald-600 text-white rounded-xl font-extrabold" /></div>
            ) : <p className="text-sm text-slate-600">Buscá a un coordinador o mandale un mensaje.</p>}
            <button type="button" onClick={() => setSinRed(false)} className="w-full py-2 bg-slate-100 rounded-xl text-sm font-bold cursor-pointer">Cerrar</button>
          </div>
        </div>
      )}
    </>
  );
}

// Avisos que ven coordinación y administración en cualquier pantalla
function AvisosCoordinacion({ perfilStaff, notify }) {
  const yo = nombreStaff(perfilStaff);
  const [alertas, setAlertas] = useState([]);
  const [sonidoListo, setSonidoListo] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [minimizado, setMinimizado] = useState(false);
  const vistasRef = useRef({}); // id -> insistencias ya escuchadas
  const ultimaAlarmaRef = useRef(0);
  const sinTablaRef = useRef(false);

  useEffect(() => {
    const habilitar = () => { prepararAudioPuerta(); setSonidoListo(true); };
    window.addEventListener('pointerdown', habilitar, { once: true });
    window.addEventListener('keydown', habilitar, { once: true });
    return () => { window.removeEventListener('pointerdown', habilitar); window.removeEventListener('keydown', habilitar); };
  }, []);

  const consultar = async () => {
    if (sinTablaRef.current) return;
    try {
      const { data, error } = await supabase.from('alertas_puerta').select('*').neq('estado', 'resuelta').order('created_at', { ascending: true }).limit(50);
      if (error) { if (faltaTablaAlertas(error)) sinTablaRef.current = true; return; }
      const lista = data || [];
      let hayNovedad = false;
      lista.forEach((a) => { const antes = vistasRef.current[a.id]; if (antes === undefined || (a.insistencias || 0) > antes) hayNovedad = true; vistasRef.current[a.id] = a.insistencias || 0; });
      const sinAtender = lista.some((a) => a.estado === 'abierta');
      const ahora = Date.now();
      if (hayNovedad || (sinAtender && ahora - ultimaAlarmaRef.current > 30000)) {
        if (sinAtender || hayNovedad) { sonarPuerta('alarma'); ultimaAlarmaRef.current = ahora; if (hayNovedad) setMinimizado(false); }
      }
      setAlertas(lista);
    } catch (_) { /* sin red */ }
  };
  useEffect(() => { consultar(); const t = setInterval(consultar, 5000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tomar = async (a) => {
    const { data, error } = await supabase.from('alertas_puerta').update({ estado: 'en_camino', atiende: yo, atendida_at: new Date().toISOString() }).eq('id', a.id).eq('estado', 'abierta').select('id');
    if (error) { notify('No se pudo: ' + error.message, 'error'); return; }
    if (!data || !data.length) { notify('Ese pedido ya lo tomó otra persona.', 'warning'); consultar(); return; }
    supabase.from('logs_sistema').insert({ usuario: yo, modulo: 'Ayuda', accion: 'AYUDA_EN_CAMINO', detalle: `Va a ${a.puesto}: ${TEXTO_MOTIVO[a.motivo] || a.motivo}` }).then(() => {});
    notify(`Le avisamos a ${a.puesto} que vas en camino.`); consultar();
  };
  const resolver = async (a) => {
    const { error } = await supabase.from('alertas_puerta').update({ estado: 'resuelta', resuelta_at: new Date().toISOString(), resuelta_por: yo }).eq('id', a.id);
    if (error) { notify('No se pudo: ' + error.message, 'error'); return; }
    supabase.from('logs_sistema').insert({ usuario: yo, modulo: 'Ayuda', accion: 'AYUDA_RESUELTA', detalle: `${a.puesto}: ${TEXTO_MOTIVO[a.motivo] || a.motivo} (${minutosEntre(a.created_at, new Date())} min)` }).then(() => {});
    notify('Pedido resuelto.'); consultar();
  };
  const abrirHistorial = async () => {
    const { data, error } = await supabase.from('alertas_puerta').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) { notify(faltaTablaAlertas(error) ? 'Falta correr el SQL de la v24 (tabla alertas_puerta).' : 'No se pudo leer: ' + error.message, 'error'); return; }
    setHistorial(data || []); setVerHistorial(true);
  };

  const hora = (v) => (v ? new Date(v).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '');
  return (
    <>
      <div className="fixed bottom-20 right-3 z-[45] w-[min(420px,calc(100vw-1.5rem))] space-y-2">
        {alertas.length > 0 && (minimizado ? (
          <button type="button" onClick={() => setMinimizado(false)} className="ml-auto block px-4 py-2 rounded-full bg-rose-600 text-white text-sm font-extrabold shadow-xl cursor-pointer animate-pulse">🆘 {alertas.length} pedido(s) de ayuda</button>
        ) : (
          <div className="bg-white rounded-2xl shadow-2xl border-2 border-rose-500 p-3 space-y-2 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="font-extrabold text-rose-700">🆘 Pedidos de ayuda de la Puerta ({alertas.length})</p>
              <button type="button" onClick={() => setMinimizado(true)} className="text-xs font-bold text-slate-500 cursor-pointer">Minimizar</button>
            </div>
            {alertas.map((a) => (
              <div key={a.id} className={`rounded-xl p-2.5 border text-sm ${a.estado === 'abierta' ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <p className="font-extrabold">{a.puesto}{a.curso ? ` · ${a.curso}` : ''}</p>
                <p>{TEXTO_MOTIVO[a.motivo] || a.motivo}{a.detalle ? ` · “${a.detalle}”` : ''}</p>
                <p className="text-xs text-slate-500">{haceCuanto(a.created_at)} ({hora(a.created_at)}){a.insistencias ? ` · 🔔 insistió ${a.insistencias}` : ''}{a.estado === 'en_camino' ? ` · 🏃 va ${a.atiende}` : ' · sin atender'}</p>
                <div className="flex gap-2 mt-1.5">
                  {a.estado === 'abierta' && <button type="button" onClick={() => tomar(a)} className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer">🏃 Voy yo</button>}
                  <button type="button" onClick={() => resolver(a)} className="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold cursor-pointer">✓ Resuelto</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={abrirHistorial} className="text-xs font-bold text-[#6B1D2F] underline cursor-pointer">Ver historial</button>
          </div>
        ))}
      </div>
      <div className="fixed bottom-3 left-3 z-40 flex gap-2">
        {!sonidoListo && <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold shadow">🔕 Tocá cualquier lugar para activar el sonido de los avisos</span>}
        {alertas.length === 0 && <button type="button" onClick={abrirHistorial} className="px-3 py-1.5 rounded-full bg-white border text-[11px] font-bold text-slate-600 shadow cursor-pointer">🆘 Pedidos de ayuda</button>}
      </div>
      {verHistorial && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={() => setVerHistorial(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl p-4 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center"><h3 className="font-extrabold">🆘 Historial de pedidos de ayuda ({historial.length})</h3><button type="button" onClick={() => setVerHistorial(false)} className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold cursor-pointer">Cerrar</button></div>
            {historial.length === 0 ? <p className="text-sm text-slate-500">Todavía no hubo pedidos.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Hora</th><th>Puesto</th><th>Motivo</th><th>Atendió</th><th>Llegó en</th><th>Resuelto en</th></tr></thead>
                <tbody className="divide-y">{historial.map((a) => (
                  <tr key={a.id}><td className="py-1.5">{hora(a.created_at)}</td><td>{a.puesto}{a.curso ? ` · ${a.curso}` : ''}</td><td>{TEXTO_MOTIVO[a.motivo] || a.motivo}{a.detalle ? ` · ${a.detalle}` : ''}</td><td>{a.atiende || a.resuelta_por || ''}</td><td>{a.atendida_at ? `${minutosEntre(a.created_at, a.atendida_at)} min` : ''}</td><td>{a.resuelta_at ? `${minutosEntre(a.created_at, a.resuelta_at)} min` : a.estado === 'abierta' ? 'abierto' : 'en camino'}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const CLAVE_CACHE_PUERTA = 'puerta_cache_v1', CLAVE_COLA_PUERTA = 'puerta_cola_v1', CLAVE_LOGS_PUERTA = 'puerta_logs_v1';
const leerLS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (_) { return d; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* lleno o bloqueado */ } };
const CLAVE_DATOS_TABLA = { egresados: 'egresados', invitados: 'invitados', docentes: 'docentes', invitados_especiales: 'especiales' };
// Lo guardado sin conexión vale 12 horas: así un ingreso de prueba que quedó en un celular no se sube después de reiniciar la base
const VIGENCIA_COLA_MS = 12 * 60 * 60 * 1000;
const vigente = (iso) => { const t = new Date(iso || 0).getTime(); return !isNaN(t) && Date.now() - t < VIGENCIA_COLA_MS; };
const leerColaVigente = () => { const c = leerLS(CLAVE_COLA_PUERTA, []).filter((x) => vigente(x.hora)); guardarLS(CLAVE_COLA_PUERTA, c); return c; };
const leerLogsVigentes = () => { const l = leerLS(CLAVE_LOGS_PUERTA, []).filter((x) => vigente(x.created_at)); guardarLS(CLAVE_LOGS_PUERTA, l); return l; };

function ModuloPuerta({ config, egresados: egrProp, invitados: invProp, docentes: docProp, especiales: espProp, recargar, notify, perfilStaff }) {
  // ---- Sin conexión (v25): lista guardada en el celular + ingresos en espera que se suben solos ----
  const [cachePuerta] = useState(() => leerLS(CLAVE_CACHE_PUERTA, null));
  const usandoCache = !(egrProp && egrProp.length) && !!(cachePuerta && cachePuerta.egresados && cachePuerta.egresados.length);
  const [cola, setCola] = useState(() => leerColaVigente());
  const colaRef = useRef(cola);
  const [logsPend, setLogsPend] = useState(() => leerLogsVigentes().length);
  const [enLinea, setEnLinea] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const marcasLocales = useMemo(() => new Set(cola.map((x) => `${x.tabla}:${x.id}`)), [cola]);
  const conMarcas = (lista, tabla) => (marcasLocales.size ? (lista || []).map((r) => (!r.asistio && marcasLocales.has(`${tabla}:${r.id}`) ? { ...r, asistio: true, hora_ingreso: r.hora_ingreso || new Date().toISOString() } : r)) : (lista || []));
  const egresados = conMarcas(usandoCache ? cachePuerta.egresados : egrProp, 'egresados');
  const invitados = conMarcas(usandoCache ? cachePuerta.invitados : invProp, 'invitados');
  const docentes = conMarcas(usandoCache ? cachePuerta.docentes : docProp, 'docentes');
  const especiales = conMarcas(usandoCache ? cachePuerta.especiales : espProp, 'invitados_especiales');
  actualizarFamiliasMovilidad(invitados);
  useEffect(() => { if (egrProp && egrProp.length) guardarLS(CLAVE_CACHE_PUERTA, { t: Date.now(), egresados: egrProp, invitados: invProp, docentes: docProp, especiales: espProp }); }, [egrProp, invProp, docProp, espProp]);
  const guardarCola = (n) => { colaRef.current = n; setCola(n); guardarLS(CLAVE_COLA_PUERTA, n); };
  const offlineRef = useRef(false);
  const otroPuestoRef = useRef('');
  const [busqueda, setBusqueda] = useState('');
  const [egresadoSeleccionado, setEgresadoSeleccionado] = useState(null);
  const [escaneandoCamara, setEscaneandoCamara] = useState(false);
  const [resultadoIngreso, setResultadoIngresoBase] = useState(null);
  const setResultadoIngreso = setResultadoIngresoBase;
  const [sonidoActivo, setSonidoActivo] = useState(() => { try { return localStorage.getItem('puerta_sonido') !== 'off'; } catch (_) { return true; } });
  useEffect(() => {
    const habilitar = () => prepararAudioPuerta();
    window.addEventListener('pointerdown', habilitar, { once: true });
    window.addEventListener('keydown', habilitar, { once: true });
    return () => { window.removeEventListener('pointerdown', habilitar); window.removeEventListener('keydown', habilitar); };
  }, []);
  useEffect(() => {
    if (!resultadoIngreso || !sonidoActivo) return;
    const t = resultadoIngreso.tipo;
    sonarPuerta(t === 'success' ? (resultadoIngreso.movilidad ? 'movilidad' : 'success') : t === 'warning' ? 'warning' : 'error');
  }, [resultadoIngreso]); // eslint-disable-line react-hooks/exhaustive-deps
  const alternarSonido = () => {
    const nuevo = !sonidoActivo; setSonidoActivo(nuevo);
    try { localStorage.setItem('puerta_sonido', nuevo ? 'on' : 'off'); } catch (_) { /* nada */ }
    if (nuevo) sonarPuerta('success');
  };
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
  // Formato fijo para estadística: [MÉTODO] [tipo] [curso] [N pers] [segundos desde el registro anterior en este celular] texto [dispositivo]
  const metodoRef = useRef('CAMARA');
  const ultimoRegistroRef = useRef(0);
  const ultimoCursoRef = useRef('');
  const ayudaApiRef = useRef(null);
  const fallosSeguidosRef = useRef(0);
  const busqFallidasRef = useRef([]); // búsquedas manuales sin resultado: [{t, ms}]
  const logPuerta = (accion, detalle, meta = {}) => {
    try {
      if (meta.curso && meta.curso !== '-') ultimoCursoRef.current = meta.curso;
      if (['NO_ENCONTRADO', 'ERROR'].includes(accion)) {
        fallosSeguidosRef.current += 1;
        if (fallosSeguidosRef.current === 3 && ayudaApiRef.current) ayudaApiRef.current.automatica();
      } else if (/^INGRESO/.test(accion)) { fallosSeguidosRef.current = 0; busqFallidasRef.current = []; }
      const ahoraMs = Date.now();
      const dif = ultimoRegistroRef.current ? Math.round((ahoraMs - ultimoRegistroRef.current) / 1000) : null;
      ultimoRegistroRef.current = ahoraMs;
      const seg = dif !== null && dif <= 600 ? `${dif} s` : '-';
      const etiqueta = `[${meta.metodo || metodoRef.current || 'CAMARA'}] [${meta.tipo || '-'}] [${meta.curso || '-'}] [${meta.personas || 0} pers] [${seg}]`;
      const sinRed = typeof navigator !== 'undefined' && !navigator.onLine;
      const fila = { usuario: perfilRef.current?.nombre || perfilRef.current?.email || 'Puerta', accion, modulo: 'Puerta',
        detalle: `${etiqueta} ${detalle}${sinRed || offlineRef.current ? ' (sin conexión)' : ''} [${dispositivo}]`, created_at: new Date().toISOString() };
      const encolarLog = () => { const l = leerLS(CLAVE_LOGS_PUERTA, []); l.push(fila); guardarLS(CLAVE_LOGS_PUERTA, l); setLogsPend(l.length); };
      if (sinRed) { encolarLog(); return; }
      supabase.from('logs_sistema').insert(fila).then(({ error }) => {
        if (error) { if (esErrorRed(error)) encolarLog(); else console.error('No se pudo registrar el log de Puerta:', error); }
      }, () => encolarLog());
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
  const registrarSinRed = (tabla, id, extra) => {
    const fila = (datosRef.current[CLAVE_DATOS_TABLA[tabla]] || []).find((r) => r.id === id);
    if (fila && fila.asistio) return false; // según la lista guardada ya había ingresado
    guardarCola([...colaRef.current, { k: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, tabla, id, extra, hora: new Date().toISOString(), nombre: fila?.nombre_completo || '', dni: fila?.dni || '' }]);
    offlineRef.current = true;
    return 'offline';
  };
  const marcarIngreso = async (tabla, id, extra = {}) => {
    if (colaRef.current.some((x) => x.tabla === tabla && x.id === id)) return false; // ya lo registró este celular sin conexión
    if (typeof navigator !== 'undefined' && !navigator.onLine) return registrarSinRed(tabla, id, extra);
    try { return await marcarIngresoEnBase(tabla, id, extra); } catch (err) { if (esErrorRed(err)) return registrarSinRed(tabla, id, extra); throw err; }
  };
  // Sube los ingresos que quedaron guardados en el celular cuando no había conexión
  const sincronizandoRef = useRef(false);
  const sincronizar = async () => {
    if (sincronizandoRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    const pend = colaRef.current; const logsGuardados = leerLS(CLAVE_LOGS_PUERTA, []);
    if (!pend.length && !logsGuardados.length) return;
    sincronizandoRef.current = true;
    let subidos = 0; const yaEstaban = [];
    try {
      for (const it of pend) {
        const cambios = { asistio: true, ...(it.extra || {}) };
        if (TABLAS_HORA_REAL.includes(it.tabla) && !tablasSinHoraReal.has(it.tabla)) cambios.hora_ingreso_real = it.hora;
        const subir = (c) => supabase.from(it.tabla).update(c).eq('id', it.id).or('asistio.is.null,asistio.eq.false').select('id');
        let { data, error } = await subir(cambios);
        if (error && cambios.hora_ingreso_real && esErrorColumna(error, 'hora_ingreso_real')) { tablasSinHoraReal.add(it.tabla); delete cambios.hora_ingreso_real; ({ data, error } = await subir(cambios)); }
        if (error && esErrorRed(error)) break;
        if (!error && data && data.length) subidos += 1; else if (!error) yaEstaban.push(it);
        guardarCola(colaRef.current.filter((x) => x.k !== it.k));
      }
      yaEstaban.forEach((it) => logPuerta('DUPLICADO', `${it.nombre || it.tabla} (DNI ${it.dni || 'S/D'}): lo registró este celular sin conexión, pero ya lo había registrado otro dispositivo`, { metodo: 'CAMARA' }));
      const logs = leerLogsVigentes();
      if (logs.length && navigator.onLine) {
        let { error } = await supabase.from('logs_sistema').insert(logs);
        if (error && !esErrorRed(error)) ({ error } = await supabase.from('logs_sistema').insert(logs.map(({ created_at, ...r }) => ({ ...r, detalle: `${r.detalle} (hora real ${new Date(created_at).toLocaleTimeString('es-AR')})` }))));
        if (!error) { guardarLS(CLAVE_LOGS_PUERTA, []); setLogsPend(0); }
      }
    } catch (_) { /* se reintenta en 10 s */ } finally { sincronizandoRef.current = false; }
    if (subidos || yaEstaban.length) {
      notifyRef.current(`✓ Se subieron ${subidos} ingreso(s) guardados sin conexión${yaEstaban.length ? ` · ${yaEstaban.length} ya figuraban (los registró otro celular)` : ''}.`, yaEstaban.length ? 'warning' : 'success');
      recargarRef.current();
    }
  };
  useEffect(() => {
    const on = () => { setEnLinea(true); sincronizar(); };
    const off = () => setEnLinea(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const t = setInterval(() => { setEnLinea(navigator.onLine); sincronizar(); }, 10000);
    sincronizar();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const marcarIngresoEnBase = async (tabla, id, extra = {}) => {
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
      offlineRef.current = false;
      if (!item.asistio) {
        // Aviso si figura como "No asiste" (o si es invitado de un egresado dado de baja)
        const anf = tabla === 'invitados' ? egresados.find((e) => e.id === item.egresado_id) : null;
        const dadoDeBaja = tabla === 'invitados' ? anf?.activo === false : item.activo === false;
        if (dadoDeBaja && !window.confirm(`${item.nombre_completo} ${tabla === 'invitados' ? `es invitado/a de ${anf.nombre_completo}, que dio de baja su asistencia` : 'figura como "No asiste"'}.\n\n¿Registrar el ingreso igual? (solo si coordinación lo autorizó)`)) return;
        const extra = tabla === 'invitados' ? { hora_ingreso: new Date().toISOString() } : {};
        const ok = await marcarIngreso(tabla, item.id, extra);
        if (ok === 'offline') notify(`📵 Sin conexión: ingreso de ${item.nombre_completo} guardado en este celular. Se sube solo cuando vuelva internet.`, 'warning');
        const tipoManual = { egresados: 'egresado', invitados: 'familiar', docentes: 'docente', invitados_especiales: 'VIP' }[tabla] || tabla;
        if (!ok) {
          notify(colaRef.current.some((x) => x.tabla === tabla && x.id === item.id) ? 'Ya está registrado en este celular (sin conexión, falta subirlo).' : 'Ya figuraba como presente (lo registró otro dispositivo).', 'warning');
          logPuerta('DUPLICADO', `Manual: ${tipoManual} ${item.nombre_completo} (DNI ${item.dni || 'S/D'}) ya figuraba presente`, { metodo: 'MANUAL', tipo: tipoManual, curso: tabla === 'egresados' ? item.division : anf?.division });
        } else {
          logPuerta('INGRESO_MANUAL', `${tipoManual} ${item.nombre_completo} (DNI ${item.dni || 'S/D'})`, { metodo: 'MANUAL', tipo: tipoManual, curso: tabla === 'egresados' ? item.division : anf?.division, personas: 1 });
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
        logPuerta('QUITAR_INGRESO', `${item.nombre_completo} (DNI ${item.dni || 'S/D'})`, { metodo: 'MANUAL' });
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
    offlineRef.current = false;
    try {
      const nuevos = [];
      for (const g of pendientes) {
        if (await marcarIngreso('invitados', g.id, { hora_ingreso: new Date().toISOString() })) nuevos.push(g.nombre_completo);
      }
      logPuerta('INGRESO_GRUPAL', `Manual: grupo de ${egr.nombre_completo} (DNI ${egr.dni || 'S/D'}): ${nuevos.join(', ') || '(ya habían ingresado)'}`, { metodo: 'MANUAL', tipo: 'grupo', curso: egr.division, personas: nuevos.length });
      notify(nuevos.length ? `✓ Ingresaron ${nuevos.length} integrante(s) del grupo.${offlineRef.current ? ' 📵 Guardado sin conexión: se sube solo.' : ''}` : 'Ya figuraban todos como presentes.', nuevos.length && !offlineRef.current ? undefined : 'warning');
      await recargar();
    } catch (err) {
      notify('No se pudo registrar el grupo: ' + err.message, 'error');
    }
  };

  const validarCodigoEntrada = async (codigoRaw, origen = 'CAMARA') => {
    const raw = String(codigoRaw || '').trim();
    if (!raw) return;

    // Evita procesar el mismo código varias veces seguidas mientras el QR sigue frente a la cámara
    if (procesandoRef.current) return;
    const ahora = Date.now();
    if (ultimoEscaneoRef.current.code === raw && ahora - ultimoEscaneoRef.current.t < 4000) return;
    ultimoEscaneoRef.current = { code: raw, t: ahora };
    procesandoRef.current = true;
    metodoRef.current = origen;
    offlineRef.current = false; otroPuestoRef.current = '';
    const setResultadoIngreso = (r) => {
      if (!r) { setResultadoIngresoBase(r); return; }
      let res = r;
      if (offlineRef.current && r.tipo !== 'error') res = { ...res, titulo: `${res.titulo} · SIN CONEXIÓN`, detalle: `📵 Guardado en este celular: se sube solo cuando vuelva internet. ${res.detalle || ''}` };
      if (otroPuestoRef.current) res = { ...res, detalle: `${res.detalle || ''} · ⚠️ Corresponde al puesto: ${otroPuestoRef.current}` };
      setResultadoIngresoBase(res);
    };
    const enBase = async (...a) => { try { return await buscarCodigoEnBase(...a); } catch (err) { if (esErrorRed(err)) return null; throw err; } };

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

      const preferido = raw.toUpperCase().includes('ESRN005-VIP-') ? 'vip' : raw.toUpperCase().includes('ESRN005-DOCENTE-') ? 'docente' : '';
      let hallado = null;
      if (preferido) hallado = localizarCodigo(code, false, datosRef.current, preferido, true) || await enBase(code, false, preferido, true);
      if (!hallado) hallado = localizarCodigo(code, esQrEgresado, datosRef.current);
      if (!hallado) hallado = await enBase(code, esQrEgresado);

      if (!hallado) {
        setResultadoIngreso({ tipo: 'error', titulo: '❌ CÓDIGO NO ENCONTRADO', nombre: raw, detalle: 'Verifique el padrón o busque manualmente.' });
        avisar(`❌ Código o DNI no encontrado: ${raw}`, 'error');
        logPuerta('NO_ENCONTRADO', `Código leído: ${raw.slice(0, 60)}`);
        return;
      }

      const f = hallado.fila;
      const egrsLocal = datosRef.current.egresados;
      const miPuesto = String(perfilRef.current?.puesto_grupo || '');
      const suGrupo = grupoDePersona(esQrGrupo ? 'grupo' : hallado.tipo, f, egrsLocal);
      if (miPuesto && !/^Coordinaci/.test(miPuesto) && suGrupo && suGrupo !== miPuesto) otroPuestoRef.current = suGrupo;

      // QR del GRUPO FAMILIAR: registra a todos los invitados del egresado marcados "en grupo"
      if (esQrGrupo) {
        if (hallado.tipo !== 'egresado') {
          setResultadoIngreso({ tipo: 'error', titulo: '❌ GRUPO NO ENCONTRADO', nombre: raw, detalle: 'No se encontró al egresado de este grupo. Usá la búsqueda manual.' });
          avisar('❌ Grupo no encontrado. Usá la búsqueda manual.', 'error');
          logPuerta('NO_ENCONTRADO', `QR de grupo: ${raw.slice(0, 60)}`, { tipo: 'grupo' });
          return;
        }
        const acceso = accesoPuertaDe('grupo', f, egrsLocal);
        const nombreGrupo = `Grupo familiar de ${f.nombre_completo}`;
        if (f.activo === false) {
          setResultadoIngreso({ tipo: 'warning', titulo: '⛔ EL EGRESADO DIO DE BAJA SU ASISTENCIA', nombre: nombreGrupo, detalle: 'Al darse de baja se liberaron también las plazas de su grupo. Consultar con coordinación antes de dejarlos pasar.', acceso });
          avisar(`⛔ ${nombreGrupo}: el egresado figura como "No asiste". Consultar con coordinación.`, 'warning');
          logPuerta('BLOQUEADO_NO_ASISTE', `grupo de ${f.nombre_completo} (DNI ${f.dni || 'S/D'})`, { tipo: 'grupo', curso: f.division });
          return;
        }
        let grupales = [];
        try {
          if (!navigator.onLine) throw new TypeError('Failed to fetch');
          const { data: dg, error: eg } = await supabase.from('invitados').select('id, nombre_completo, asistio, movilidad_reducida').eq('egresado_id', f.id).eq('es_grupal', true);
          if (eg) throw eg;
          grupales = dg || [];
        } catch (eg) {
          if (!esErrorRed(eg)) throw eg;
          grupales = (datosRef.current.invitados || []).filter((i) => i.egresado_id === f.id && esGrupal(i)); // lista guardada en el celular
        }
        if (grupales.length === 0) {
          setResultadoIngreso({ tipo: 'warning', titulo: '⚠️ GRUPO SIN INTEGRANTES', nombre: nombreGrupo, detalle: 'Este egresado no tiene invitados marcados "en grupo". Buscá a cada invitado en la búsqueda manual.', acceso });
          avisar(`⚠️ ${nombreGrupo} no tiene integrantes cargados.`, 'warning');
          logPuerta('NO_ENCONTRADO', `grupo de ${f.nombre_completo} (DNI ${f.dni || 'S/D'}) sin integrantes`, { tipo: 'grupo', curso: f.division });
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
          logPuerta('INGRESO_GRUPAL', `grupo de ${f.nombre_completo} (DNI ${f.dni || 'S/D'}): ${grupales.filter((g) => nuevos.includes(g.id)).map((g) => g.nombre_completo).join(', ')}`, { tipo: 'grupo', curso: f.division, personas: nuevos.length });
        } else {
          setResultadoIngreso({ tipo: 'error', titulo: '¡ALERTA DUPLICADO! EL GRUPO YA INGRESÓ', nombre: nombreGrupo, detalle: `Los ${grupales.length} integrantes ya figuraban como presentes.`, acceso, lista });
          avisar(`⚠️ ¡ALERTA DUPLICADO! ${nombreGrupo} ya ingresó.`, 'error');
          logPuerta('DUPLICADO', `grupo de ${f.nombre_completo} (DNI ${f.dni || 'S/D'}) ya había ingresado`, { tipo: 'grupo', curso: f.division });
        }
        return;
      }

      const c = CONFIG_INGRESO[hallado.tipo];
      const acceso = accesoPuertaDe(hallado.tipo, f, egrsLocal);
      const movilidad = f.movilidad_reducida === true;
      acceso.ubicacion = hallado.tipo === 'docente' && f.ocupa_butaca === false ? 'No ocupa butaca'
        : ubicacionPara({ tipo: hallado.tipo, egr: hallado.tipo === 'invitado' ? egrsLocal.find((e) => e.id === f.egresado_id) : null, movilidad }, configRef.current);

      const cursoH = hallado.tipo === 'egresado' ? f.division : hallado.tipo === 'invitado' ? (egrsLocal.find((e) => e.id === f.egresado_id) || {}).division : '';
      const metaH = { tipo: ETIQUETA_TIPO[hallado.tipo], curso: cursoH };
      if (hallado.tipo !== 'invitado' && f.activo === false) {
        setResultadoIngreso({ tipo: 'warning', titulo: '⛔ FIGURA COMO "NO ASISTE"', nombre: f.nombre_completo, detalle: 'Dio de baja su asistencia. Consultar con coordinación antes de dejarlo pasar.' });
        avisar(`⛔ ${f.nombre_completo} figura como "No asiste". Consultar con coordinación.`, 'warning');
        logPuerta('BLOQUEADO_NO_ASISTE', `${ETIQUETA_TIPO[hallado.tipo]} ${f.nombre_completo} (DNI ${f.dni || 'S/D'})`, metaH);
        return;
      }
      // Invitado individual de un egresado que se dio de baja: su plaza quedó liberada
      const anfitrion = hallado.tipo === 'invitado' ? egrsLocal.find((e) => e.id === f.egresado_id) : null;
      if (hallado.tipo === 'invitado' && anfitrion && anfitrion.activo === false) {
        setResultadoIngreso({ tipo: 'warning', titulo: '⛔ SU EGRESADO DIO DE BAJA LA ASISTENCIA', nombre: f.nombre_completo, detalle: `Invitado/a de ${anfitrion.nombre_completo}. Al darse de baja se liberaron las plazas de su grupo. Consultar con coordinación.`, acceso });
        avisar(`⛔ ${f.nombre_completo}: su egresado figura como "No asiste". Consultar con coordinación.`, 'warning');
        logPuerta('BLOQUEADO_NO_ASISTE', `familiar ${f.nombre_completo} (DNI ${f.dni || 'S/D'}) (egresado ${anfitrion.nombre_completo} dado de baja)`, metaH);
        return;
      }
      const detalleExtra = hallado.tipo === 'invitado'
        ? `${f.dni ? `DNI: ${f.dni} · ` : ''}Invitado/a de ${anfitrion ? anfitrion.nombre_completo : 'egresado/a'}${anfitrion?.division ? ` (${anfitrion.division})` : ''}${esGrupal(f) ? ' · (figura en el grupo familiar)' : ''}`
        : hallado.tipo === 'egresado' ? [`DNI: ${f.dni}`, textoCurso(f)].filter(Boolean).join(' · ') : c.detalle(f);

      const ok = await marcarIngreso(c.tabla, f.id, c.extra ? c.extra() : {});
      recargarRef.current(); // refresca la lista en segundo plano, sin demorar el siguiente escaneo

      if (ok) {
        setResultadoIngreso({ tipo: 'success', titulo: c.okTitulo, nombre: f.nombre_completo, detalle: detalleExtra, acceso, movilidad });
        avisar(`✓ INGRESO PERMITIDO: ${f.nombre_completo}`);
        logPuerta('INGRESO', `${ETIQUETA_TIPO[hallado.tipo]} ${f.nombre_completo} (DNI ${f.dni || 'S/D'})`, { ...metaH, personas: 1 });
      } else {
        logPuerta('DUPLICADO', `${ETIQUETA_TIPO[hallado.tipo]} ${f.nombre_completo} (DNI ${f.dni || 'S/D'}) ya había ingresado`, metaH);
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
  const totalCoincidencias = egresadosCoincidentes.length + docentesCoincidentes.length + invitadosCoincidentes.length + vipsCoincidentes.length;
  // Búsqueda manual que queda sin resultados 4 s: se registra; si pasa 2 veces seguidas (distintas búsquedas, en menos de 3 min) se avisa solo a coordinación
  useEffect(() => {
    const t = busqueda.trim();
    if (t.length < 4 || totalCoincidencias > 0) return undefined;
    const h = setTimeout(() => {
      const ahora = Date.now();
      const lista = busqFallidasRef.current.filter((x) => ahora - x.ms < 180000);
      const norm = (v) => sinTildes(v).toLowerCase().replace(/[\s.]/g, '');
      const ult = lista[lista.length - 1];
      if (ult && (norm(t).startsWith(norm(ult.t)) || norm(ult.t).startsWith(norm(t)))) lista[lista.length - 1] = { t, ms: ahora };
      else lista.push({ t, ms: ahora });
      busqFallidasRef.current = lista;
      logPuerta('NO_ENCONTRADO_MANUAL', `Búsqueda manual sin resultados: "${t}"`, { metodo: 'MANUAL' });
      if (lista.length >= 2 && ayudaApiRef.current) {
        ayudaApiRef.current.automatica('auto_manual', 'Buscaron: ' + lista.slice(-3).map((x) => `"${x.t}"`).join(', '));
        busqFallidasRef.current = [];
      }
    }, 4000);
    return () => clearTimeout(h);
  }, [busqueda, totalCoincidencias]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {perfilStaff?.puesto_grupo && <p className="text-center text-sm font-extrabold text-[#6B1D2F]">📍 Tu puesto: {perfilStaff.puesto_grupo}</p>}
      {(!enLinea || cola.length > 0 || logsPend > 0 || usandoCache) && (
        <div className={`rounded-2xl p-3 border-2 text-sm ${!enLinea ? 'bg-amber-50 border-amber-400' : 'bg-sky-50 border-sky-300'}`}>
          <p className="font-extrabold">{!enLinea ? '📵 Sin conexión: seguí escaneando' : cola.length ? '⏳ Subiendo los ingresos guardados…' : '✓ Conexión normal'}</p>
          {cola.length > 0 && <p className="text-xs">{cola.length} ingreso(s) guardados en este celular. Se suben solos cuando vuelve internet. <b>No cierres ni recargues esta página.</b></p>}
          {usandoCache && <p className="text-xs">Usando la lista guardada en el celular ({cachePuerta?.t ? new Date(cachePuerta.t).toLocaleString('es-AR') : ''}). Los cargados después de esa hora no aparecen: usá el Resumen impreso.</p>}
          {!enLinea && !cola.length && <p className="text-xs">Los ingresos se guardan en el celular y se suben solos cuando vuelva la señal.</p>}
        </div>
      )}
      <AyudaPuerta perfilStaff={perfilStaff} dispositivo={dispositivo} config={config} notify={notify} ultimoCursoRef={ultimoCursoRef} registrarApi={ayudaApiRef} />
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-6 space-y-4 shadow-xl text-center">
        <div>
          <div className="flex justify-end">
            <button type="button" onClick={alternarSonido} title={sonidoActivo ? 'Silenciar el bip' : 'Activar el bip'} className={`px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${sonidoActivo ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
              {sonidoActivo ? '🔊 Sonido activado' : '🔇 Sonido apagado'}
            </button>
          </div>
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
              if (c) { validarCodigoEntrada(c, 'TIPEADO'); setCodigoManual(''); }
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
              <div className="text-center py-3 space-y-2">
                <p className="text-slate-400 text-sm">No se encontraron resultados exactos.</p>
                <button type="button" onClick={() => ayudaApiRef.current && ayudaApiRef.current.pedir('no_figura', `Buscado: "${busqueda.trim()}"`)} className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-extrabold cursor-pointer">🆘 No lo encuentro: avisar a coordinación</button>
              </div>
            )}
            {termino && termino.length >= 3 && (() => {
              const yaVistos = new Set([...egresadosCoincidentes, ...docentesCoincidentes, ...invitadosCoincidentes, ...vipsCoincidentes].map((x) => x.id));
              const par = buscarPersonas(busqueda, { egresados, invitados, docentes, especiales }).parecidos.filter((r) => !yaVistos.has(r.item.id)).slice(0, 6);
              if (!par.length) return null;
              const porIdP = {}; egresados.forEach((e) => { porIdP[e.id] = e; });
              return (
                <div className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
                  <p className="text-xs font-bold text-amber-800">¿Quisiste decir…? (DNI o nombre parecido: puede haber un error de carga)</p>
                  {par.map((r) => {
                    const anf = r.clase === 'invitado' ? porIdP[r.item.egresado_id] : null;
                    return (
                      <button key={r.clase + r.item.id} type="button" onClick={() => setBusqueda(r.item.dni ? String(r.item.dni) : r.item.nombre_completo)} className="w-full text-left px-2.5 py-2 bg-white border rounded-lg text-xs flex flex-wrap gap-x-2 items-center cursor-pointer hover:bg-amber-100">
                        <span>{CLASE_PERSONA[r.clase].i}</span><b>{r.item.nombre_completo}</b>
                        <span>DNI <DniMarcado dni={r.item.dni} marcas={r.marcas} /></span>
                        {anf && <span className="text-slate-500">de {anf.nombre_completo}{anf.division ? ` (${anf.division})` : ''}</span>}
                        <span className="text-amber-700 font-bold">⚠ {r.motivo}</span>
                      </button>
                    );
                  })}
                  <p className="text-[11px] text-amber-800">Antes de dejar pasar, confirmá nombre y DNI con la persona. Si hay un error, avisá a coordinación para corregirlo.</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

const isoALocal = (v) => { if (!v) return ''; const d = new Date(v); if (isNaN(d.getTime())) return ''; const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
const localAIso = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); };
// Grupos posibles para cada usuario de Puerta
const gruposPuesto = (egresados) => ['Egresados', ...cursosDe(egresados).map((c) => `Familias ${c}`), 'Docentes y VIP', 'Coordinación (todos)'];
const grupoDePersona = (tipo, fila, egresados) => {
  if (tipo === 'egresado') return 'Egresados';
  if (tipo === 'invitado' || tipo === 'grupo') { const e = tipo === 'grupo' ? fila : (egresados || []).find((x) => x.id === fila?.egresado_id); if (familiaConMovilidad(e)) return 'Docentes y VIP'; return e?.division ? `Familias ${e.division}` : ''; }
  if (tipo === 'docente' || tipo === 'vip') return 'Docentes y VIP';
  return '';
};

// ---------- Aviso del día anterior por WhatsApp (de a uno, con el mensaje armado) ----------
const PLANTILLA_AVISO = 'Hola {nombre} 👋 Te recordamos que mañana es el Acto de Colación de la ESRN N° 005. Tu familia entra a partir de las 8:30 por {acceso}; el acto empieza a las 9:00 en punto. Traé tu QR y el de tus invitados abiertos en el celular (con el brillo alto). ¡Te esperamos!';
function AvisoDiaAnterior({ egresados, invitados, cerrar, registrarLog }) {
  const leer = (k, d) => { try { return localStorage.getItem(k) || d; } catch (_) { return d; } };
  const [plantilla, setPlantilla] = useState(() => leer('aviso_plantilla', PLANTILLA_AVISO));
  const [curso, setCurso] = useState('');
  const [enviados, setEnviados] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('aviso_enviados') || '[]')); } catch (_) { return new Set(); } });
  useEffect(() => { try { localStorage.setItem('aviso_plantilla', plantilla); } catch (_) { /* nada */ } }, [plantilla]);
  const marcar = (id) => { const n = new Set(enviados); n.add(id); setEnviados(n); try { localStorage.setItem('aviso_enviados', JSON.stringify([...n])); } catch (_) { /* nada */ } };
  const activos = egresados.filter((e) => e.activo !== false && coincideCurso(e, curso));
  const numero = (e) => String(e.celular || '').replace(/\D/g, '');
  const conCel = activos.filter((e) => numero(e).length >= 8);
  const sinCel = activos.filter((e) => numero(e).length < 8);
  const texto = (e) => plantilla.replace(/\{nombre\}/g, String(e.nombre_completo || '').split(' ').slice(-1)[0] || '').replace(/\{acceso\}/g, accesoFamiliaDe(e).toLowerCase()).replace(/\{curso\}/g, e.division || '').replace(/\{invitados\}/g, String(invitados.filter((i) => i.egresado_id === e.id).length));
  const general = plantilla.replace(/Hola \{nombre\} 👋 /g, '').replace(/\{nombre\}/g, '').replace(/\{acceso\}/g, 'el acceso que figura en el pase').replace(/\{curso\}/g, curso && curso !== SIN_CURSO ? curso : '').replace(/\{invitados\}/g, '');
  const imprimirSinCel = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const filas = sinCel.map((e) => `<tr><td>${e.division || ''}</td><td>${e.nombre_completo}</td><td>${e.dni}</td><td></td></tr>`).join('');
    w.document.write(`<html><head><title>Egresados sin celular</title><style>body{font-family:Arial;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:5px;text-align:left}</style></head><body><h3>Egresados sin celular cargado${curso && curso !== SIN_CURSO ? ' · ' + curso : ''} (${sinCel.length})</h3><p>Avisar por otro medio (preceptor, grupo del curso).</p><table><tr><th>Curso</th><th>Egresado</th><th>DNI</th><th>Avisado</th></tr>${filas}</table></body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  const copiar = async () => { try { await navigator.clipboard.writeText(general); alert('Mensaje copiado: pegalo en el grupo del curso.'); } catch (_) { window.prompt('Copiá el mensaje:', general); } };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={cerrar}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-2">
          <div><h3 className="font-extrabold text-lg">📣 Aviso del día anterior</h3><p className="text-xs text-slate-500">Mensaje armado para mandar por WhatsApp a cada egresado. Se abre WhatsApp con el texto listo; vos tocás Enviar.</p></div>
          <button type="button" onClick={cerrar} className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold cursor-pointer">Cerrar</button>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600">Mensaje (podés usar {'{nombre}'}, {'{acceso}'}, {'{curso}'} y {'{invitados}'})</label>
          <textarea value={plantilla} onChange={(e) => setPlantilla(e.target.value)} rows={4} className="w-full px-3 py-2 rounded-xl border text-sm" />
          <div className="flex flex-wrap gap-2 items-center">
            <SelectorCurso egresados={egresados} valor={curso} onChange={setCurso} />
            <button type="button" onClick={() => setPlantilla(PLANTILLA_AVISO)} className="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold cursor-pointer">Volver al mensaje original</button>
            <button type="button" onClick={copiar} className="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold cursor-pointer">📋 Copiar mensaje general (para el grupo del curso)</button>
            {enviados.size > 0 && <button type="button" onClick={() => { if (window.confirm('¿Borrar las marcas de "enviado"?')) { setEnviados(new Set()); try { localStorage.removeItem('aviso_enviados'); } catch (_) { /* nada */ } } }} className="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold cursor-pointer">Borrar marcas</button>}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-emerald-700 mb-1.5">Con celular ({conCel.length}) · enviados {conCel.filter((e) => enviados.has(e.id)).length}</p>
          <div className="divide-y border rounded-xl max-h-72 overflow-y-auto">
            {conCel.map((e) => (
              <div key={e.id} className={`px-3 py-2 flex flex-wrap items-center gap-2 text-sm ${enviados.has(e.id) ? 'bg-emerald-50' : ''}`}>
                <span className="font-bold">{e.nombre_completo}</span><span className="text-xs text-slate-500">{e.division}</span>
                <a href={`https://wa.me/549${numero(e)}?text=${encodeURIComponent(texto(e))}`} target="_blank" rel="noreferrer" onClick={() => { marcar(e.id); registrarLog('AVISO_WHATSAPP', 'Egresados', `Aviso del día anterior a ${e.nombre_completo}`); }} className="ml-auto px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold">{enviados.has(e.id) ? '✓ Enviado · reenviar' : 'Enviar WhatsApp'}</a>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1.5"><p className="text-xs font-bold uppercase text-rose-700">Sin celular cargado ({sinCel.length}): avisar por otro medio</p>{sinCel.length > 0 && <button type="button" onClick={imprimirSinCel} className="px-3 py-1.5 bg-white border rounded-lg text-xs font-bold cursor-pointer">🖨 Imprimir lista para preceptores</button>}</div>
          <div className="divide-y border rounded-xl max-h-48 overflow-y-auto text-sm">
            {sinCel.map((e) => <div key={e.id} className="px-3 py-1.5 flex gap-2"><span className="font-semibold">{e.nombre_completo}</span><span className="text-xs text-slate-500">{e.division} · DNI {e.dni}</span></div>)}
            {sinCel.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Todos tienen celular cargado.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Preparar para abrir: diagnóstico + respaldo + limpieza (v30) ----------
function ModalLimpieza({ egresados, invitados, docentes, especiales, solicitudes, config, perfilStaff, descargarRespaldo, haciendoRespaldo, recargar, notify, cerrar }) {
  const [extra, setExtra] = useState({ pedidos: null, registros: null });
  const [respaldoOk, setRespaldoOk] = useState(false);
  const [borrarCel, setBorrarCel] = useState(false);
  const [borrarReg, setBorrarReg] = useState(true);
  const [texto, setTexto] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState(null);
  useEffect(() => {
    (async () => {
      const cuenta = async (q) => { try { const { count, error } = await q; return error ? null : count; } catch (_) { return null; } };
      const pedidos = await cuenta(supabase.from('alertas_puerta').select('id', { count: 'exact', head: true }));
      const registros = await cuenta(supabase.from('logs_sistema').select('id', { count: 'exact', head: true }).in('modulo', ['Portal', 'Puerta', 'Ayuda']));
      setExtra({ pedidos, registros });
    })();
  }, []);
  const conCel = egresados.filter((e) => String(e.celular || '').replace(/\D/g, '').length >= 6).length;
  const presentes = [egresados, invitados, docentes, especiales].reduce((a, l) => a + l.filter((x) => x.asistio).length, 0);
  const filas = [
    ['Invitados cargados', invitados.length, 'se borran'],
    ['Solicitudes de butacas', (solicitudes || []).length, 'se borran'],
    ['Egresados en "No asiste"', egresados.filter((e) => e.activo === false).length, 'se reactivan'],
    ['Docentes en "No asiste"', docentes.filter((d) => d.activo === false).length, 'se reactivan'],
    ['VIP en "No asiste"', especiales.filter((v) => v.activo === false).length, 'se reactivan'],
    ['Egresados con cupo distinto de 3', egresados.filter((e) => Number(e.cupo_asignado) !== 3).length, 'pasan a 3'],
    ['Egresados que entraron al portal', egresados.filter((e) => e.portal_ultimo_ingreso).length, 'se borra la marca'],
    ['Presentes marcados', presentes, 'se reinician'],
    ['Pedidos de ayuda', extra.pedidos ?? '…', 'se borran'],
    ['Registros de Portal, Puerta y Ayuda', extra.registros ?? '…', borrarReg ? 'se borran' : 'quedan'],
    ['Egresados con celular cargado', conCel, borrarCel ? 'se borran' : 'quedan'],
    ['Etapa', config.estado_etapa || 'abierta', 'pasa a Abierta'],
  ];
  const ejecutar = async () => {
    if (texto.trim().toUpperCase() !== 'LIMPIAR' || !respaldoOk) return;
    setTrabajando(true);
    try {
      const { data, error } = await supabase.rpc('admin_limpieza_apertura', { p_borrar_celulares: borrarCel, p_borrar_registro: borrarReg, p_usuario: perfilStaff?.nombre || perfilStaff?.email || '' });
      if (error) throw error;
      setResultado(data); await recargar(); notify('✓ Sistema listo para abrir.');
    } catch (err) {
      notify(/admin_limpieza_apertura|PGRST202|function/i.test(err.message || '') ? 'Falta correr el SQL de la v30 (sql_v30.sql).' : 'No se pudo limpiar: ' + err.message, 'error');
    } finally { setTrabajando(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={() => !trabajando && cerrar()}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4 text-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-2">
          <div><h3 className="font-extrabold text-lg">🧹 Preparar para abrir</h3><p className="text-xs text-slate-500">Borra lo que quedó de las pruebas y deja el sistema listo para la carga real. <b>No borra</b> egresados, docentes ni VIP (solo reactiva a los que estaban en "No asiste"), ni usuarios, sala o escudo. Los docentes "sin butaca" siguen igual.</p></div>
          <button type="button" onClick={cerrar} disabled={trabajando} className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold cursor-pointer">Cerrar</button>
        </div>
        {resultado ? (
          <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-400 space-y-1 text-sm">
            <p className="font-extrabold text-emerald-800">✓ Listo. El sistema quedó preparado para abrir.</p>
            <p>Se borraron {resultado.invitados} invitados, {resultado.solicitudes} solicitudes, {resultado.pedidos} pedidos de ayuda y {resultado.registros} registros de prueba. Se reactivaron {resultado.reactivados} egresados, {resultado.docentes ?? 0} docentes y {resultado.vip ?? 0} VIP, y se reiniciaron {resultado.presentes} presentes{borrarCel ? `; se borraron ${resultado.celulares} celulares` : ''}. Cupo 3 y etapa Abierta.</p>
            <p className="text-xs text-slate-600">Quedó anotado en el registro de actividad. A partir de ahora no conviene probar con egresados reales.</p>
          </div>
        ) : (<>
          <div>
            <p className="text-xs font-bold uppercase text-slate-500 mb-1.5">1 · Lo que hay ahora</p>
            <table className="w-full text-sm border rounded-xl overflow-hidden"><tbody className="divide-y">
              {filas.map(([t, n, q]) => <tr key={t}><td className="px-3 py-1.5">{t}</td><td className="px-3 py-1.5 font-bold text-right">{n}</td><td className="px-3 py-1.5 text-xs text-slate-500">{q}</td></tr>)}
            </tbody></table>
          </div>
          <div className={`p-3 rounded-xl border-2 ${respaldoOk ? 'border-emerald-400 bg-emerald-50' : 'border-amber-400 bg-amber-50'}`}>
            <p className="text-xs font-bold uppercase text-slate-600 mb-1.5">2 · Respaldo (obligatorio)</p>
            <button type="button" disabled={haciendoRespaldo} onClick={async () => { const ok = await descargarRespaldo(); if (ok !== false) setRespaldoOk(true); }} className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60">{haciendoRespaldo ? 'Armando respaldo…' : respaldoOk ? '✓ Respaldo descargado · bajar otro' : '💾 Descargar respaldo completo'}</button>
            <p className="text-[11px] text-slate-600 mt-1">Guardá el Excel en la compu. Con eso se puede recuperar cualquier dato si hiciera falta.</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase text-slate-500">3 · Opciones</p>
            <label className="flex gap-2 text-sm items-start"><input type="checkbox" checked={borrarReg} onChange={(e) => setBorrarReg(e.target.checked)} className="mt-1" /><span>Borrar del registro de actividad lo de las pruebas de <b>Portal, Puerta y Ayuda</b> (el resto del registro queda).</span></label>
            <label className="flex gap-2 text-sm items-start"><input type="checkbox" checked={borrarCel} onChange={(e) => setBorrarCel(e.target.checked)} className="mt-1" /><span>Borrar el <b>celular de todos los egresados</b>. Marcalo <b>solo si son de prueba</b>; si vienen de una planilla oficial, dejalo sin marcar. Si vas a usar "Portal: pedir celular", un celular de prueba le pediría al egresado los números de otro teléfono.</span></label>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase text-slate-500">4 · Confirmar</p>
            <input type="text" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder='Escribí LIMPIAR' className="w-full px-3 py-2.5 rounded-xl border-2 text-center font-bold tracking-widest" />
            <button type="button" onClick={ejecutar} disabled={trabajando || !respaldoOk || texto.trim().toUpperCase() !== 'LIMPIAR'} className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-xl font-extrabold cursor-pointer">{trabajando ? 'Limpiando…' : !respaldoOk ? 'Primero descargá el respaldo' : '🧹 Limpiar y dejar listo para abrir'}</button>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ---------- Ficha de persona: busca a cualquiera del sistema y muestra todo lo que pasó con esa persona ----------
const TABLA_DE_CLASE = { egresado: 'egresados', invitado: 'invitados', docente: 'docentes', vip: 'invitados_especiales' };
function FichaPersona({ egresados, invitados, docentes, especiales, solicitudes, usuariosSistema, perfilStaff, config, recargar, notify, abrirEditar }) {
  const [consulta, setConsulta] = useState('');
  const [sel, setSel] = useState(null); // {clase, id}
  const [historia, setHistoria] = useState({ cargando: false, filas: [], error: '' });
  const esAdmin = perfilStaff?.rol === 'admin';
  const res = buscarPersonas(consulta, { egresados, invitados, docentes, especiales, personal: esAdmin ? usuariosSistema : [] });
  const lista = { egresado: egresados, invitado: invitados, docente: docentes, vip: especiales, personal: usuariosSistema };
  const item = sel ? (lista[sel.clase] || []).find((x) => x.id === sel.id) : null;
  const porId = {}; egresados.forEach((e) => { porId[e.id] = e; });
  const anfitrion = item && sel.clase === 'invitado' ? porId[item.egresado_id] : null;
  const egrDe = sel?.clase === 'egresado' ? item : anfitrion;
  const hora = (v) => { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR'); };

  const cargarHistoria = async () => {
    if (!item) return;
    setHistoria({ cargando: true, filas: [], error: '' });
    try {
      const claves = [];
      const dni = soloDigitos(item.dni);
      if (dni.length >= 4) claves.push(dni);
      const nombre = String(item.nombre_completo || item.nombre || '').trim();
      if (nombre.length >= 4) claves.push(nombre);
      if (sel.clase === 'personal' && item.email) claves.push(item.email);
      const vistos = new Map();
      for (const k of claves) {
        const patron = `%${k.replace(/[%_]/g, '')}%`;
        for (const col of ['detalle', 'usuario']) {
          const { data, error } = await supabase.from('logs_sistema').select('*').ilike(col, patron).order('created_at', { ascending: true }).limit(500);
          if (error) throw error;
          (data || []).forEach((l) => vistos.set(l.id, l));
        }
      }
      const filas = [...vistos.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      setHistoria({ cargando: false, filas, error: '' });
    } catch (err) {
      setHistoria({ cargando: false, filas: [], error: 'No se pudo leer el registro: ' + (err.message || err) });
    }
  };
  useEffect(() => { if (item) cargarHistoria(); else setHistoria({ cargando: false, filas: [], error: '' }); }, [sel?.clase, sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ultimoIngresoLog = [...historia.filas].reverse().find((l) => l.modulo === 'Puerta' && ['INGRESO', 'INGRESO_MANUAL', 'INGRESO_GRUPAL'].includes(l.accion));
  const datoIngreso = ultimoIngresoLog ? leerLogPuerta(ultimoIngresoLog) : null;
  const NOMBRE_METODO = { CAMARA: 'escaneo del QR con la cámara', TIPEADO: 'DNI o código tipeado', MANUAL: 'búsqueda manual', COORDINACION: 'coordinación' };

  const marcar = async (presente) => {
    if (!item || sel.clase === 'personal') return;
    const tabla = TABLA_DE_CLASE[sel.clase];
    const tipoTxt = { egresado: 'egresado', invitado: 'familiar', docente: 'docente', vip: 'VIP' }[sel.clase];
    if (presente && (item.activo === false || anfitrion?.activo === false) && !window.confirm(`${item.nombre_completo} ${anfitrion?.activo === false ? 'es invitado/a de un egresado que dio de baja su asistencia' : 'figura como "No asiste"'}.\n\n¿Registrar el ingreso igual?`)) return;
    if (!window.confirm(presente ? `¿Registrar el ingreso de ${item.nombre_completo}?` : `¿Quitar el ingreso de ${item.nombre_completo}?`)) return;
    try {
      const ahora = new Date().toISOString();
      const extra = presente ? (tabla === 'invitados' ? { hora_ingreso: ahora } : TABLAS_HORA_REAL.includes(tabla) ? { hora_ingreso_real: ahora } : {}) : (tabla === 'invitados' ? { hora_ingreso: null } : TABLAS_HORA_REAL.includes(tabla) ? { hora_ingreso_real: null } : {});
      let q = supabase.from(tabla).update({ asistio: presente, ...extra }).eq('id', item.id);
      if (presente) q = q.or('asistio.is.null,asistio.eq.false');
      const { data, error } = await q.select('id');
      if (error) throw error;
      if (presente && (!data || data.length === 0)) { notify('Ya figuraba como presente.', 'warning'); return; }
      const curso = egrDe?.division || '-';
      await supabase.from('logs_sistema').insert({ usuario: perfilStaff?.nombre || perfilStaff?.email || 'Coordinación', modulo: 'Puerta', accion: presente ? 'INGRESO_MANUAL' : 'QUITAR_INGRESO',
        detalle: `[COORDINACION] [${tipoTxt}] [${curso}] [${presente ? 1 : 0} pers] [-] ${tipoTxt} ${item.nombre_completo} (DNI ${item.dni || 'S/D'}) [Administración]` });
      notify(presente ? `✓ Ingreso registrado: ${item.nombre_completo}` : `Ingreso quitado: ${item.nombre_completo}`);
      await recargar(); cargarHistoria();
    } catch (err) {
      notify('No se pudo guardar: ' + (err.message || err), 'error');
    }
  };
  const descargarQR = () => {
    if (!item) return;
    if (sel.clase === 'egresado') paseEgresado(item, config);
    else if (sel.clase === 'docente') paseDocente(item, config);
    else if (sel.clase === 'vip') paseVip(item, config);
    else if (sel.clase === 'invitado') {
      if (esGrupal(item) && anfitrion) paseGrupo(anfitrion, invitados.filter((i) => i.egresado_id === anfitrion.id && esGrupal(i)), config);
      else paseInvitado(item, anfitrion, config);
    }
  };

  const Chip = ({ children, className = '' }) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${className}`}>{children}</span>;
  const Resultado = ({ r }) => {
    const k = CLASE_PERSONA[r.clase]; const anf = r.clase === 'invitado' ? porId[r.item.egresado_id] : null;
    const curso = r.clase === 'egresado' ? r.item.division : anf?.division;
    return (
      <button type="button" onClick={() => setSel({ clase: r.clase, id: r.item.id })} className={`w-full text-left p-2.5 rounded-xl border flex flex-wrap items-center gap-2 cursor-pointer hover:bg-slate-50 ${sel?.id === r.item.id ? 'ring-2 ring-[#6B1D2F]' : ''}`}>
        <span className="text-lg">{k.i}</span>
        <span className="font-bold text-sm">{r.item.nombre_completo || r.item.nombre}</span>
        <span className="text-xs text-slate-600">DNI <DniMarcado dni={r.item.dni} marcas={r.marcas} /></span>
        <Chip className="bg-slate-100 text-slate-700">{k.t}</Chip>
        {curso && <Chip className="bg-rose-50 text-[#6B1D2F]">{curso}</Chip>}
        {anf && <span className="text-xs text-slate-500">de {anf.nombre_completo}</span>}
        {!r.exacto && r.motivo && <Chip className="bg-amber-100 text-amber-800">⚠ {r.motivo}</Chip>}
        {r.item.asistio && <Chip className="bg-emerald-100 text-emerald-800">✓ ingresó</Chip>}
      </button>
    );
  };

  return (
    <div className="bg-white rounded-2xl border p-5 space-y-4">
      <div>
        <h3 className="font-bold">🔎 Buscar persona · ¿qué pasó con…?</h3>
        <p className="text-xs text-slate-500">Escribí un DNI (aunque sea parte) o un nombre. Busca en egresados, invitados, docentes y VIP{esAdmin ? ', y en el personal del sistema' : ''}. Abajo aparecen también los <b>parecidos</b>, por si el DNI o el nombre se cargaron con un error.</p>
      </div>
      <input type="text" autoFocus value={consulta} onChange={(e) => { setConsulta(e.target.value); setSel(null); }} placeholder="Ej: 30125648 o Gómez Sofía" className="w-full px-4 py-3 rounded-xl border-2 border-[#6B1D2F]/40 text-base outline-none focus:border-[#6B1D2F]" />
      {consulta.trim().length >= 2 && !item && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-600 uppercase">Coincidencias ({res.exactos.length})</p>
            {res.exactos.length === 0 && <p className="text-xs text-slate-400">No hay coincidencias exactas.</p>}
            {res.exactos.slice(0, 40).map((r) => <Resultado key={r.clase + r.item.id} r={{ ...r, exacto: true }} />)}
          </div>
          {res.parecidos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-amber-700 uppercase">Parecidos · posible error de carga ({res.parecidos.length})</p>
              {res.parecidos.map((r) => <Resultado key={'p' + r.clase + r.item.id} r={{ ...r, exacto: false }} />)}
            </div>
          )}
        </div>
      )}
      {item && (() => {
        const k = CLASE_PERSONA[sel.clase];
        const misInv = sel.clase === 'egresado' ? invitados.filter((i) => i.egresado_id === item.id) : [];
        const miSol = egrDe ? (solicitudes || []).filter((x) => x.egresado_id === egrDe.id) : [];
        const horaIngreso = item.asistio ? hora(item.hora_ingreso_real || item.hora_ingreso) : '';
        return (
          <div className="border-2 rounded-2xl p-4 space-y-4" style={{ borderColor: k.c }}>
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase" style={{ color: k.c }}>{k.i} {k.t}</p>
                <h4 className="text-xl font-extrabold">{item.nombre_completo || item.nombre}</h4>
                <p className="text-sm text-slate-600">DNI {item.dni ? <span className="font-mono">{item.dni}</span> : 'sin DNI'}{sel.clase === 'personal' ? ` · ${item.email} · rol ${item.rol}` : ''}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {egrDe && textoCurso(egrDe) && <Chip className="bg-rose-50 text-[#6B1D2F]">{textoCurso(egrDe)}</Chip>}
                  {item.activo === false && <Chip className="bg-rose-100 text-rose-700">NO ASISTE</Chip>}
                  {anfitrion?.activo === false && <Chip className="bg-rose-100 text-rose-700">su egresado: NO ASISTE</Chip>}
                  {tieneMovilidad(item) && <Chip className="bg-amber-100 text-amber-800">♿ movilidad reducida</Chip>}
                  {sel.clase === 'invitado' && <Chip className="bg-indigo-50 text-indigo-700">{esGrupal(item) ? 'Entra en grupo' : 'Entra con QR individual'}</Chip>}
                  {sel.clase === 'docente' && <Chip className="bg-slate-100 text-slate-700">{item.ocupa_butaca === false ? 'Sin butaca' : 'Con butaca'}</Chip>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-start">
                <button type="button" onClick={() => setSel(null)} className="px-3 py-2 bg-white border rounded-xl text-xs font-bold cursor-pointer">← Volver a la búsqueda</button>
                {sel.clase !== 'personal' && <button type="button" onClick={descargarQR} className="px-3 py-2 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold cursor-pointer">⬇ Descargar QR</button>}
                {sel.clase !== 'personal' && (item.asistio
                  ? <button type="button" onClick={() => marcar(false)} className="px-3 py-2 bg-white border border-rose-300 text-rose-700 rounded-xl text-xs font-bold cursor-pointer">Quitar ingreso</button>
                  : <button type="button" onClick={() => marcar(true)} className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold cursor-pointer">✓ Marcar ingreso</button>)}
                {sel.clase !== 'personal' && abrirEditar && <button type="button" onClick={() => abrirEditar(sel.clase === 'invitado' ? 'egresado' : sel.clase, sel.clase === 'invitado' ? anfitrion : item)} className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold cursor-pointer">✏️ {sel.clase === 'invitado' ? 'Editar (en su egresado)' : 'Editar / corregir DNI'}</button>}
              </div>
            </div>

            {sel.clase !== 'personal' && (
              <div className={`p-3 rounded-xl text-sm ${item.asistio ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border'}`}>
                {item.asistio
                  ? <p><b>✓ Ingresó</b>{horaIngreso ? ` el ${horaIngreso}` : ''}{datoIngreso ? ` · por ${ultimoIngresoLog.usuario || '—'} (${NOMBRE_METODO[datoIngreso.metodo] || datoIngreso.metodo})` : ''}.</p>
                  : <p><b>Todavía no ingresó.</b> Acceso: {sel.clase === 'egresado' ? ACCESO_TEXTO.egresados.toLowerCase() : sel.clase === 'invitado' ? accesoFamiliaDe(anfitrion).toLowerCase() : ACCESO_TEXTO.abajo.toLowerCase()}{ubicacionPara({ tipo: sel.clase === 'vip' ? 'vip' : sel.clase, egr: anfitrion, movilidad: tieneMovilidad(item) }, config) ? ` · ${ubicacionPara({ tipo: sel.clase === 'vip' ? 'vip' : sel.clase, egr: anfitrion, movilidad: tieneMovilidad(item) }, config)}` : ''}.</p>}
              </div>
            )}

            {sel.clase === 'invitado' && anfitrion && (
              <div className="text-sm space-y-1">
                <p><b>Invitado/a de:</b> <button type="button" onClick={() => setSel({ clase: 'egresado', id: anfitrion.id })} className="underline font-semibold text-[#6B1D2F] cursor-pointer">{anfitrion.nombre_completo}</button> (DNI {anfitrion.dni}) · celular {anfitrion.celular || 'S/N'}</p>
                <p className="text-xs text-slate-500">N° de entrada {item.numero_entrada || '—'}</p>
              </div>
            )}
            {sel.clase === 'egresado' && (
              <div className="text-sm space-y-2">
                <p>Celular <b>{item.celular || 'S/N'}</b> · cupo <b>{cupoDe(item, config)}</b> · invitados cargados <b>{misInv.length}</b>{item.portal_ultimo_ingreso ? ` · entró al portal ${item.portal_ingresos || 1} vez/veces (última ${hora(item.portal_ultimo_ingreso)})` : ' · nunca entró al portal'}</p>
                {'qr_descargado_at' in item && <p className="text-xs">📲 QR del egresado: <b>{item.qr_descargado_at ? `descargado (último ${hora(item.qr_descargado_at)})` : 'todavía no lo descargó'}</b>{misInv.length > 0 ? <> · QR de la familia: <b>{item.qr_familia_descargado_at ? `descargado (último ${hora(item.qr_familia_descargado_at)})` : 'todavía no lo descargó'}</b></> : ''}</p>}
                {misInv.length > 0 && (
                  <div className="divide-y border rounded-xl">
                    {misInv.map((i) => (
                      <button key={i.id} type="button" onClick={() => setSel({ clase: 'invitado', id: i.id })} className="w-full text-left px-3 py-2 text-xs flex flex-wrap gap-2 items-center hover:bg-slate-50 cursor-pointer">
                        <b>{i.nombre_completo}</b><span className="font-mono text-slate-500">{i.dni}</span>
                        <Chip className="bg-indigo-50 text-indigo-700">{esGrupal(i) ? 'en grupo' : 'individual'}</Chip>
                        {tieneMovilidad(i) && <Chip className="bg-amber-100 text-amber-800">♿</Chip>}
                        {i.asistio ? <Chip className="bg-emerald-100 text-emerald-800">✓ ingresó {hora(i.hora_ingreso)}</Chip> : <Chip className="bg-slate-100 text-slate-500">no ingresó</Chip>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {miSol.length > 0 && (
              <p className="text-sm">Solicitud de butacas extra: <b>{miSol.map((x) => `${x.cantidad_solicitada} pedida(s) · ${String(x.estado || '').toLowerCase()}${String(x.estado || '').toLowerCase() === 'aprobada' ? ` (${x.cantidad_aprobada ?? x.cantidad_solicitada} aprobada/s)` : ''}`).join(' / ')}</b></p>
            )}

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-xs font-bold uppercase text-slate-600">Historia en el registro de actividad ({historia.filas.length})</p>
                <button type="button" onClick={cargarHistoria} className="px-2.5 py-1 bg-white border rounded-lg text-xs font-bold cursor-pointer">↻ Actualizar</button>
              </div>
              {historia.cargando && <p className="text-xs text-slate-400">Buscando en el registro…</p>}
              {historia.error && <p className="text-xs text-rose-600">{historia.error}</p>}
              {!historia.cargando && !historia.error && historia.filas.length === 0 && <p className="text-xs text-slate-400">{esAdmin ? 'No hay movimientos registrados de esta persona.' : 'El registro de actividad completo solo lo ve administración. Los datos de arriba (ingreso, invitados, QR) sí están al día.'}</p>}
              <div className="max-h-80 overflow-y-auto divide-y border rounded-xl">
                {historia.filas.map((l) => {
                  const p2 = l.modulo === 'Puerta' ? leerLogPuerta(l) : null;
                  const color = /ERROR|BLOQUEADO|NO_ENCONTRADO/.test(l.accion) ? 'text-rose-700' : /DUPLICADO|QUITAR/.test(l.accion) ? 'text-amber-700' : /INGRESO/.test(l.accion) ? 'text-emerald-700' : 'text-slate-700';
                  return (
                    <div key={l.id} className="px-3 py-2 text-xs space-y-0.5">
                      <p><span className="font-mono text-slate-500">{hora(l.created_at)}</span> · <b className={color}>{l.accion}</b> · {l.modulo} · <span className="text-slate-500">{l.usuario}</span>{p2 && p2.nuevo ? ` · ${NOMBRE_METODO[p2.metodo] || p2.metodo}` : ''}</p>
                      <p className="text-slate-600 break-words">{p2 ? p2.texto : l.detalle}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function PanelAdministracion({ abrirResumenPapel, vipPortalActivo, whatsappActivo, perfilStaff, config, egresados, invitados, docentes, especiales, solicitudes, usuariosSistema, logsSistema, totalEgresados, totalDocentes, totalDocentesConButaca, totalDocentesSinButaca, totalEspeciales, butacasVipOcupadas = 0, butacasReservadas = 0, totalCuposFamiliares, totalOcupado, vacantesLibres, recargar, notify, reiniciarAsistenciasGeneral, borrarInvitadosEgresados, registrarLog }) {
  const esAdminNov = perfilStaff?.rol === 'admin';
  const [verNovedades, setVerNovedades] = useState(false);
  const novedadNueva = (() => { try { return localStorage.getItem('novedades_vista') !== NOVEDADES[0].v; } catch (_) { return false; } })();
  const CAPACIDAD = capacidadDe(config);
  const [tab, setTab] = useState('egresados');
  const [filtroEgresado, setFiltroEgresado] = useState('');
  const [filtroPortal, setFiltroPortal] = useState('todos');
  const [filtroAsiste, setFiltroAsiste] = useState('todos');
  const [filtroQr, setFiltroQr] = useState('todos');
  const tieneInvitados = (e) => invitados.some((i) => i.egresado_id === e.id);
  const pasaFiltroQr = (e) => filtroQr === 'todos' || (e.activo !== false && (
    filtroQr === 'con_qr' ? !!e.qr_descargado_at : filtroQr === 'sin_qr' ? !e.qr_descargado_at : (tieneInvitados(e) && !e.qr_familia_descargado_at)));
  const [filtroDocente, setFiltroDocente] = useState('');
  const [filtroVip, setFiltroVip] = useState('');
  
  const [cupoBaseEdit, setCupoBaseEdit] = useState(cupoBaseDe(config));
  const [filasEdit, setFilasEdit] = useState(config.filas || 15);
  const [butacasFilaEdit, setButacasFilaEdit] = useState(config.butacas_por_fila || 35);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [cupoMasivo, setCupoMasivo] = useState('');
  const [recortarSobrantes, setRecortarSobrantes] = useState(true);
  const [filtroInvitado, setFiltroInvitado] = useState('');
  const [filtroCursoEgr, setFiltroCursoEgr] = useState('');
  const [filtroCursoInv, setFiltroCursoInv] = useState('');
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

  const cambiarEscudoActivo = async () => {
    if (!config.id) return;
    const nuevo = config.escudo_activo === false;
    const { error } = await supabase.from('configuracion').update({ escudo_activo: nuevo }).eq('id', config.id);
    if (error) {
      const falta = /escudo_activo/i.test(error.message || '') || error.code === 'PGRST204' || error.code === '42703';
      notify(falta ? 'Falta crear la columna "escudo_activo" en configuracion (SQL de la v19).' : 'No se pudo cambiar: ' + error.message, 'error');
      return;
    }
    await registrarLog('CONFIGURACION', 'Escudo', nuevo ? 'Escudo en uso.' : 'Escudo desactivado (no se muestra).');
    await recargar();
    notify(nuevo ? 'El escudo vuelve a aparecer en la página y en los pases.' : 'El escudo dejó de mostrarse (sigue guardado).');
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
  // Cambiar la contraseña de cualquier usuario (solo admin; usa la función admin_cambiar_clave de la base)
  const [claveDeUsr, setClaveDeUsr] = useState(null);
  const [claveUsrNueva, setClaveUsrNueva] = useState('');
  const [claveUsrRep, setClaveUsrRep] = useState('');
  const [verClaveUsr, setVerClaveUsr] = useState(false);
  const [guardandoClaveUsr, setGuardandoClaveUsr] = useState(false);
  const cambiarClaveDeUsuario = async (e) => {
    e.preventDefault();
    if (claveUsrNueva.length < 8) { notify('La contraseña tiene que tener al menos 8 caracteres.', 'error'); return; }
    if (claveUsrNueva !== claveUsrRep) { notify('Las dos contraseñas no coinciden.', 'error'); return; }
    setGuardandoClaveUsr(true);
    try {
      const { error } = await supabase.rpc('admin_cambiar_clave', { p_email: claveDeUsr.email, p_clave: claveUsrNueva });
      if (error) throw error;
      await registrarLog('USUARIOS', 'Contraseña', `Cambió la contraseña de ${claveDeUsr.nombre || claveDeUsr.email}.`);
      notify(`Contraseña de ${claveDeUsr.nombre || claveDeUsr.email} cambiada. Pasásela por un medio seguro.`);
      setClaveDeUsr(null); setClaveUsrNueva(''); setClaveUsrRep('');
    } catch (err) {
      const m = String(err?.message || '');
      notify(/could not find the function|PGRST202/i.test(m) ? 'Falta crear la función "admin_cambiar_clave" en Supabase (SQL de la v18).' : 'No se pudo cambiar la contraseña: ' + m, 'error');
    } finally {
      setGuardandoClaveUsr(false);
    }
  };

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
        filas.push([esc(new Date(l.created_at).toLocaleString('es-AR', { hourCycle: 'h23' })), esc(l.created_at), esc(l.usuario), esc(l.modulo), esc(l.accion), esc(l.detalle)].join(','));
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
            const E = totalEgresados, D = totalDocentesConButaca, V = butacasVipOcupadas + butacasReservadas;
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

  const videoActivoAdm = config.video_activo === true;
  const cambiarVideo = async () => {
    const nuevo = !videoActivoAdm;
    if (!window.confirm(nuevo ? '¿Mostrar el botón "Ver video" en el portal?\n\nAntes tiene que estar subido el archivo public/tutorial.mp4 en GitHub.' : '¿Ocultar el botón del video tutorial en el portal?')) return;
    try {
      const { error } = await supabase.from('configuracion').update({ video_activo: nuevo }).eq('id', config.id);
      if (error) throw error;
      await registrarLog('CONFIGURACION', 'Video tutorial', nuevo ? 'Se mostró el video tutorial en el portal.' : 'Se ocultó el video tutorial del portal.');
      await recargar();
      notify(nuevo ? 'Video tutorial visible en el portal.' : 'Video tutorial oculto.');
    } catch (err) {
      const faltaColumna = /video_activo/i.test(err.message || '') || err.code === 'PGRST204' || err.code === '42703';
      notify(faltaColumna ? 'Falta crear la columna "video_activo" en configuracion (SQL de la v22).' : 'Error: ' + err.message, 'error');
    }
  };

  const [telCoord, setTelCoord] = useState(config.telefono_coordinacion || '');
  useEffect(() => { setTelCoord(config.telefono_coordinacion || ''); }, [config.telefono_coordinacion]);
  const guardarTelCoord = async () => {
    const v = String(telCoord || '').replace(/[<>]/g, '').trim().slice(0, 150);
    try {
      const { error } = await supabase.from('configuracion').update({ telefono_coordinacion: v || null }).eq('id', config.id);
      if (error) throw error;
      await registrarLog('CONFIGURACION', 'Teléfono de coordinación', v ? `Teléfono para la Puerta sin internet: ${v}` : 'Se borró el teléfono de coordinación.');
      await recargar(); notify(v ? 'Teléfono de coordinación guardado.' : 'Teléfono borrado.');
    } catch (err) {
      notify(/telefono_coordinacion/i.test(err.message || '') || err.code === 'PGRST204' ? 'Falta correr el SQL de la v24 (columna telefono_coordinacion).' : 'Error: ' + err.message, 'error');
    }
  };

  const [modalAviso, setModalAviso] = useState(false);
  const [modalLimpieza, setModalLimpieza] = useState(false);
  const [haciendoRespaldo, setHaciendoRespaldo] = useState(false);
  const [autoParcial, setAutoParcial] = useState(isoALocal(config.fecha_cierre_parcial));
  const [autoDefinitivo, setAutoDefinitivo] = useState(isoALocal(config.fecha_definitivo));
  useEffect(() => { setAutoParcial(isoALocal(config.fecha_cierre_parcial)); setAutoDefinitivo(isoALocal(config.fecha_definitivo)); }, [config.fecha_cierre_parcial, config.fecha_definitivo]);
  const faltaSqlV25 = (err) => /etapa_auto|fecha_cierre|fecha_definitivo|portal_verificar|puesto_grupo/i.test(err?.message || '') || err?.code === 'PGRST204' || err?.code === '42703';
  const guardarConfigV25 = async (cambios, detalle, ok) => {
    try {
      const { error } = await supabase.from('configuracion').update(cambios).eq('id', config.id);
      if (error) throw error;
      await registrarLog('CONFIGURACION', 'Configuración', detalle);
      await recargar(); notify(ok);
    } catch (err) {
      notify(faltaSqlV25(err) ? 'Falta correr el SQL de la v25 (sql_v25.sql).' : 'Error: ' + err.message, 'error');
    }
  };
  const cambiarVerificarCelular = () => {
    const nuevo = config.portal_verificar_celular !== true;
    if (!window.confirm(nuevo ? '¿Pedir los últimos 4 números del celular para entrar al portal?\n\nSolo a los egresados que ya cargaron su celular. Desde Administración se sigue editando todo sin pedir nada.' : '¿Dejar de pedir los 4 números del celular en el portal?')) return;
    guardarConfigV25({ portal_verificar_celular: nuevo }, nuevo ? 'Portal: se pide el celular (4 números) para entrar.' : 'Portal: ya no se pide el celular para entrar.', nuevo ? 'El portal ahora pide los 4 números del celular.' : 'El portal ya no pide el celular.');
  };
  const guardarEtapaAuto = (activar) => {
    const fp = localAIso(autoParcial), fd = localAIso(autoDefinitivo);
    if (activar && !fp && !fd) { notify('Cargá al menos una fecha.', 'error'); return; }
    if (fp && fd && new Date(fd) <= new Date(fp)) { notify('El Definitivo tiene que ser después del Cierre Parcial.', 'error'); return; }
    const txt = `Cambio automático ${activar ? 'ACTIVADO' : 'desactivado'}. Cierre Parcial: ${fp ? fechaHoraAR(fp) : '—'} · Definitivo: ${fd ? fechaHoraAR(fd) : '—'}`;
    if (activar && !window.confirm(`¿Activar el cambio automático de etapa?\n\nCierre Parcial: ${fp ? fechaHoraAR(fp) : '(sin fecha)'}\nDefinitivo: ${fd ? fechaHoraAR(fd) : '(sin fecha)'}\n\nA esa hora el sistema cambia la etapa solo. Si después la cambiás a mano, se respeta.`)) return;
    guardarConfigV25({ etapa_auto: activar, fecha_cierre_parcial: fp, fecha_definitivo: fd, etapa_auto_aplicada: null }, txt, activar ? 'Cambio automático de etapa activado.' : 'Cambio automático desactivado.');
  };
  const descargarRespaldo = async () => {
    setHaciendoRespaldo(true);
    try {
      const tablas = [['egresados', 'Egresados'], ['invitados', 'Invitados'], ['docentes', 'Docentes'], ['invitados_especiales', 'VIP'], ['solicitudes_butacas', 'Solicitudes'], ['usuarios_sistema', 'Usuarios'], ['configuracion', 'Configuración'], ['alertas_puerta', 'Pedidos de ayuda'], ['logs_sistema', 'Registro']];
      const XLSX = await import('xlsx');
      const libro = XLSX.utils.book_new(); const resumen = [];
      for (const [t, hoja] of tablas) {
        let filas = [], desde = 0, faltante = false;
        for (;;) {
          const { data, error } = await supabase.from(t).select('*').range(desde, desde + 999);
          if (error) { faltante = true; break; }
          filas = filas.concat(data || []); if (!data || data.length < 1000) break; desde += 1000;
        }
        const limpias = filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, k === 'escudo' && v ? '(imagen guardada)' : v !== null && typeof v === 'object' ? JSON.stringify(v).slice(0, 32000) : typeof v === 'string' ? v.slice(0, 32000) : v])));
        XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(limpias.length ? limpias : [{ '(vacía)': faltante ? 'No se pudo leer esta tabla' : 'Sin datos' }]), hoja.slice(0, 31));
        resumen.push({ Tabla: hoja, Filas: filas.length, Estado: faltante ? 'no se pudo leer' : 'ok' });
      }
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet([{ Tabla: `Respaldo del ${new Date().toLocaleString('es-AR')}`, Filas: '', Estado: '' }, ...resumen]), 'Índice');
      libro.SheetNames.unshift(libro.SheetNames.pop());
      const f = new Date(); const z = (n) => String(n).padStart(2, '0');
      const nombre = `respaldo-colacion-esrn5-${f.getFullYear()}-${z(f.getMonth() + 1)}-${z(f.getDate())}-${z(f.getHours())}${z(f.getMinutes())}.xlsx`;
      XLSX.writeFile(libro, nombre);
      await registrarLog('RESPALDO', 'Sistema', `Descargó el respaldo completo (${resumen.map((r) => `${r.Tabla} ${r.Filas}`).join(', ')})`);
      notify(`Respaldo descargado: ${nombre}`);
      return true;
    } catch (err) {
      notify('No se pudo armar el respaldo: ' + err.message, 'error');
      return false;
    } finally { setHaciendoRespaldo(false); }
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

  const reiniciarMarcasPortal = async () => {
    const n = egresados.filter((e) => e.portal_ultimo_ingreso).length;
    if (!window.confirm(`Se van a borrar las marcas de "entró al portal" de ${n} egresado(s): quedan todos como "No entró".\n\nNo se borran invitados, solicitudes ni el registro de actividad.\n\n¿Continuar?`)) return;
    try {
      const { error } = await supabase.from('egresados').update({ portal_primer_ingreso: null, portal_ultimo_ingreso: null, portal_ingresos: 0 }).not('portal_ultimo_ingreso', 'is', null);
      if (error) throw error;
      await registrarLog('REINICIAR', 'Portal', `Se reiniciaron las marcas de ingreso al portal (${n} egresados).`);
      await recargar();
      notify('Marcas de portal reiniciadas: todos figuran como "No entró".');
    } catch (err) {
      notify('No se pudieron reiniciar las marcas: ' + (err.message || err), 'error');
    }
  };

  const exportarInvitadosCSV = () => {
    const porId = {};
    egresados.forEach((e) => { porId[e.id] = e; });
    const filas = [['N° entrada', 'DNI invitado', 'Nombre invitado', 'Invitado de', 'DNI egresado', 'División', 'Modalidad', 'Movilidad reducida', 'Acceso', 'Presente']];
    const listaExp = invitados.filter((i) => coincideCurso(porId[i.egresado_id], filtroCursoInv) && (!filtroInvitado.trim() || coincideTexto([i.nombre_completo, i.dni, i.numero_entrada, porId[i.egresado_id]?.nombre_completo, porId[i.egresado_id]?.dni], filtroInvitado)));
    listaExp.sort((a, b) => claveCurso(porId[a.egresado_id]?.division).localeCompare(claveCurso(porId[b.egresado_id]?.division)) || (porId[a.egresado_id]?.nombre_completo || '').localeCompare(porId[b.egresado_id]?.nombre_completo || ''));
    listaExp.forEach((i) => {
      const anf = porId[i.egresado_id];
      filas.push([i.numero_entrada || '', i.dni || '', i.nombre_completo || '', anf?.nombre_completo || '', anf?.dni || '', anf?.division || '', esGrupal(i) ? 'En grupo' : 'Individual', tieneMovilidad(i) ? 'SI' : '', accesoFamiliaDe(anf), i.asistio ? 'SI' : 'NO']);
    });
    const sufijo = filtroCursoInv ? '-' + (filtroCursoInv === SIN_CURSO ? 'sin-curso' : filtroCursoInv.replace(/[^0-9A-Za-z]+/g, '')) : '';
    descargarCSV(`invitados-de-egresados-esrn5${sufijo}.csv`, filas);
    notify(`Exportados ${listaExp.length} invitado(s).`);
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
    if (!Number.isInteger(cap) || cap < 50 || cap > 2000) { notify('La capacidad tiene que ser un número entero (por ejemplo 525).', 'error'); return; }
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
      ? `¿Aprobar ${cantidad} de ${pedidas} butaca(s) para ${sol.egresado_nombre}?\n\n${(config.estado_etapa || 'abierta') === 'abierta' ? `Se suman ${cantidad} al cupo del egresado` : `La carga ya cerró: tiene ${(invitados || []).filter((i) => i.egresado_id === sol.egresado_id).length} invitado(s) cargado(s) y se le abren ${cantidad} lugar(es) extra para completar`} y la solicitud queda cerrada.`
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
        // Con la carga cerrada, los lugares que el egresado no usó ya se liberaron: el cupo nuevo es lo que tenía cargado + las aprobadas
        const cargados = (invitados || []).filter((i) => i.egresado_id === egr.id).length;
        const nuevoCupo = (config.estado_etapa || 'abierta') === 'abierta' ? cupoDe(egr, config) + cantidad : cargados + cantidad;
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
        return { DNI: e.dni, 'Nombre completo': e.nombre_completo, 'División': e.division || '', 'Orientación': e.orientacion || '', Estado: e.activo === false ? 'NO ASISTE' : 'Asiste', Presente: si(e.asistio), 'Hora de ingreso': e.asistio ? hora(e.hora_ingreso_real) : '', 'Cupo asignado': e.cupo_asignado ?? '', 'Invitados cargados': susInv.length, 'Invitados presentes': susInv.filter((i) => i.asistio).length, 'Entró al portal': e.portal_ultimo_ingreso ? 'SI' : 'NO', 'Último ingreso al portal': hora(e.portal_ultimo_ingreso) };
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


  // Estadística de la Puerta: lee todo el registro de Puerta y arma un Excel por puesto, por curso y cada 5 minutos
  const exportarEstadisticaPuerta = async () => {
    try {
      const XLSX = await import('xlsx');
      const regs = [];
      for (let desde = 0; desde < 50000; desde += 1000) {
        const { data: parte, error } = await supabase.from('logs_sistema').select('*').eq('modulo', 'Puerta').order('created_at', { ascending: true }).range(desde, desde + 999);
        if (error) throw error;
        regs.push(...(parte || []));
        if (!parte || parte.length < 1000) break;
      }
      if (regs.length === 0) { notify('Todavía no hay registros de la Puerta.', 'warning'); return; }
      const filas = regs.map((l) => ({ l, ...leerLogPuerta(l) }));
      const esIngreso = (r) => ['INGRESO', 'INGRESO_MANUAL', 'INGRESO_GRUPAL'].includes(r.l.accion) && r.personas > 0;
      const hhmm = (d) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const mediana = (arr) => { const a = arr.filter((x) => x !== null && x !== undefined).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : ''; };
      const pct = (a, b) => (b ? `${Math.round(a / b * 100)} %` : '');
      const ing = filas.filter(esIngreso);
      const personas = ing.reduce((s2, r) => s2 + r.personas, 0);
      const porMetodo = (m) => ing.filter((r) => r.metodo === m).reduce((s2, r) => s2 + r.personas, 0);
      const cuenta = (acc) => filas.filter((r) => r.l.accion === acc).length;
      const resumen = [
        { Concepto: 'Personas que ingresaron (según la Puerta)', Valor: personas },
        { Concepto: 'Registros de ingreso', Valor: ing.length },
        { Concepto: '   por cámara (QR)', Valor: `${porMetodo('CAMARA')} personas (${pct(porMetodo('CAMARA'), personas)})` },
        { Concepto: '   por DNI o código tipeado', Valor: `${porMetodo('TIPEADO')} personas (${pct(porMetodo('TIPEADO'), personas)})` },
        { Concepto: '   por búsqueda manual', Valor: `${porMetodo('MANUAL')} personas (${pct(porMetodo('MANUAL'), personas)})` },
        { Concepto: '   por coordinación (ficha de persona)', Valor: `${porMetodo('COORDINACION')} personas (${pct(porMetodo('COORDINACION'), personas)})` },
        { Concepto: 'Duplicados (QR ya usado)', Valor: cuenta('DUPLICADO') },
        { Concepto: 'No encontrados', Valor: cuenta('NO_ENCONTRADO') },
        { Concepto: 'Bloqueados por "No asiste"', Valor: cuenta('BLOQUEADO_NO_ASISTE') },
        { Concepto: 'Errores (no se registró)', Valor: cuenta('ERROR') },
        { Concepto: 'Ingresos quitados', Valor: cuenta('QUITAR_INGRESO') },
        { Concepto: 'Primer ingreso', Valor: ing.length ? new Date(ing[0].l.created_at).toLocaleString('es-AR') : '' },
        { Concepto: 'Último ingreso', Valor: ing.length ? new Date(ing[ing.length - 1].l.created_at).toLocaleString('es-AR') : '' },
        { Concepto: 'Segundos entre escaneos (mediana, todos los puestos)', Valor: mediana(filas.map((r) => r.seg)) },
        { Concepto: 'Generado el', Valor: new Date().toLocaleString('es-AR') },
      ];
      const usuarios = [...new Set(filas.map((r) => r.l.usuario || '(sin usuario)'))];
      const porPuesto = usuarios.map((u) => {
        const fu = filas.filter((r) => (r.l.usuario || '(sin usuario)') === u); const iu = fu.filter(esIngreso);
        const sum = (m) => iu.filter((r) => r.metodo === m).reduce((s2, r) => s2 + r.personas, 0);
        return { 'Puesto / usuario': u, 'Personas ingresadas': iu.reduce((s2, r) => s2 + r.personas, 0), 'Registros de ingreso': iu.length, 'Por cámara': sum('CAMARA'), Tipeado: sum('TIPEADO'), 'Búsqueda manual': sum('MANUAL'), Duplicados: fu.filter((r) => r.l.accion === 'DUPLICADO').length, 'No encontrados': fu.filter((r) => r.l.accion === 'NO_ENCONTRADO').length, Bloqueados: fu.filter((r) => r.l.accion === 'BLOQUEADO_NO_ASISTE').length, Errores: fu.filter((r) => r.l.accion === 'ERROR').length, 'Seg. entre escaneos (mediana)': mediana(fu.map((r) => r.seg)), 'Primer registro': fu.length ? hhmm(new Date(fu[0].l.created_at)) : '', 'Último registro': fu.length ? hhmm(new Date(fu[fu.length - 1].l.created_at)) : '' };
      }).sort((a, b) => b['Personas ingresadas'] - a['Personas ingresadas']);
      const cursos = [...new Set(ing.map((r) => r.curso || 'Sin curso / docentes y VIP'))].sort((a, b) => claveCurso(a).localeCompare(claveCurso(b)));
      const porCurso = cursos.map((c) => {
        const ic = ing.filter((r) => (r.curso || 'Sin curso / docentes y VIP') === c); const tot = ic.reduce((s2, r) => s2 + r.personas, 0);
        const sumT = (t) => ic.filter((r) => r.tipo === t).reduce((s2, r) => s2 + r.personas, 0);
        const sumM = (m) => ic.filter((r) => r.metodo === m).reduce((s2, r) => s2 + r.personas, 0);
        return { Curso: c, 'Personas ingresadas': tot, Egresados: sumT('egresado'), 'Familiares (individual)': sumT('familiar'), 'Familiares (grupo)': sumT('grupo'), Docentes: sumT('docente'), VIP: sumT('VIP'), 'Por cámara': sumM('CAMARA'), Tipeado: sumM('TIPEADO'), 'Búsqueda manual': sumM('MANUAL'), '% manual': pct(sumM('MANUAL') + sumM('TIPEADO'), tot) };
      });
      const tramos = {};
      ing.forEach((r) => { const d = new Date(r.l.created_at); d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0); const k = d.getTime(); tramos[k] = tramos[k] || { personas: 0, regs: 0, manual: 0 }; tramos[k].personas += r.personas; tramos[k].regs += 1; if (r.metodo !== 'CAMARA') tramos[k].manual += r.personas; });
      let acumulado = 0;
      const cada5 = Object.keys(tramos).sort().map((k) => { const t = tramos[k]; acumulado += t.personas; const d = new Date(Number(k)); return { Desde: hhmm(d), Hasta: hhmm(new Date(Number(k) + 5 * 60000)), 'Personas que entraron': t.personas, 'Registros': t.regs, 'De ellas a mano': t.manual, 'Acumulado': acumulado }; });
      const detalle = filas.map((r) => ({ 'Fecha y hora': new Date(r.l.created_at).toLocaleString('es-AR'), Usuario: r.l.usuario || '', Acción: r.l.accion, Método: r.metodo, Tipo: r.tipo, Curso: r.curso, Personas: r.personas, 'Seg. desde el anterior': r.seg ?? '', Detalle: r.texto, Dispositivo: r.dispositivo }));
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(resumen), 'Resumen');
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(porPuesto), 'Por puesto');
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(porCurso), 'Por curso');
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(cada5), 'Cada 5 minutos');
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(detalle), 'Detalle');
      try {
        const { data: al } = await supabase.from('alertas_puerta').select('*').order('created_at', { ascending: true }).limit(1000);
        const filasAl = (al || []).map((a) => ({ Hora: new Date(a.created_at).toLocaleString('es-AR'), Puesto: a.puesto, Curso: a.curso || '', Motivo: TEXTO_MOTIVO[a.motivo] || a.motivo, Detalle: a.detalle || '', Automático: a.automatica ? 'Sí' : 'No', Insistencias: a.insistencias || 0, Atendió: a.atiende || '', 'Min. hasta que fueron': a.atendida_at ? minutosEntre(a.created_at, a.atendida_at) : '', 'Min. hasta resolver': a.resuelta_at ? minutosEntre(a.created_at, a.resuelta_at) : '', Estado: a.estado, 'Cerró': a.resuelta_por || '' }));
        XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasAl.length ? filasAl : [{ Hora: 'Sin pedidos de ayuda' }]), 'Pedidos de ayuda');
      } catch (_) { /* sin tabla de alertas todavía */ }
      const f = new Date();
      const nombre = `estadistica-puerta-esrn5-${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}.xlsx`;
      XLSX.writeFile(libro, nombre);
      notify(`Estadística descargada: ${nombre} (${regs.length} registros de Puerta).`);
    } catch (err) {
      console.error(err);
      notify('No se pudo generar la estadística: ' + err.message, 'error');
    }
  };

  const normTxt = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const coincideBusqueda = (item, q) => {
    const texto = normTxt(q);
    if (!texto) return true;
    const soloDigitos = String(q).replace(/\D/g, '');
    return normTxt(item.nombre_completo).includes(texto) || (soloDigitos.length > 0 && String(item.dni || '').includes(soloDigitos));
  };
  const hayDatoPortal = egresados.some((e) => 'portal_ultimo_ingreso' in e);
  const entroPortal = (e) => !!e.portal_ultimo_ingreso;
  const cantEntraronPortal = egresados.filter((e) => e.activo !== false && entroPortal(e)).length;
  const cantActivosEgr = egresados.filter((e) => e.activo !== false).length;
  const fechaCorta = (v) => { const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const egresadosFiltrados = egresados.filter((e) => coincideBusqueda(e, filtroEgresado) && coincideCurso(e, filtroCursoEgr)
    && (filtroPortal === 'todos' || (filtroPortal === 'entraron' ? entroPortal(e) : (!entroPortal(e) && e.activo !== false)))
    && (filtroAsiste === 'todos' || (filtroAsiste === 'no_asisten' ? e.activo === false : e.activo !== false))
    && pasaFiltroQr(e));
  // PDF (impresión) de los egresados que no asisten, respetando el curso elegido
  const pdfNoAsisten = () => {
    const lista = egresados.filter((e) => e.activo === false && coincideCurso(e, filtroCursoEgr))
      .sort((a, b) => claveCurso(a.division).localeCompare(claveCurso(b.division)) || String(a.nombre_completo).localeCompare(String(b.nombre_completo)));
    if (!lista.length) { notify('No hay egresados marcados como "No asiste"' + (filtroCursoEgr ? ' en ese curso.' : '.'), 'warning'); return; }
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const cursoTxt = filtroCursoEgr ? (filtroCursoEgr === SIN_CURSO ? 'Sin curso' : filtroCursoEgr) : 'Todos los cursos';
    let liberadas = 0;
    const filas = lista.map((e, i) => {
      const cupo = cupoDe(e, config); const cargados = invitados.filter((x) => x.egresado_id === e.id).length; liberadas += 1 + cupo;
      return `<tr><td>${i + 1}</td><td>${esc(e.division || 'Sin curso')}</td><td><b>${esc(e.nombre_completo)}</b></td><td>${esc(e.dni)}</td><td>${esc(e.celular || '—')}</td><td class="c">${cargados}</td><td class="c">${1 + cupo}</td></tr>`;
    }).join('');
    const porCurso = cursosDe(lista).filter(Boolean).map((c) => `${esc(c)}: ${lista.filter((e) => e.division === c).length}`).concat(lista.some((e) => !e.division) ? [`Sin curso: ${lista.filter((e) => !e.division).length}`] : []).join(' · ');
    const escudo = escudoDe(config);
    const fecha = new Date().toLocaleString('es-AR');
    const w = window.open('', '_blank');
    if (!w) { notify('El navegador bloqueó la ventana. Permití las ventanas emergentes para este sitio.', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Egresados que no asisten - ${esc(cursoTxt)}</title><style>
      @page{size:A4;margin:14mm} body{font-family:Arial,sans-serif;font-size:11px;color:#111}
      .cab{display:flex;align-items:center;gap:12px;border-bottom:3px solid #6B1D2F;padding-bottom:8px;margin-bottom:10px}
      .cab img{width:52px;height:52px;object-fit:contain} h1{font-size:17px;margin:0;color:#6B1D2F} .sub{color:#555;margin-top:2px}
      .res{display:flex;gap:10px;margin:8px 0 12px} .res div{border:1px solid #ccc;border-radius:6px;padding:6px 10px} .res b{font-size:15px;display:block}
      table{border-collapse:collapse;width:100%} th,td{border:1px solid #bbb;padding:5px 6px;text-align:left} th{background:#f3e8eb} .c{text-align:center}
      .pie{margin-top:14px;color:#666;font-size:10px} tr{page-break-inside:avoid}</style></head><body>
      <div class="cab">${escudo ? `<img src="${escudo}">` : ''}<div><h1>Egresados que no asisten al Acto de Colación 2026</h1><div class="sub">ESRN N° 005 — Cipolletti · ${esc(cursoTxt)} · generado el ${esc(fecha)}</div></div></div>
      <div class="res"><div><b>${lista.length}</b>egresados no asisten</div><div><b>${liberadas}</b>butacas liberadas (egresado + su cupo)</div>${porCurso ? `<div><b>Por curso</b>${porCurso}</div>` : ''}</div>
      <table><thead><tr><th>#</th><th>Curso</th><th>Egresado</th><th>DNI</th><th>Celular</th><th class="c">Invitados cargados</th><th class="c">Butacas liberadas</th></tr></thead><tbody>${filas}</tbody></table>
      <div class="pie">Sus QR y los de su grupo familiar quedan bloqueados en la Puerta. Para reactivar a alguien: Administración → Egresados → Editar y Descargar QR → Reactivar.</div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300)}<\/script></body></html>`);
    w.document.close();
    registrarLog('EXPORTAR', 'Egresados', `PDF de egresados que no asisten (${cursoTxt}): ${lista.length}`);
  };
  const docentesFiltrados = docentes.filter((d) => coincideBusqueda(d, filtroDocente));
  const vipsFiltrados = especiales.filter((v) => coincideBusqueda(v, filtroVip));
  const logsFiltrados = logsSistema.filter((l) => (l.usuario || '').toLowerCase().includes(filtroLogBusqueda.toLowerCase()) || (l.accion || '').toLowerCase().includes(filtroLogBusqueda.toLowerCase()) || (l.modulo || '').toLowerCase().includes(filtroLogBusqueda.toLowerCase()) || (l.detalle || '').toLowerCase().includes(filtroLogBusqueda.toLowerCase()));

  return (
    <div className="space-y-6">
      {esAdminNov && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setVerNovedades(true)} className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold cursor-pointer hover:bg-slate-100">📋 Novedades del sistema{novedadNueva ? ' 🔴' : ''}</button>
        </div>
      )}
      {esAdminNov && verNovedades && <ModalNovedades cerrar={() => setVerNovedades(false)} />}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Egresados</p><p className="text-2xl font-extrabold">{totalEgresados}</p></div>
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Docentes</p><p className="text-2xl font-extrabold">{totalDocentes}</p><p className="text-[10px] text-slate-500 mt-0.5">{totalDocentesConButaca} con butaca · {totalDocentesSinButaca} sin</p></div>
        <div className="bg-white p-4 rounded-2xl border"><p className="text-xs text-slate-500">Especiales / VIP</p><p className="text-2xl font-extrabold">{totalEspeciales}</p>{butacasVipOcupadas > totalEspeciales && <p className="text-[10px] text-slate-500 mt-0.5">fila reservada: {butacasVipOcupadas} butacas</p>}</div>
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
        {perfilStaff?.rol === 'admin' && (
          <div className="w-full border-t pt-3 flex flex-wrap items-end gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Cambio automático por fecha</p>
              <p className="text-[11px] text-slate-500">{config.etapa_auto === true ? `● Activado${config.etapa_auto_aplicada ? ` · ya aplicó: ${config.etapa_auto_aplicada === 'cierre_definitivo' ? 'Definitivo' : 'Cierre Parcial'}` : ''}` : '○ Desactivado: la etapa se cambia solo a mano'}</p>
            </div>
            <label className="text-[11px] font-bold text-slate-600">Cierre Parcial desde<br /><input type="datetime-local" value={autoParcial} onChange={(e) => setAutoParcial(e.target.value)} className="px-2 py-1.5 rounded-lg border text-xs" /></label>
            <label className="text-[11px] font-bold text-slate-600">Definitivo desde<br /><input type="datetime-local" value={autoDefinitivo} onChange={(e) => setAutoDefinitivo(e.target.value)} className="px-2 py-1.5 rounded-lg border text-xs" /></label>
            <button onClick={() => guardarEtapaAuto(true)} className="px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer bg-[#6B1D2F] text-white">{config.etapa_auto === true ? 'Guardar fechas' : 'Activar'}</button>
            {config.etapa_auto === true && <button onClick={() => guardarEtapaAuto(false)} className="px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer bg-slate-100 text-slate-700">Desactivar</button>}
          </div>
        )}
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
        {[
          { id: 'egresados', texto: `Egresados (${egresados.length})`, fondo: COLOR_PASE.egresado },
          { id: 'invitados', texto: `Invitados de egresados (${invitados.length})`, fondo: `linear-gradient(90deg, ${COLOR_PASE.cn}, ${COLOR_PASE.edu})`, borde: COLOR_PASE.cn },
          { id: 'docentes', texto: `Docentes (${docentes.length})`, fondo: COLOR_PASE.docente },
          { id: 'vip', texto: `Invitados VIP (${especiales.length})`, fondo: COLOR_PASE.vip },
        ].map((t) => {
          const activa = tab === t.id;
          const color = t.borde || t.fondo;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border-2 transition ${activa ? 'text-white shadow' : 'bg-white hover:opacity-80'}`}
              style={activa ? { background: t.fondo, borderColor: 'transparent' } : { borderColor: color, color }}>
              {t.texto}
            </button>
          );
        })}
        <button onClick={() => setTab('buscar')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border-2 ${tab === 'buscar' ? 'bg-[#6B1D2F] text-white border-[#6B1D2F]' : 'bg-white border-[#6B1D2F] text-[#6B1D2F]'}`}>🔎 Buscar persona</button>
        <button onClick={() => setTab('solicitudes')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'solicitudes' ? 'bg-slate-800 text-white' : 'bg-white border'}`}>Solicitudes Butacas ({solicitudes.length})</button>
        <button onClick={() => setTab('reportes')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'reportes' ? 'bg-slate-800 text-white' : 'bg-white border'}`}>Acreditación en Vivo</button>
        <button onClick={() => setTab('aforo')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'aforo' ? 'bg-indigo-700 text-white shadow' : 'bg-white border'}`}>⚙️ Aforo y Sala</button>
        {perfilStaff?.rol === 'admin' && (
          <button onClick={() => setTab('usuarios')} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${tab === 'usuarios' ? 'bg-emerald-600 text-white' : 'bg-white border'}`}>Usuarios del Sistema ({usuariosSistema.length})</button>
        )}
      </div>

      {modalLimpieza && <ModalLimpieza egresados={egresados} invitados={invitados} docentes={docentes} especiales={especiales} solicitudes={solicitudes} config={config} perfilStaff={perfilStaff} descargarRespaldo={descargarRespaldo} haciendoRespaldo={haciendoRespaldo} recargar={recargar} notify={notify} cerrar={() => setModalLimpieza(false)} />}
      {modalAviso && <AvisoDiaAnterior egresados={egresados} invitados={invitados} cerrar={() => setModalAviso(false)} registrarLog={registrarLog} />}
      {tab === 'egresados' && (
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-bold">Padrón de Egresados</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setModalAviso(true)} className="px-3.5 py-2 bg-green-600 text-white rounded-xl text-xs font-bold shadow cursor-pointer">📣 Aviso del día anterior</button>
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
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SelectorCurso egresados={egresados} valor={filtroCursoEgr} onChange={setFiltroCursoEgr} />
            <span className="font-bold text-slate-500">Mostrando {egresadosFiltrados.length} de {egresados.length}</span>
            {(filtroCursoEgr || filtroEgresado || filtroPortal !== 'todos' || filtroAsiste !== 'todos' || filtroQr !== 'todos') && <button onClick={() => { setFiltroCursoEgr(''); setFiltroEgresado(''); setFiltroPortal('todos'); setFiltroAsiste('todos'); setFiltroQr('todos'); }} className="px-2.5 py-1 bg-white border rounded-lg font-bold text-slate-600 cursor-pointer">Quitar filtros</button>}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-600">Asistencia: no asisten {egresados.filter((e) => e.activo === false && coincideCurso(e, filtroCursoEgr)).length}{filtroCursoEgr ? ' en este curso' : ''}</span>
            {[['todos', 'Todos'], ['asisten', '✔ Asisten'], ['no_asisten', '✖ No asisten']].map(([v, t]) => (
              <button key={v} onClick={() => setFiltroAsiste(v)} className={`px-3 py-1 rounded-full border font-bold cursor-pointer ${filtroAsiste === v ? 'bg-[#6B1D2F] text-white border-[#6B1D2F]' : 'bg-white text-slate-600'}`}>{t}</button>
            ))}
            <button onClick={pdfNoAsisten} className="ml-auto px-3 py-1 rounded-full border border-rose-300 bg-rose-50 text-rose-700 font-bold cursor-pointer">📄 PDF de los que no asisten</button>
          </div>

          {egresados.some((e) => 'qr_descargado_at' in e) && (() => {
            const act = egresados.filter((e) => e.activo !== false && coincideCurso(e, filtroCursoEgr));
            const conQr = act.filter((e) => e.qr_descargado_at).length;
            const famSin = act.filter((e) => tieneInvitados(e) && !e.qr_familia_descargado_at).length;
            return (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-600">QR descargados: egresado {conQr} de {act.length} · familias sin descargar {famSin}</span>
                {[['todos', 'Todos'], ['con_qr', '✔ Bajaron su QR'], ['sin_qr', '✖ No bajaron su QR'], ['familia_sin_qr', '✖ Familia sin bajar']].map(([v, t]) => (
                  <button key={v} onClick={() => setFiltroQr(v)} className={`px-3 py-1 rounded-full border font-bold cursor-pointer ${filtroQr === v ? 'bg-[#6B1D2F] text-white border-[#6B1D2F]' : 'bg-white text-slate-600'}`}>{t}</button>
                ))}
              </div>
            );
          })()}

          {hayDatoPortal && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-600">Portal: entraron {cantEntraronPortal} de {cantActivosEgr}</span>
              {[['todos', 'Todos'], ['entraron', '✔ Entraron'], ['sin_entrar', '✖ Todavía no entraron']].map(([v, t]) => (
                <button key={v} onClick={() => setFiltroPortal(v)} className={`px-3 py-1 rounded-full border font-bold cursor-pointer ${filtroPortal === v ? 'bg-[#6B1D2F] text-white border-[#6B1D2F]' : 'bg-white text-slate-600'}`}>{t}</button>
              ))}
              {perfilStaff?.rol === 'admin' && cantEntraronPortal + egresados.filter((e) => e.activo === false && entroPortal(e)).length > 0 && (
                <button onClick={reiniciarMarcasPortal} className="ml-auto px-3 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700 font-bold cursor-pointer">↺ Reiniciar marcas de portal</button>
              )}
            </div>
          )}

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
                      {hayDatoPortal && (entroPortal(e)
                        ? <span title={`Primera vez: ${fechaCorta(e.portal_primer_ingreso)} · Veces: ${e.portal_ingresos || 1}`} className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-full text-[10px] font-bold">✔ Entró al portal · {fechaCorta(e.portal_ultimo_ingreso)}</span>
                        : <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-bold">✖ No entró al portal</span>)}
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

      {tab === 'buscar' && (
        <FichaPersona egresados={egresados} invitados={invitados} docentes={docentes} especiales={especiales} solicitudes={solicitudes} usuariosSistema={usuariosSistema}
          perfilStaff={perfilStaff} config={config} recargar={recargar} notify={notify}
          abrirEditar={(clase, it) => { if (!it) return; if (clase === 'egresado') abrirModalEditar(it); else if (clase === 'docente') abrirModalEditarDocente(it); else if (clase === 'vip') abrirModalEditarVip(it); }} />
      )}

      {tab === 'invitados' && (() => {
        const porId = {};
        egresados.forEach((e) => { porId[e.id] = e; });
        const lista = invitados.filter((i) => coincideCurso(porId[i.egresado_id], filtroCursoInv) && (!filtroInvitado.trim() || coincideTexto([i.nombre_completo, i.dni, i.numero_entrada, porId[i.egresado_id]?.nombre_completo, porId[i.egresado_id]?.dni], filtroInvitado)));
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
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <SelectorCurso egresados={egresados} valor={filtroCursoInv} onChange={setFiltroCursoInv} />
              <span className="font-bold text-slate-500">Mostrando {lista.length} de {invitados.length}{filtroCursoInv || filtroInvitado ? ' · Exportar baja solo estos' : ''}</span>
              {(filtroCursoInv || filtroInvitado) && <button onClick={() => { setFiltroCursoInv(''); setFiltroInvitado(''); }} className="px-2.5 py-1 bg-white border rounded-lg font-bold text-slate-600 cursor-pointer">Quitar filtros</button>}
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
                      <p className="text-xs text-slate-400">Invitado de <b>{anfitrion ? anfitrion.nombre_completo : 'egresado eliminado'}</b>{anfitrion?.division ? ` · ${anfitrion.division}` : ''}{i.numero_entrada ? ` · Entrada ${i.numero_entrada}` : ''}</p>
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
                <div><span className="font-semibold">{v.nombre_completo}</span> <span className="text-xs text-slate-500">({v.dni || 'sin DNI'})</span> {tieneMovilidad(v) && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">♿ Movilidad reducida</span>} {v.activo === false && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-bold">NO ASISTE</span>}</div>
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
              {(editVipDni !== (modalEditarVip.dni || '') || (!modalEditarVip.dni && editVipNombre.trim().toUpperCase() !== (modalEditarVip.nombre_completo || ''))) && (
                <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">⚠️ Al cambiar {editVipDni !== (modalEditarVip.dni || '') ? 'el DNI' : 'el nombre (este VIP no tiene DNI)'}, el pase que ya se le envió deja de servir: después de guardar, descargá el QR de nuevo y mandáselo.</p>
              )}
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
              <button onClick={exportarEstadisticaPuerta} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                <Download className="w-3.5 h-3.5" /> Estadística de la Puerta (Excel)
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
        // Personas con movilidad: si hay un sector para ellas, se sientan ahí y no en el de su familia
        // Familias con alguien con movilidad reducida: si hay sector para ellas, TODO el grupo se sienta ahí y se descuenta de su orientación
        const famsMov = activos.filter((e) => familiaConMovilidad(e));
        const plazasMov = (lista) => lista.reduce((acc, e) => acc + plazasFamiliaresDe(e, ctx), 0);
        const movVip = especiales.filter((v) => v.activo !== false && tieneMovilidad(v)).length;
        const haySectorMov = (salaEdit.sectores || []).some((x) => x.grupo === 'movilidad' || x.grupo === 'vip_movilidad');
        const movDe = (t) => (haySectorMov ? plazasMov(famsMov.filter((e) => tipoOrientacion(e) === t)) : 0);
        const necesita = {
          egresados: totalEgresados,
          familias_cn: famDe('cn') - movDe('cn'),
          familias_edu: famDe('edu') - movDe('edu'),
          familias: famDe('cn') + famDe('edu') + famSinOri - (haySectorMov ? plazasMov(famsMov) : 0),
          docentes: totalDocentesConButaca,
          vip: totalEspeciales,
          vip_movilidad: totalEspeciales + plazasMov(famsMov),
          movilidad: plazasMov(famsMov) + movVip,
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
                <button type="button" onClick={() => editarSala({ capacidad: CAPACIDAD_DEFINITIVA })} className="px-3 py-2 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold cursor-pointer">Usar {CAPACIDAD_DEFINITIVA} (definitivo)</button>
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
                    const usado = asig > 0 || ['egresados', 'docentes', 'familias_cn', 'familias_edu'].includes(g.valor) || (g.valor === 'vip' && !(butacasPorGrupo.vip_movilidad > 0));
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
              {' '}"Familias" se calcula con la etapa actual (en Cierre Parcial cuenta los invitados cargados). {haySectorMov ? `Las familias con alguien con movilidad reducida (${famsMov.length}) se sientan completas en su sector (con VIP o propio) y se descuentan de su orientación.` : 'Las familias con movilidad reducida también están contadas en su orientación.'}
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
          <p className="text-xs text-slate-500 -mt-3">Con <b>🔑 Clave</b> cambiás la contraseña de cualquier usuario (por ejemplo, si se la olvidó). Tu propia contraseña también la podés cambiar con <b>🔑 Mi contraseña</b> del encabezado.</p>
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
                    {rolU === 'puerta' && u.puesto_grupo && <p className="text-[11px] font-bold text-[#6B1D2F]">📍 {u.puesto_grupo}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => {
                      const nuevo = window.prompt(`Nombre para ${u.email}:`, u.nombre || '');
                      if (nuevo === null) return;
                      const limpio = nuevo.trim();
                      if (!limpio) { notify('El nombre no puede quedar vacío.', 'error'); return; }
                      if (limpio !== u.nombre) actualizarUsuario(u, { nombre: limpio }, `Cambió el nombre a ${limpio}`);
                    }} className="px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer bg-amber-50 text-amber-700 border flex items-center gap-1"><Edit2 className="w-3 h-3" /> Nombre</button>
                    <button onClick={() => { setClaveDeUsr(u); setClaveUsrNueva(''); setClaveUsrRep(''); }} className="px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer bg-slate-100 text-slate-700 border">🔑 Clave</button>
                    <select value={rolU} onChange={(e) => actualizarUsuario(u, { rol: e.target.value }, `Cambió el rol a ${e.target.value}`)} className="px-2 py-1.5 rounded-lg border text-xs font-bold bg-white">
                      <option value="puerta">Puerta</option>
                      <option value="coordinador">Coordinador</option>
                      <option value="admin">Administrador</option>
                    </select>
                    {rolU === 'puerta' && (
                      <select value={u.puesto_grupo || ''} onChange={(e) => actualizarUsuario(u, { puesto_grupo: e.target.value || null }, `Puesto: ${e.target.value || 'sin asignar'}`)} title="De qué grupo es responsable en la puerta" className="px-2 py-1.5 rounded-lg border text-xs font-bold bg-white max-w-[12rem]">
                        <option value="">📍 Puesto: sin asignar</option>
                        {gruposPuesto(egresados).map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    )}
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

      {claveDeUsr && perfilStaff?.rol === 'admin' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={cambiarClaveDeUsuario} className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-5 space-y-3 border-t-4 border-[#6B1D2F]">
            <h3 className="font-extrabold text-base text-slate-900">🔑 Cambiar contraseña</h3>
            <p className="text-xs text-slate-600"><b>{claveDeUsr.nombre}</b> · {claveDeUsr.email}</p>
            <div className="relative">
              <input type={verClaveUsr ? 'text' : 'password'} autoComplete="new-password" placeholder="Contraseña nueva (mínimo 8)" value={claveUsrNueva} onChange={(e) => setClaveUsrNueva(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" required />
              <button type="button" onClick={() => setVerClaveUsr(!verClaveUsr)} className="absolute right-3 top-2.5 text-slate-400 cursor-pointer">{verClaveUsr ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
            <input type={verClaveUsr ? 'text' : 'password'} autoComplete="new-password" placeholder="Repetí la contraseña nueva" value={claveUsrRep} onChange={(e) => setClaveUsrRep(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" required />
            <p className="text-[11px] text-slate-500">La persona va a tener que usar esta contraseña la próxima vez que entre. Si tiene la sesión abierta, sigue adentro hasta que salga.</p>
            <div className="flex gap-2 pt-2 border-t">
              <button type="button" onClick={() => setClaveDeUsr(null)} className="flex-1 py-2.5 bg-white border rounded-xl text-xs font-semibold cursor-pointer">Cancelar</button>
              <button type="submit" disabled={guardandoClaveUsr} className="flex-1 py-2.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60">{guardandoClaveUsr ? 'Guardando...' : 'Cambiar contraseña'}</button>
            </div>
          </form>
        </div>
      )}

      {/* PIE: Resumen Papel (admin y coordinador) + interruptores y registro de actividad (solo admin) */}
      <div className="flex flex-wrap justify-end items-center gap-3 mt-8">
        <button onClick={abrirResumenPapel} className="px-4 py-2.5 text-sm font-bold bg-[#6B1D2F] hover:opacity-90 text-white rounded-xl shadow-md flex items-center gap-2 cursor-pointer">
          <FileText className="w-4 h-4" /> Resumen Papel
        </button>
      {perfilStaff?.rol === 'admin' && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-slate-500">WhatsApp</span>
            <button onClick={cambiarWhatsapp} className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${whatsappActivo ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
              {whatsappActivo ? '● Activado' : '○ Desactivado'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-slate-500">Video tutorial</span>
            <button onClick={cambiarVideo} className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${videoActivoAdm ? 'bg-[#6B1D2F] hover:opacity-90 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
              {videoActivoAdm ? '● Visible' : '○ Oculto'}
            </button>
            {videoActivoAdm && <a href={VIDEO_TUTORIAL} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#6B1D2F] underline">probar</a>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-slate-500">Portal: pedir celular</span>
            <button onClick={cambiarVerificarCelular} title="Pide los últimos 4 números del celular cargado para entrar al portal" className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${config.portal_verificar_celular === true ? 'bg-[#6B1D2F] hover:opacity-90 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
              {config.portal_verificar_celular === true ? '● Activado' : '○ Desactivado'}
            </button>
          </div>
          <button onClick={descargarRespaldo} disabled={haciendoRespaldo} className="px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">{haciendoRespaldo ? 'Armando respaldo…' : '💾 Respaldo completo (Excel)'}</button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-slate-500">Tel. coordinación</span>
            <input type="text" value={telCoord} onChange={(e) => setTelCoord(e.target.value)} placeholder="Ej: Martín 2995551234, Laura 2994443322" title="Uno o varios teléfonos separados por coma, con el nombre adelante si querés. Se muestran en la Puerta cuando no hay internet." className="w-72 px-2.5 py-1.5 rounded-xl border text-xs" />
            {(telCoord || '') !== (config.telefono_coordinacion || '') && <button onClick={guardarTelCoord} className="px-3 py-1.5 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold cursor-pointer">Guardar</button>}
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
            {config.escudo && (
              <button onClick={cambiarEscudoActivo} title="Si está desactivado, el escudo no aparece en la página ni en los pases (queda guardado)" className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${config.escudo_activo !== false ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
                {config.escudo_activo !== false ? '● En uso' : '○ No se usa'}
              </button>
            )}
          </div>
          <button
            onClick={() => { setModalLogs(true); recargar(); }}
            className="px-4 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md flex items-center gap-2 cursor-pointer"
          >
            <History className="w-4 h-4" /> Registro de actividad
          </button>
        </>
      )}
      </div>

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
          <button onClick={() => setModalLimpieza(true)} className="px-4 py-2.5 bg-white text-[#6B1D2F] hover:bg-rose-50 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow cursor-pointer">🧹 Preparar para abrir</button>
          <button onClick={reiniciarAsistenciasGeneral} className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow cursor-pointer"><RotateCcw className="w-4 h-4" /> 🔄 Reiniciar Asistencias</button>
          <button onClick={borrarInvitadosEgresados} className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow cursor-pointer"><Trash2 className="w-4 h-4" /> 🗑️ Borrar Invitados</button>
        </div>
      </div>
      )}
    </div>
  );
}

function ReporteResumenPapel({ egresados, invitados, docentes, especiales, config, volver }) {
  const [soloCurso, setSoloCurso] = useState('');
  const egresadosOrdenados = [...egresados].sort((a, b) => claveCurso(a.division).localeCompare(claveCurso(b.division)) || (a.nombre_completo || '').localeCompare(b.nombre_completo || ''));
  const cursos = cursosDe(egresados).filter((c) => !soloCurso || (soloCurso === SIN_CURSO ? !c : c === soloCurso));
  const verTodo = !soloCurso;
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
          {escudoDe(config) && <img src={escudoDe(config)} alt="Escudo" className="w-12 h-12 object-contain" />}
          <div>
            <h2 className="text-xl font-bold text-[#6B1D2F]">ESRN N° 005 — Cipolletti</h2>
            <p className="text-xs text-slate-500">Acto de Colación 2026 · Resumen General para Control en Papel</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {volver && <button onClick={volver} className="px-4 py-2 bg-white border rounded-xl text-xs font-bold cursor-pointer">← Volver a Administración</button>}
          <SelectorCurso egresados={egresados} valor={soloCurso} onChange={setSoloCurso} />
          <button onClick={() => window.print()} className="px-4 py-2 bg-[#6B1D2F] text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"><Printer className="w-4 h-4" /> Imprimir Documento</button>
        </div>
      </div>

      {!verTodo && <p className="text-xs font-bold text-slate-600 print:hidden">Vista de un solo curso: se imprime solo su padrón (sin accesos generales, docentes ni VIP). Elegí "Todos los cursos" para el resumen completo.</p>}
      {verTodo && <>
      <div className="space-y-2 text-xs">
        <h3 className="font-bold text-sm text-[#6B1D2F] uppercase tracking-wide">Accesos a la sala</h3>
        <ul className="list-disc pl-5 space-y-0.5">
          <li><b>Egresados:</b> {ACCESO_TEXTO.egresados.toLowerCase()}.</li>
          <li><b>Familiares de Ciencias Naturales (TM):</b> {ACCESO_TEXTO.abajo.toLowerCase()}.</li>
          <li><b>Familiares de Educación (TT):</b> {ACCESO_TEXTO.arriba.toLowerCase()}.</li>
          <li><b>Docentes y VIP:</b> {ACCESO_TEXTO.abajo.toLowerCase()}.</li>
          <li><b>Familias con alguien con movilidad reducida:</b> todo el grupo {ACCESO_TEXTO.abajo.toLowerCase()}, y las atiende el puesto de Docentes y VIP (ver lista 4).</li>
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

      </>}

      {cursos.map((curso, nCurso) => {
        const delCurso = egresadosOrdenados.filter((e) => (e.division || '') === curso);
        const invCurso = invitados.filter((i) => delCurso.some((e) => e.id === i.egresado_id));
        const ej = delCurso[0];
        return (
          <div key={curso || 'sin'} className="space-y-3" style={verTodo || nCurso > 0 ? { breakBefore: 'page', pageBreakBefore: 'always' } : undefined}>
            <div className="border-2 rounded-xl p-3" style={{ borderColor: colorFamiliaDe(ej) }}>
              <h3 className="font-extrabold text-base" style={{ color: colorFamiliaDe(ej) }}>{verTodo ? `1.${nCurso + 1} · ` : ''}{curso || 'Sin curso cargado'}{ej && etiquetaOrientacion(ej) ? ` · ${etiquetaOrientacion(ej)}` : ''}</h3>
              <p className="text-xs text-slate-700"><b>{delCurso.length}</b> egresados ({delCurso.filter((e) => e.activo === false).length} no asisten) · <b>{invCurso.length}</b> invitados cargados ({invCurso.filter(esGrupal).length} en grupo, {invCurso.filter((i) => !esGrupal(i)).length} individuales{invCurso.some(tieneMovilidad) ? `, ${invCurso.filter(tieneMovilidad).length} con movilidad reducida` : ''})</p>
              <p className="text-xs text-slate-700">Egresados: {ACCESO_TEXTO.egresados.toLowerCase()} · Familias: {accesoFamiliaDe(ej).toLowerCase()}</p>
            </div>
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
                  {delCurso.map((egr) => {
                    const misInv = invitados.filter(i => i.egresado_id === egr.id);
                    return (
                      <React.Fragment key={egr.id}>
                        <tr className="bg-slate-50 font-bold" style={{ breakInside: 'avoid' }}>
                          <td className="p-2 border align-top" colSpan={6}>
                            🎓 {egr.nombre_completo} (DNI: {egr.dni}) · Cel: {egr.celular || 'S/N'}
                            {egr.activo === false ? ' · NO ASISTE' : ''}
                            {familiaConMovilidad(egr) && egr.activo !== false ? ' · ♿ SU FAMILIA ENTRA POR ABAJO (puesto Docentes y VIP)' : ''}
                          </td>
                        </tr>
                        {misInv.length === 0 ? (
                          <tr><td className="p-2 border text-slate-400 italic" colSpan={6}>Sin invitados cargados</td></tr>
                        ) : (
                          misInv.map((inv, idx) => (
                            <tr key={inv.id} className="hover:bg-slate-50/50" style={{ breakInside: 'avoid' }}>
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
        );
      })}

      {verTodo && <>
      <div className="space-y-3 pt-6" style={{ breakBefore: 'page', pageBreakBefore: 'always' }}>
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

      <div className="space-y-3 pt-6" style={{ breakBefore: 'page', pageBreakBefore: 'always' }}>
        <h3 className="font-bold text-sm text-[#6B1D2F] uppercase tracking-wide">4. Familias con movilidad reducida · entran por el acceso de abajo (puesto Docentes y VIP)</h3>
        {(() => {
          const fams = egresadosOrdenados.filter((e) => e.activo !== false && familiaConMovilidad(e));
          if (!fams.length) return <p className="text-xs text-slate-400 italic">No hay familias con movilidad reducida.</p>;
          return (
            <table className="w-full text-left border-collapse text-xs">
              <thead><tr className="bg-amber-50 border-b"><th className="p-2 border">Curso</th><th className="p-2 border">Invitado / Familiar</th><th className="p-2 border">DNI</th><th className="p-2 border text-center">Modalidad</th><th className="p-2 border text-center">Mov. reducida</th><th className="p-2 border text-center">Firma Ingreso</th></tr></thead>
              <tbody>
                {fams.map((egr) => (
                  <React.Fragment key={egr.id}>
                    <tr className="bg-slate-50 font-bold" style={{ breakInside: 'avoid' }}><td className="p-2 border" colSpan={6}>{egr.division || 'Sin curso'} · familia de {egr.nombre_completo} (DNI {egr.dni}) · Cel: {egr.celular || 'S/N'}</td></tr>
                    {invitados.filter((i) => i.egresado_id === egr.id).map((inv) => (
                      <tr key={inv.id} style={{ breakInside: 'avoid' }}><td className="p-2 border text-slate-400">{egr.division || ''}</td><td className="p-2 border font-medium">{inv.nombre_completo}</td><td className="p-2 border font-mono">{inv.dni}</td><td className="p-2 border text-center">{esGrupal(inv) ? 'En grupo' : 'Individual'}</td><td className="p-2 border text-center font-bold">{tieneMovilidad(inv) ? '♿ SÍ' : ''}</td><td className="p-2 border text-center w-28">______</td></tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>
      </>}
    </div>
  );
}
