/**
 * DB_Utils.js — Utilidades para interactuar con Google Sheets.
 * Incluye CRUD genérico y función para generar la estructura completa de la hoja.
 */

// ═══════════════════════════════════════════════════════════
// CRUD GENÉRICO
// ═══════════════════════════════════════════════════════════
/**
 * Convierte una fecha de Sheets o de la API a su día de calendario en la
 * zona horaria de la aplicación. No se debe usar `split('T')[0]`: Sheets
 * serializa una fecha local a UTC y, en España, ese valor puede pertenecer
 * al día anterior.
 */
function app_normalizarFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return '';

  var texto = String(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

  var fecha = valor instanceof Date ? valor : new Date(texto);
  if (isNaN(fecha.getTime())) return texto;
  return Utilities.formatDate(fecha, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/** Crea una fecha a mediodía UTC para operar con días sin desfases horarios. */
function app_crearFechaCalendario(fechaTexto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTexto || '')) {
    throw new Error('Fecha no válida: ' + fechaTexto);
  }
  var partes = fechaTexto.split('-');
  return new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]), 12));
}


/**
 * Lee todos los datos de una hoja y los devuelve como un array de objetos JSON
 * donde las claves son los nombres de las columnas (fila 1).
 */
function getSheetDataAsJson(spreadsheetId, sheetName) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    var isEmpty = true;
    for (var j = 0; j < headers.length; j++) {
      if (row[j] !== "") isEmpty = false;
      obj[headers[j]] = row[j];
    }
    if (!isEmpty) {
      obj._rowIndex = i + 1;
      result.push(obj);
    }
  }

  return JSON.parse(JSON.stringify(result));
}

/**
 * Inserta una nueva fila al final de la hoja.
 */
function insertRowData(spreadsheetId, sheetName, dataObj) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Pestaña "' + sheetName + '" no encontrada.');

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var newRow = [];
  for (var i = 0; i < headers.length; i++) {
    newRow.push(dataObj[headers[i]] !== undefined ? dataObj[headers[i]] : "");
  }

  sheet.appendRow(newRow);
  return true;
}

/**
 * Actualiza una fila existente basándose en el _rowIndex.
 */
function updateRowData(spreadsheetId, sheetName, rowIndex, dataObj) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Pestaña "' + sheetName + '" no encontrada.');

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  var updateArray = [];
  for (var i = 0; i < headers.length; i++) {
    updateArray.push(dataObj[headers[i]] !== undefined ? dataObj[headers[i]] : "");
  }

  sheet.getRange(rowIndex, 1, 1, updateArray.length).setValues([updateArray]);
  return true;
}

/**
 * Elimina una fila por su índice.
 */
function deleteRow(spreadsheetId, sheetName, rowIndex) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Pestaña "' + sheetName + '" no encontrada.');
  sheet.deleteRow(rowIndex);
  return true;
}


// ═══════════════════════════════════════════════════════════
// CONFIGURACIÓN CLAVE-VALOR
// ═══════════════════════════════════════════════════════════

/**
 * Lee toda la configuración de la pestaña Configuracion como un objeto {clave: valor}.
 */
function getAllConfig() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_CONFIGURACION);
  if (!sheet) return {};

  var data = sheet.getDataRange().getValues();
  var config = {};

  for (var i = 1; i < data.length; i++) {
    var key = data[i][0];
    var value = data[i][1];
    if (key) config[key.toString().trim()] = value !== undefined ? value.toString() : '';
  }

  return config;
}

/**
 * Lee un valor de configuración por clave.
 */
function getConfigValue(key) {
  var config = getAllConfig();
  return config[key] || '';
}

/**
 * Establece un valor de configuración. Si la clave existe, la actualiza; si no, la añade.
 */
function setConfigValue(key, value) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_CONFIGURACION);
  if (!sheet) return false;

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return true;
    }
  }

  // No existe, añadir
  sheet.appendRow([key, value]);
  return true;
}

/**
 * Guarda múltiples valores de configuración.
 */
