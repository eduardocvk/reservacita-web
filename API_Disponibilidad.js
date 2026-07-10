/**
 * API_Disponibilidad.js — Algoritmo de cálculo de slots disponibles.
 * El corazón de la app: genera slots de 15 minutos, comprueba calendario,
 * aplica márgenes entre citas y gestiona desplazamientos a domicilio.
 */

/**
 * Obtiene los slots disponibles para una fecha y servicio dados.
 * @param {string} dateString - Fecha en formato YYYY-MM-DD
 * @param {number|string} serviceId - ID del servicio solicitado
 * @return {Array} Array de {hora: "HH:MM", disponible: boolean}
 */
function getAvailableSlots(dateString, serviceId) {
  try {
    var config = getAllConfig();
    var intervalo = parseInt(config.intervalo_slots_minutos) || 15;
    var antelacionMinima = parseInt(config.antelacion_minima_horas) || 24;
    var antelacionMaxima = parseInt(config.antelacion_maxima_dias) || 60;
    var margenConsulta = parseInt(config.margen_entre_citas_consulta) || 15;
    var margenDomicilio = parseInt(config.margen_entre_citas_domicilio) || 30;

    // ─── 1. Validar fecha ───
    var targetDate = new Date(dateString + 'T00:00:00');
    var now = new Date();
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fecha no puede ser pasada
    if (targetDate < today) return [];

    // Fecha no puede exceder antelación máxima
    var maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + antelacionMaxima);
    if (targetDate > maxDate) return [];

    // ─── 2. Obtener servicio ───
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var servicio = servicios.find(function(s) { return s.ID == serviceId; });
    if (!servicio) servicio = servicios[0]; // fallback al primero
    var duracionSesion = parseInt(servicio ? servicio.Duracion_Minutos : config.duracion_sesion_minutos) || 60;
    var tipoServicio = servicio ? servicio.Tipo : 'consulta';

    // ─── 3. Obtener bloques horarios del día ───
    var bloques = getBloquesDia(dateString);
    if (!bloques || bloques.length === 0) return []; // Día cerrado

    // ─── 4. Generar todos los slots posibles ───
    var allSlots = [];
    bloques.forEach(function(bloque) {
      var startMinutes = timeToMinutes(bloque.inicio);
      var endMinutes = timeToMinutes(bloque.fin);

      for (var m = startMinutes; m + duracionSesion <= endMinutes; m += intervalo) {
        allSlots.push({
          hora: minutesToTime(m),
          startMin: m,
          endMin: m + duracionSesion,
          disponible: true
        });
      }
    });

    if (allSlots.length === 0) return [];

    // ─── 5. Obtener eventos del calendario ───
    var calendarEvents = getCalendarEvents(dateString);

    // ─── 6. Obtener citas existentes confirmadas ───
    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var citasDelDia = citas.filter(function(c) {
      var citaFecha = c.Fecha;
      if (citaFecha instanceof Date) citaFecha = Utilities.formatDate(citaFecha, CONFIG.TIMEZONE, 'yyyy-MM-dd');
      else if (typeof citaFecha === 'string' && citaFecha.includes('T')) citaFecha = citaFecha.split('T')[0];
      return citaFecha === dateString && c.Estado === 'confirmada';
    });

    // ─── 7. Marcar slots ocupados ───
    allSlots.forEach(function(slot) {
      // 7a. Comprobar eventos de calendario
      calendarEvents.forEach(function(ev) {
        if (ev.allDay) {
          slot.disponible = false;
          return;
        }
        var evDate = new Date(dateString + 'T00:00:00');
        var evStartMin = getMinutesOfDay(new Date(ev.start));
        var evEndMin = getMinutesOfDay(new Date(ev.end));

        // Hay solapamiento si el slot y el evento se superponen
        if (slot.startMin < evEndMin && slot.endMin > evStartMin) {
          slot.disponible = false;
        }
      });

      // 7b. Comprobar citas existentes + márgenes
      citasDelDia.forEach(function(cita) {
        var citaStart = timeToMinutes(cita.Hora_Inicio);
        var citaEnd = timeToMinutes(cita.Hora_Fin);

        // Margen después de la cita existente
        var margen = cita.Tipo === 'domicilio' ? margenDomicilio : margenConsulta;
        var citaEndConMargen = citaEnd + margen;

        // El slot no puede solaparse con la cita + su margen posterior
        if (slot.startMin < citaEndConMargen && slot.endMin > citaStart) {
          slot.disponible = false;
        }

        // Además, si el servicio solicitado es domicilio, necesitamos margen ANTES
        // para que Eduardo pueda desplazarse
        if (tipoServicio === 'domicilio' && slot.disponible) {
          // Necesitamos margenDomicilio minutos libres antes del slot
          var slotStartConMargen = slot.startMin - margenDomicilio;
          if (slotStartConMargen < citaEnd && slot.startMin > citaStart) {
            slot.disponible = false;
          }
        }
      });

      // 7c. Comprobar antelación mínima
      if (slot.disponible && dateString === Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd')) {
        var slotDateTime = new Date(dateString + 'T' + slot.hora + ':00');
        var minTime = new Date(now.getTime() + antelacionMinima * 60 * 60 * 1000);
        if (slotDateTime < minTime) {
          slot.disponible = false;
        }
      }
    });

    // ─── 8. Devolver slots (sin campos internos) ───
    return allSlots.map(function(s) {
      return { hora: s.hora, disponible: s.disponible };
    });

  } catch (e) {
    console.error('Error en getAvailableSlots: ' + e.toString());
    return [];
  }
}


