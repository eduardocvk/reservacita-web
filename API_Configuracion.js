/**
 * API_Configuracion.js — API para gestionar configuración, horarios, excepciones y servicios.
 * Funciones llamadas desde el frontend admin y público.
 */

// ═══════════════════════════════════════════════════════════
// CONFIGURACIÓN PÚBLICA (para clientes)
// ═══════════════════════════════════════════════════════════

/**
 * Devuelve la configuración visible para clientes + servicios activos.
 */
function getConfigPublica() {
  try {
    var config = getAllConfig();
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var activos = servicios.filter(function(s) { return s.Activo === true || s.Activo === 'TRUE'; });

    return {
      config: {
        nombre_negocio: config.nombre_negocio || '',
        url_logo: config.url_logo || '',
        politica_cancelacion: config.politica_cancelacion || '',
        whatsapp: config.whatsapp || '',
        telefono: config.telefono || ''
      },
      servicios: activos
    };
  } catch (e) {
    return { error: e.toString() };
  }
}


// ═══════════════════════════════════════════════════════════
// CONFIGURACIÓN ADMIN
// ═══════════════════════════════════════════════════════════

/**
 * Devuelve toda la configuración (solo admin).
 */
function getConfigAdmin() {
  try {
    return getAllConfig();
  } catch (e) {
    return { error: e.toString() };
  }
}

/**
 * Guarda la configuración completa desde el panel admin.
 */
function saveConfigAdmin(configData) {
  try {
    setMultipleConfigValues(configData);
    return { success: true };
  } catch (e) {
    return { error: e.toString() };
  }
}


// ═══════════════════════════════════════════════════════════
// HORARIOS
// ═══════════════════════════════════════════════════════════

/**
 * Lee los horarios semanales.
 */
function getHorarios() {
  try {
    var horarios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_HORARIOS);
    horarios.forEach(function(h) {
      if (h.Hora_Inicio_1) h.Hora_Inicio_1 = formatTimeValue(h.Hora_Inicio_1);
      if (h.Hora_Fin_1) h.Hora_Fin_1 = formatTimeValue(h.Hora_Fin_1);
      if (h.Hora_Inicio_2) h.Hora_Inicio_2 = formatTimeValue(h.Hora_Inicio_2);
      if (h.Hora_Fin_2) h.Hora_Fin_2 = formatTimeValue(h.Hora_Fin_2);
    });
    return horarios;
  } catch (e) {
    return [];
  }
}

/**
 * Guarda los horarios semanales completos.
 * Recibe un array de 7 objetos (uno por día).
 */
function saveHorarios(horariosData) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.SHEET_HORARIOS);
    if (!sheet) return { error: 'Pestaña Horarios no encontrada' };

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Limpiar datos existentes (mantener cabeceras)
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    }

    // Escribir nuevos datos
    var rows = horariosData.map(function(h) {
      return headers.map(function(header) {
        return h[header] !== undefined ? h[header] : '';
      });
    });

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }

    return { success: true };
  } catch (e) {
    return { error: e.toString() };
  }
}


// ═══════════════════════════════════════════════════════════
// EXCEPCIONES
// ═══════════════════════════════════════════════════════════

/**
 * Lee las excepciones de horario.
 */
function getExcepciones() {
  try {
    var data = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_EXCEPCIONES);
    // Formatear fechas como string YYYY-MM-DD
    data.forEach(function(exc) {
      exc.Fecha = app_normalizarFecha(exc.Fecha);
      if (exc.Hora_Inicio_1) exc.Hora_Inicio_1 = formatTimeValue(exc.Hora_Inicio_1);
      if (exc.Hora_Fin_1) exc.Hora_Fin_1 = formatTimeValue(exc.Hora_Fin_1);
      if (exc.Hora_Inicio_2) exc.Hora_Inicio_2 = formatTimeValue(exc.Hora_Inicio_2);
      if (exc.Hora_Fin_2) exc.Hora_Fin_2 = formatTimeValue(exc.Hora_Fin_2);
    });
    return data;
  } catch (e) {
    return [];
  }
}

