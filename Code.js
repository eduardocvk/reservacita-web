/**
 * Router principal de la Web App ReservaCita.
 * Gestiona las diferentes vistas según los parámetros de la URL:
 * - (sin parámetros): Vista pública de reserva
 * - ?admin=true: Panel de administración (protegido)
 * - ?cancel=TOKEN: Vista de cancelación
 * - ?reagendar=TOKEN: Vista de reagendamiento
 * - ?servicio=ID: Pre-seleccionar un servicio en la vista pública
 */

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};

  // ─── Ruta: Panel de Administración ───
  if (params.admin === 'true') {
    var adminTemplate = HtmlService.createTemplateFromFile('Index_Admin');
    return adminTemplate.evaluate()
      .setTitle('Admin — ReservaCita Eduardo Callejo')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // ─── Ruta: Cancelación / Reagendamiento ───
  if (params.cancel || params.reagendar) {
    var template = HtmlService.createTemplateFromFile('Index');
    template.initialView = 'cancelar';
    template.token = params.cancel || params.reagendar || '';
    template.mode = params.reagendar ? 'reagendar' : 'cancelar';
    template.preselectedService = '';

    return template.evaluate()
      .setTitle('Gestionar cita — Eduardo Callejo Osteopatía')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // ─── Ruta: Vista Pública de Reserva ───
  var publicTemplate = HtmlService.createTemplateFromFile('Index');
  publicTemplate.initialView = 'reserva';
  publicTemplate.token = '';
  publicTemplate.mode = '';
  publicTemplate.preselectedService = params.servicio || '';

  return publicTemplate.evaluate()
    .setTitle('Reserva tu cita — Eduardo Callejo Osteopatía Madrid')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Incluir archivos HTML parciales dentro de otros archivos HTML.
 * Permite modularizar CSS, JS y vistas en archivos separados.
 * @param {string} filename - Nombre del archivo HTML sin extensión.
 * @return {string} Contenido HTML del archivo.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ─── API REST ───
 * Maneja peticiones POST desde el frontend estático externo (Ej. GitHub Pages).
 */
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var params = payload.params || [];
    var token = payload.token || '';

    // Mapa de métodos y si requieren ser admin
    var apiMethods = {
      // Públicos
      'getConfigPublica': { fn: getConfigPublica, admin: false },
      'getDiasDisponiblesPublico': { fn: getDiasDisponiblesPublico, admin: false },
      'getBloquesDisponiblesPublico': { fn: getBloquesDisponiblesPublico, admin: false },
      'saveCita': { fn: saveCita, admin: false },
      'cancelCitaPublic': { fn: cancelCitaPublic, admin: false },
      'reagendarCitaPublic': { fn: reagendarCitaPublic, admin: false },
      'getCitaInfoByToken': { fn: getCitaInfoByToken, admin: false },
      
      // Admin
      'getAdminPassword': { fn: function() { return getConfigValue('admin_password'); }, admin: false }, // Se expone para login
      'getConfigAdmin': { fn: getConfigAdmin, admin: true },
      'saveConfigAdmin': { fn: saveConfigAdmin, admin: true },
      'getHorarios': { fn: getHorarios, admin: true },
      'saveHorarios': { fn: saveHorarios, admin: true },
      'getExcepciones': { fn: getExcepciones, admin: true },
      'saveExcepciones': { fn: saveExcepciones, admin: true },
      'getServicios': { fn: getServicios, admin: true }, // Se usa en público pero getServicios() privado trae inactivos
      'saveServicios': { fn: saveServicios, admin: true },
      'getCitasTodas': { fn: getCitasTodas, admin: true },
      'getProximasCitas': { fn: getProximasCitas, admin: true },
      'getEstadisticas': { fn: getEstadisticas, admin: true },
      'updateCitaEstado': { fn: updateCitaEstado, admin: true },
      'getClientes': { fn: getClientes, admin: true }
    };

    if (!apiMethods[action]) {
      return responseJSON({ error: 'Acción no encontrada: ' + action }, 404);
    }

    var methodConfig = apiMethods[action];

    // Verificar seguridad
    if (methodConfig.admin) {
      var realToken = getConfigValue('admin_password');
      if (token !== realToken) {
        return responseJSON({ error: 'No autorizado. Contraseña incorrecta.' }, 401);
      }
    }

    // Ejecutar función
    var result = methodConfig.fn.apply(this, params);
    
    return responseJSON({ success: true, data: result }, 200);

  } catch (error) {
    return responseJSON({ error: 'Error del servidor: ' + error.toString() }, 500);
  }
}

/**
 * Devuelve respuesta JSON.
 */
function responseJSON(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