function setMultipleConfigValues(configObj) {
  for (var key in configObj) {
    setConfigValue(key, configObj[key]);
  }
  return true;
}


// ═══════════════════════════════════════════════════════════
// GENERADOR DE ESTRUCTURA DE LA HOJA DE CÁLCULO
// ═══════════════════════════════════════════════════════════

/**
 * Crea todas las pestañas necesarias con cabeceras y datos por defecto.
 * Si una pestaña ya existe, NO la sobrescribe.
 */
function generarEstructuraHoja() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var creadas = [];
    var existentes = [];

    // ─── Pestaña: Configuracion ───
    var configSheet = ss.getSheetByName(CONFIG.SHEET_CONFIGURACION);
    if (!configSheet) {
      configSheet = ss.insertSheet(CONFIG.SHEET_CONFIGURACION);
      configSheet.getRange(1, 1, 1, 2).setValues([['Clave', 'Valor']]);
      configSheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#E8F5F3');

      // Insertar valores por defecto
      var defaults = CONFIG.DEFAULTS;
      var rows = [];
      for (var key in defaults) {
        rows.push([key, defaults[key]]);
      }
      if (rows.length > 0) {
        configSheet.getRange(2, 1, rows.length, 2).setValues(rows);
      }

      // Ajustar columnas
      configSheet.setColumnWidth(1, 280);
      configSheet.setColumnWidth(2, 500);
      creadas.push(CONFIG.SHEET_CONFIGURACION);
    } else {
      existentes.push(CONFIG.SHEET_CONFIGURACION);
    }

    // ─── Pestaña: Horarios ───
    var horariosSheet = ss.getSheetByName(CONFIG.SHEET_HORARIOS);
    if (!horariosSheet) {
      horariosSheet = ss.insertSheet(CONFIG.SHEET_HORARIOS);
      var horariosHeaders = ['Dia', 'Abierto', 'Hora_Inicio_1', 'Hora_Fin_1', 'Hora_Inicio_2', 'Hora_Fin_2'];
      horariosSheet.getRange(1, 1, 1, horariosHeaders.length).setValues([horariosHeaders]);
      horariosSheet.getRange(1, 1, 1, horariosHeaders.length).setFontWeight('bold').setBackground('#E8F5F3');

      // Valores por defecto
      var horariosDefaults = [
        ['Lunes',     true,  '09:00', '14:00', '16:00', '20:00'],
        ['Martes',    true,  '09:00', '14:00', '16:00', '20:00'],
        ['Miércoles', true,  '09:00', '14:00', '16:00', '20:00'],
        ['Jueves',    true,  '09:00', '14:00', '16:00', '20:00'],
        ['Viernes',   false, '',      '',      '',      ''],
        ['Sábado',    false, '',      '',      '',      ''],
        ['Domingo',   false, '',      '',      '',      '']
      ];
      horariosSheet.getRange(2, 1, horariosDefaults.length, horariosHeaders.length).setValues(horariosDefaults);
      creadas.push(CONFIG.SHEET_HORARIOS);
    } else {
      existentes.push(CONFIG.SHEET_HORARIOS);
    }

    // ─── Pestaña: Excepciones ───
    var excSheet = ss.getSheetByName(CONFIG.SHEET_EXCEPCIONES);
    if (!excSheet) {
      excSheet = ss.insertSheet(CONFIG.SHEET_EXCEPCIONES);
      var excHeaders = ['Fecha', 'Tipo', 'Hora_Inicio_1', 'Hora_Fin_1', 'Hora_Inicio_2', 'Hora_Fin_2', 'Motivo'];
      excSheet.getRange(1, 1, 1, excHeaders.length).setValues([excHeaders]);
      excSheet.getRange(1, 1, 1, excHeaders.length).setFontWeight('bold').setBackground('#E8F5F3');
      creadas.push(CONFIG.SHEET_EXCEPCIONES);
    } else {
      existentes.push(CONFIG.SHEET_EXCEPCIONES);
    }

    // ─── Pestaña: Servicios ───
    var svcSheet = ss.getSheetByName(CONFIG.SHEET_SERVICIOS);
    if (!svcSheet) {
      svcSheet = ss.insertSheet(CONFIG.SHEET_SERVICIOS);
      var svcHeaders = ['ID', 'Nombre', 'Descripcion', 'Duracion_Minutos', 'Tipo', 'Precio', 'Activo'];
      svcSheet.getRange(1, 1, 1, svcHeaders.length).setValues([svcHeaders]);
      svcSheet.getRange(1, 1, 1, svcHeaders.length).setFontWeight('bold').setBackground('#E8F5F3');

      // Servicios por defecto
      var svcDefaults = [
        [1, 'Sesión de osteopatía', 'Tratamiento personalizado de osteopatía en consulta', 60, 'consulta', 40, true],
        [2, 'Osteopatía a domicilio', 'Sesión de osteopatía en tu domicilio', 60, 'domicilio', 45, true]
      ];
      svcSheet.getRange(2, 1, svcDefaults.length, svcHeaders.length).setValues(svcDefaults);
      creadas.push(CONFIG.SHEET_SERVICIOS);
    } else {
      existentes.push(CONFIG.SHEET_SERVICIOS);
    }

    // ─── Pestaña: Citas ───
    var citasSheet = ss.getSheetByName(CONFIG.SHEET_CITAS);
    if (!citasSheet) {
      citasSheet = ss.insertSheet(CONFIG.SHEET_CITAS);
      var citasHeaders = [
        'ID', 'Fecha', 'Hora_Inicio', 'Hora_Fin', 'Servicio_ID', 'Tipo', 'Estado',
        'Cliente_Nombre', 'Cliente_Email', 'Cliente_Telefono', 'Cliente_Direccion',
        'Tiempo_Desplazamiento', 'Token_Cancelacion', 'Fecha_Creacion', 'Notas',
        'Calendar_Event_ID', 'Recordatorio_24h', 'Recordatorio_2h', 'Creada_Por'
      ];
      citasSheet.getRange(1, 1, 1, citasHeaders.length).setValues([citasHeaders]);
      citasSheet.getRange(1, 1, 1, citasHeaders.length).setFontWeight('bold').setBackground('#E8F5F3');
      creadas.push(CONFIG.SHEET_CITAS);
    } else {
      existentes.push(CONFIG.SHEET_CITAS);
    }

    // ─── Pestaña: Clientes ───
    var clientesSheet = ss.getSheetByName(CONFIG.SHEET_CLIENTES);
    if (!clientesSheet) {
      clientesSheet = ss.insertSheet(CONFIG.SHEET_CLIENTES);
      var clientesHeaders = ['Email', 'Nombre', 'Telefono', 'Direccion', 'Num_Citas', 'Ultima_Cita', 'Fecha_Registro'];
      clientesSheet.getRange(1, 1, 1, clientesHeaders.length).setValues([clientesHeaders]);
      clientesSheet.getRange(1, 1, 1, clientesHeaders.length).setFontWeight('bold').setBackground('#E8F5F3');
      creadas.push(CONFIG.SHEET_CLIENTES);
    } else {
      existentes.push(CONFIG.SHEET_CLIENTES);
    }

    var message = '';
    if (creadas.length > 0) message += 'Pestañas creadas: ' + creadas.join(', ') + '. ';
    if (existentes.length > 0) message += 'Ya existían: ' + existentes.join(', ') + '.';

    return { success: true, message: message, creadas: creadas, existentes: existentes };

  } catch (e) {
    return { success: false, message: 'Error: ' + e.toString() };
  }
}

// ═══════════════════════════════════════════════════════════
// AUTENTICACIÓN ADMIN
// ═══════════════════════════════════════════════════════════

/**
 * Verifica la contraseña del administrador y devuelve el token de sesión.
 */
function loginAdmin(password) {
  var currentPassword = getConfigValue('admin_password');
  // Si no está configurada, permitir admin123 o la configurada
  if (!currentPassword) currentPassword = 'admin';

  if (password === currentPassword) {
    return { success: true, token: currentPassword };
  } else {
    return { success: false, message: 'Contraseña incorrecta' };
  }
}