/**
 * Añade una nueva excepción.
 */
function addExcepcion(excData) {
  try {
    if (!excData || !/^\d{4}-\d{2}-\d{2}$/.test(excData.Fecha || '')) {
      return { success: false, message: 'La fecha no es válida.' };
    }

    var tiposValidos = ['cerrado', 'bloqueo', 'especial'];
    if (tiposValidos.indexOf(excData.Tipo) === -1) {
      return { success: false, message: 'El tipo de excepción no es válido.' };
    }

    if (excData.Tipo === 'bloqueo' || excData.Tipo === 'especial') {
      excData.Hora_Inicio_1 = formatTimeValue(excData.Hora_Inicio_1);
      excData.Hora_Fin_1 = formatTimeValue(excData.Hora_Fin_1);
      if (timeToMinutes(excData.Hora_Inicio_1) >= timeToMinutes(excData.Hora_Fin_1)) {
        return { success: false, message: 'La hora de fin debe ser posterior a la de inicio.' };
      }
    } else {
      excData.Hora_Inicio_1 = '';
      excData.Hora_Fin_1 = '';
    }

    insertRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_EXCEPCIONES, excData);
    return { success: true };
  } catch (e) {
    return { error: e.toString() };
  }
}

/**
 * Elimina una excepción por índice de fila.
 */
function deleteExcepcion(rowIndex) {
  try {
    deleteRow(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_EXCEPCIONES, rowIndex);
    return { success: true };
  } catch (e) {
    return { error: e.toString() };
  }
}

/** Actualiza una excepción existente (usado por el calendario interactivo). */
function updateExcepcion(rowIndex, excData) {
  try {
    if (!rowIndex || !excData || !/^\d{4}-\d{2}-\d{2}$/.test(excData.Fecha || '')) {
      return { success: false, message: 'Datos de bloqueo no válidos.' };
    }
    if (excData.Tipo === 'bloqueo' || excData.Tipo === 'especial') {
      excData.Hora_Inicio_1 = formatTimeValue(excData.Hora_Inicio_1);
      excData.Hora_Fin_1 = formatTimeValue(excData.Hora_Fin_1);
      if (timeToMinutes(excData.Hora_Inicio_1) >= timeToMinutes(excData.Hora_Fin_1)) {
        return { success: false, message: 'La hora de fin debe ser posterior a la de inicio.' };
      }
    }
    updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_EXCEPCIONES, Number(rowIndex), excData);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Bloquea un rango de fechas creando excepciones de tipo "cerrado" para cada día.
 */
function bloquearRangoFechas(fechaInicioStr, fechaFinStr, motivo) {
  try {
    var inicio = app_crearFechaCalendario(fechaInicioStr);
    var fin = app_crearFechaCalendario(fechaFinStr);
    var count = 0;

    var current = new Date(inicio);
    while (current <= fin) {
      var fechaStr = app_normalizarFecha(current);
      insertRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_EXCEPCIONES, {
        Fecha: fechaStr,
        Tipo: 'cerrado',
        Hora_Inicio_1: '',
        Hora_Fin_1: '',
        Hora_Inicio_2: '',
        Hora_Fin_2: '',
        Motivo: motivo || 'Bloqueo de rango'
      });
      count++;
      current.setDate(current.getDate() + 1);
    }

    return { success: true, dias: count };
  } catch (e) {
    return { error: e.toString() };
  }
}


// ═══════════════════════════════════════════════════════════
// SERVICIOS
// ═══════════════════════════════════════════════════════════

/**
 * Lee todos los servicios.
 */
function getServicios() {
  try {
    return getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
  } catch (e) {
    return [];
  }
}

/**
 * Crea o edita un servicio.
 * Si tiene ID existente, actualiza; si no, crea nuevo.
 */
