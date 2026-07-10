/**
 * Triggers.js — Tareas programadas en segundo plano (Cron jobs).
 * Gestión de recordatorios, reseñas y auto-completado de citas pasadas.
 */

/**
 * Instala o reinstala los disparadores (triggers) necesarios.
 * Se llama desde el botón "Instalar triggers" en Ajustes.
 */
function setupTriggers() {
  try {
    // 1. Eliminar triggers existentes para evitar duplicados
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'processHourlyTasks' || 
          triggers[i].getHandlerFunction() === 'processDailyTasks') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    // 2. Crear trigger por hora (para recordatorios 24h y 2h)
    ScriptApp.newTrigger('processHourlyTasks')
      .timeBased()
      .everyHours(1)
      .create();

    // 3. Crear trigger diario a las 20:00 (para auto-completar citas y pedir reseñas)
    ScriptApp.newTrigger('processDailyTasks')
      .timeBased()
      .atHour(20)
      .everyDays(1)
      .create();

    return { success: true };
  } catch (e) {
    console.error('Error configurando triggers: ' + e.toString());
    return { success: false, message: e.toString() };
  }
}

/**
 * Tarea horaria: Busca citas próximas para enviar recordatorios.
 */
function processHourlyTasks() {
  try {
    var config = getAllConfig();
    var recordatorio24hActivo = config.recordatorio_24h_activo === 'true' || config.recordatorio_24h_activo === true;
    var recordatorio2hActivo = config.recordatorio_2h_activo === 'true' || config.recordatorio_2h_activo === true;
    
    // Si ambos están desactivados, no hacer nada
    if (!recordatorio24hActivo && !recordatorio2hActivo) return;

    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var now = new Date();

    // Filtrar solo citas confirmadas futuras
    var citasActivas = citas.filter(function(c) {
      if (c.Estado !== 'confirmada') return false;
      
      var citaDate = new Date(c.Fecha + 'T' + c.Hora_Inicio + ':00');
      return citaDate > now;
    });

    citasActivas.forEach(function(cita) {
      // Enriquecer
      var svc = servicios.find(function(s) { return s.ID == cita.Servicio_ID; });
      cita.servicio_nombre = svc ? svc.Nombre : '';

      var citaDate = new Date(cita.Fecha + 'T' + cita.Hora_Inicio + ':00');
      var horasDiferencia = (citaDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Recordatorio 24h (si falta entre 23 y 24.5 horas y no se ha enviado)
      if (recordatorio24hActivo && (cita.Recordatorio_24h !== 'enviado' && cita.Recordatorio_24h !== true)) {
        if (horasDiferencia > 23 && horasDiferencia <= 24.5) {
          enviarRecordatorio(cita, '24h');
          cita.Recordatorio_24h = 'enviado';
          updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, cita._rowIndex, cita);
        }
      }

      // Recordatorio 2h (si falta entre 1.5 y 2.5 horas y no se ha enviado)
      if (recordatorio2hActivo && (cita.Recordatorio_2h !== 'enviado' && cita.Recordatorio_2h !== true)) {
        if (horasDiferencia > 1.5 && horasDiferencia <= 2.5) {
          enviarRecordatorio(cita, '2h');
          cita.Recordatorio_2h = 'enviado';
          updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, cita._rowIndex, cita);
        }
      }
    });

  } catch (e) {
    console.error('Error en processHourlyTasks: ' + e.toString());
  }
}

/**
 * Tarea diaria (20:00): 
 * 1. Pasa las citas confirmadas del día (o anteriores) a "completada".
 * 2. Envía email de solicitud de reseña.
 */
function processDailyTasks() {
  try {
    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var now = new Date();
    
    // Las citas a procesar son las que su fecha es menor a hoy a medianoche (citas de ayer o antes)
    // O citas de hoy cuya hora de fin ya ha pasado. Para simplificar, procesamos las citas <= HOY
    var hoyStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    
    var citasPasadas = citas.filter(function(c) {
      if (c.Estado !== 'confirmada') return false;
      
      var fechaCita = c.Fecha;
      if (fechaCita instanceof Date) fechaCita = Utilities.formatDate(fechaCita, CONFIG.TIMEZONE, 'yyyy-MM-dd');
      else if (typeof fechaCita === 'string' && fechaCita.includes('T')) fechaCita = fechaCita.split('T')[0];
      
      if (fechaCita < hoyStr) return true; // Días anteriores
      
      if (fechaCita === hoyStr) {
        // Si es hoy, comprobar si ya pasó su hora fin
        var horaFin = c.Hora_Fin || c.Hora_Inicio;
        var citaEnd = new Date(fechaCita + 'T' + horaFin + ':00');
        return now > citaEnd;
      }
      
      return false;
    });

    citasPasadas.forEach(function(cita) {
      // 1. Cambiar estado
      cita.Estado = 'completada';
      updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, cita._rowIndex, cita);
      
      // 2. Enviar solicitud de reseña (si no se ha desactivado y si la URL está configurada)
      // Se podría validar si es su primera cita para no bombardearle, pero por simplicidad se envía
      enviarSolicitudResena(cita);
    });

  } catch (e) {
    console.error('Error en processDailyTasks: ' + e.toString());
  }
}