/**
 * Verificación individual de un slot (doble-check al confirmar).
 */
function checkSlotAvailability(dateString, timeString, serviceId) {
  var slots = getAvailableSlots(dateString, serviceId);
  var slot = slots.find(function(s) { return s.hora === timeString; });
  return slot ? slot.disponible : false;
}


/**
 * Obtiene los bloques horarios de un día específico,
 * teniendo en cuenta excepciones y el horario semanal.
 * @param {string} dateString - Fecha YYYY-MM-DD
 * @return {Array} Array de {inicio: "HH:MM", fin: "HH:MM"} o vacío si cerrado
 */
function getBloquesDia(dateString) {
  // 1. Comprobar excepciones
  var excepciones = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_EXCEPCIONES);
  var excepcion = excepciones.find(function(exc) {
    var excFecha = exc.Fecha;
    if (excFecha instanceof Date) excFecha = Utilities.formatDate(excFecha, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    else if (typeof excFecha === 'string' && excFecha.includes('T')) excFecha = excFecha.split('T')[0];
    return excFecha === dateString;
  });

  if (excepcion) {
    if (excepcion.Tipo === 'cerrado') return []; // Día cerrado
    if (excepcion.Tipo === 'especial') {
      var bloques = [];
      if (excepcion.Hora_Inicio_1 && excepcion.Hora_Fin_1) {
        bloques.push({ inicio: excepcion.Hora_Inicio_1, fin: excepcion.Hora_Fin_1 });
      }
      if (excepcion.Hora_Inicio_2 && excepcion.Hora_Fin_2) {
        bloques.push({ inicio: excepcion.Hora_Inicio_2, fin: excepcion.Hora_Fin_2 });
      }
      return bloques;
    }
  }

  // 2. Horario semanal
  var date = new Date(dateString + 'T12:00:00'); // mediodía para evitar problemas timezone
  var diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var diaNombre = diasSemana[date.getDay()];

  var horarios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_HORARIOS);
  var horario = horarios.find(function(h) { return h.Dia === diaNombre; });

  if (!horario || !(horario.Abierto === true || horario.Abierto === 'TRUE')) return [];

  var bloques = [];
  if (horario.Hora_Inicio_1 && horario.Hora_Fin_1) {
    bloques.push({ inicio: formatTimeValue(horario.Hora_Inicio_1), fin: formatTimeValue(horario.Hora_Fin_1) });
  }
  if (horario.Hora_Inicio_2 && horario.Hora_Fin_2) {
    bloques.push({ inicio: formatTimeValue(horario.Hora_Inicio_2), fin: formatTimeValue(horario.Hora_Fin_2) });
  }

  return bloques;
}


// ═══════════════════════════════════════════════════════════
// HELPERS DE TIEMPO
// ═══════════════════════════════════════════════════════════

/**
 * Convierte "HH:MM" a minutos desde medianoche.
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  var str = formatTimeValue(timeStr);
  var parts = str.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

/**
 * Convierte minutos desde medianoche a "HH:MM".
 */
function minutesToTime(minutes) {
  var h = Math.floor(minutes / 60);
  var m = minutes % 60;
  return h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
}

/**
 * Obtiene los minutos del día de un objeto Date.
 */
function getMinutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Formatea un valor de hora que puede venir como Date, string "HH:MM" o "HH:MM:SS".
 * Devuelve siempre "HH:MM".
 */
function formatTimeValue(value) {
  if (!value) return '00:00';

  if (value instanceof Date) {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, 'HH:mm');
  }

  var str = value.toString().trim();

  // Si viene como "1899-12-30T..." (formato de fecha de Sheets para horas)
  if (str.includes('T') && str.includes('Z')) {
    var d = new Date(str);
    return Utilities.formatDate(d, CONFIG.TIMEZONE, 'HH:mm');
  }

  // Quitar segundos si los tiene
  if (str.match(/^\d{2}:\d{2}:\d{2}$/)) {
    return str.substring(0, 5);
  }

  // Ya es HH:MM
  if (str.match(/^\d{1,2}:\d{2}$/)) {
    var parts = str.split(':');
    return parts[0].padStart(2, '0') + ':' + parts[1];
  }

  return str;
}