function saveServicio(servicioData) {
  try {
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);

    if (servicioData.ID) {
      // Buscar servicio existente
      var existing = servicios.find(function(s) { return s.ID == servicioData.ID; });
      if (existing) {
        // Actualizar
        servicioData._rowIndex = existing._rowIndex;
        updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS, existing._rowIndex, servicioData);
        return { success: true };
      }
    }

    // Crear nuevo — generar ID
    var maxId = 0;
    servicios.forEach(function(s) {
      var id = parseInt(s.ID);
      if (id > maxId) maxId = id;
    });
    servicioData.ID = maxId + 1;

    insertRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS, servicioData);
    return { success: true };
  } catch (e) {
    return { error: e.toString() };
  }
}

/**
 * Activa o desactiva un servicio.
 */
function toggleServicio(servicioId, activo) {
  try {
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var svc = servicios.find(function(s) { return s.ID == servicioId; });
    if (!svc) return { error: 'Servicio no encontrado' };

    svc.Activo = activo;
    updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS, svc._rowIndex, svc);
    return { success: true };
  } catch (e) {
    return { error: e.toString() };
  }
}


// ═══════════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════════

/**
 * Lee todos los clientes.
 */
function getClientes() {
  try {
    return getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CLIENTES);
  } catch (e) {
    return [];
  }
}

/**
 * Obtiene las citas de un cliente por email.
 */
function getCitasPorCliente(email) {
  try {
    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);

    var clienteCitas = citas.filter(function(c) {
      return c.Cliente_Email && c.Cliente_Email.toString().toLowerCase().trim() === email.toLowerCase().trim();
    });

    // Enriquecer con nombre de servicio
    clienteCitas.forEach(function(c) {
      var svc = servicios.find(function(s) { return s.ID == c.Servicio_ID; });
      c.servicio_nombre = svc ? svc.Nombre : '';

      // Formatear fecha
      c.Fecha = app_normalizarFecha(c.Fecha);
    });

    // Ordenar por fecha descendente
    clienteCitas.sort(function(a, b) { return b.Fecha > a.Fecha ? 1 : -1; });

    return clienteCitas;
  } catch (e) {
    return [];
  }
}

/**
 * Actualiza o crea un registro de cliente.
 * Se llama automáticamente al crear una reserva.
 */
function upsertCliente(nombre, email, telefono, direccion) {
  if (!email) return; // Sin email no guardamos en Clientes

  try {
    var clientes = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CLIENTES);
    var existing = clientes.find(function(c) {
      return c.Email && c.Email.toString().toLowerCase().trim() === email.toLowerCase().trim();
    });

    var hoy = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');

    if (existing) {
      // Actualizar
      existing.Nombre = nombre || existing.Nombre;
      existing.Telefono = telefono || existing.Telefono;
      existing.Direccion = direccion || existing.Direccion;
      existing.Num_Citas = (parseInt(existing.Num_Citas) || 0) + 1;
      existing.Ultima_Cita = hoy;
      updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CLIENTES, existing._rowIndex, existing);
    } else {
      // Crear nuevo
      insertRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CLIENTES, {
        Email: email,
        Nombre: nombre,
        Telefono: telefono,
        Direccion: direccion,
        Num_Citas: 1,
        Ultima_Cita: hoy,
        Fecha_Registro: hoy
      });
    }
  } catch (e) {
    console.error('Error actualizando cliente: ' + e.toString());
  }
}

// ═══════════════════════════════════════════════════════════
// ELIMINACIÓN (BORRADO)
// ═══════════════════════════════════════════════════════════

/**
 * Elimina un servicio por su número de fila.
 */
function deleteServicioAdmin(rowIndex) {
  try {
    deleteRow(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS, rowIndex);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Elimina un cliente por su número de fila.
 */
function deleteClienteAdmin(rowIndex) {
  try {
    deleteRow(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CLIENTES, rowIndex);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}
