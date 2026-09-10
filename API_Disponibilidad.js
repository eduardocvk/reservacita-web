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
function getAvailableSlots(dateString, serviceId, availabilityContext) {
  try {
    var context = availabilityContext || {};
    var config = context.config || getAllConfig();
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
    var servicios = context.servicios || getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var servicio = servicios.find(function(s) { return s.ID == serviceId; });
    if (!servicio) servicio = servicios[0]; // fallback al primero
    var duracionSesion = parseInt(servicio ? servicio.Duracion_Minutos : config.duracion_sesion_minutos) || 60;
    var tipoServicio = servicio ? servicio.Tipo : 'consulta';
    var margenServicioSolicitado = tipoServicio === 'domicilio' ? margenDomicilio : margenConsulta;

    // ─── 3. Obtener bloques horarios del día ───
    var bloques = getBloquesDia(dateString, context);
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
    var dayStart = new Date(dateString + 'T00:00:00').getTime();
    var dayEndDate = new Date(dayStart);
    dayEndDate.setDate(dayEndDate.getDate() + 1);
    var dayEnd = dayEndDate.getTime();
    var calendarEvents = context.calendarEvents
      ? context.calendarEvents.filter(function(ev) { return ev.start < dayEnd && ev.end > dayStart; })
      : getCalendarEvents(dateString);

    // ─── 6. Obtener citas existentes confirmadas ───
    var citas = context.citas || getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var citasDelDia = citas.filter(function(c) {
      var citaFecha = c.Fecha;
      citaFecha = app_normalizarFecha(citaFecha);
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

        // Los eventos de Calendar también deben respetar el margen configurado.
        // Se amplía el candidato por ambos lados para impedir reservar pegado
        // tanto antes como después de un evento ya existente.
        if (slot.startMin - margenServicioSolicitado < evEndMin &&
            slot.endMin + margenServicioSolicitado > evStartMin) {
          slot.disponible = false;
        }
      });

      // 7b. Comprobar citas existentes + márgenes
      citasDelDia.forEach(function(cita) {
        var citaStart = timeToMinutes(cita.Hora_Inicio);
        var citaEnd = timeToMinutes(cita.Hora_Fin);
        
        // Fallback robusto por si falta la columna Hora_Fin o está vacía en citas antiguas
        if (citaEnd <= citaStart) {
          citaEnd = citaStart + (parseInt(config.duracion_sesion_minutos) || 60);
        }

        // Margen después de la cita existente
        var margen = margenConsulta;
        if (cita.Tipo === 'domicilio') {
          var tiempoDesp = parseInt(cita.Tiempo_Desplazamiento) || 0;
          margen = Math.max(margenDomicilio, tiempoDesp);
        }
        var citaEndConMargen = citaEnd + margen;

        // Comprobar ambas direcciones del margen:
        // - si la cita existente va antes, se aplica su margen posterior;
        // - si el slot solicitado va antes, se aplica el margen del nuevo servicio.
        if (slot.startMin < citaEndConMargen &&
            slot.endMin + margenServicioSolicitado > citaStart) {
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

  } catch (error) {
    console.error("Error getAvailableSlots: ", error);
    // Para debuggear, devolvemos el error como un slot falso o lanzamos
    return [{hora: "ERROR: " + error.toString(), disponible: false}];
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
 * Indica qué días de un mes conservan al menos un hueco disponible.
 * El mes usa la numeración de JavaScript (0 = enero, 11 = diciembre).
 */
function getMonthAvailability(year, month, serviceId) {
  year = parseInt(year, 10);
  month = parseInt(month, 10);
  if (!isFinite(year) || month < 0 || month > 11) {
    throw new Error('Mes no válido.');
  }

  var result = {};
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var monthStart = year + '-' + String(month + 1).padStart(2, '0') + '-01';
  var nextMonthDate = new Date(year, month + 1, 1);
  var nextMonthStart = nextMonthDate.getFullYear() + '-' + String(nextMonthDate.getMonth() + 1).padStart(2, '0') + '-01';
  var context = {
    config: getAllConfig(),
    servicios: getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS),
    citas: getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS),
    excepciones: getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_EXCEPCIONES),
    horarios: getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_HORARIOS),
    calendarEvents: getCalendarEventsRange(monthStart, nextMonthStart)
  };
  for (var day = 1; day <= daysInMonth; day++) {
    var dateString = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var slots = getAvailableSlots(dateString, serviceId, context);
    result[dateString] = slots.some(function(slot) { return slot.disponible === true; });
  }
  return result;
}


/**
 * Obtiene los bloques horarios de un día específico,
 * teniendo en cuenta excepciones y el horario semanal.
 * @param {string} dateString - Fecha YYYY-MM-DD
 * @return {Array} Array de {inicio: "HH:MM", fin: "HH:MM"} o vacío si cerrado
 */
function getBloquesDia(dateString, availabilityContext) {
  var context = availabilityContext || {};
  // 1. Obtener todas las excepciones del día. Puede haber varios bloqueos
  // parciales, pero un cierre completo siempre tiene prioridad.
  var excepciones = context.excepciones || getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_EXCEPCIONES);
  var excepcionesDia = excepciones.filter(function(exc) {
    return app_normalizarFecha(exc.Fecha) === dateString;
  });

  if (excepcionesDia.some(function(exc) { return exc.Tipo === 'cerrado'; })) return [];

  // 2. Horario semanal
  var date = new Date(dateString + 'T12:00:00'); // mediodía para evitar problemas timezone
  var diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var diaNombre = diasSemana[date.getDay()];

  var horarios = context.horarios || getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_HORARIOS);
  var horario = horarios.find(function(h) { return h.Dia === diaNombre; });
  var especial = excepcionesDia.find(function(exc) { return exc.Tipo === 'especial'; });

  if ((!horario || !(horario.Abierto === true || horario.Abierto === 'TRUE')) && !especial) return [];

  var bloques = [];
  if (horario && horario.Hora_Inicio_1 && horario.Hora_Fin_1) {
    bloques.push({ inicio: formatTimeValue(horario.Hora_Inicio_1), fin: formatTimeValue(horario.Hora_Fin_1) });
  }
  if (horario && horario.Hora_Inicio_2 && horario.Hora_Fin_2) {
    bloques.push({ inicio: formatTimeValue(horario.Hora_Inicio_2), fin: formatTimeValue(horario.Hora_Fin_2) });
  }

  // Un horario especial sustituye el horario semanal de ese día.
  if (especial) {
    bloques = [];
    if (especial.Hora_Inicio_1 && especial.Hora_Fin_1) {
      bloques.push({ inicio: formatTimeValue(especial.Hora_Inicio_1), fin: formatTimeValue(especial.Hora_Fin_1) });
    }
    if (especial.Hora_Inicio_2 && especial.Hora_Fin_2) {
      bloques.push({ inicio: formatTimeValue(especial.Hora_Inicio_2), fin: formatTimeValue(especial.Hora_Fin_2) });
    }
  }

  // Los bloqueos parciales recortan el horario disponible sin alterar el resto.
  excepcionesDia.filter(function(exc) { return exc.Tipo === 'bloqueo'; }).forEach(function(exc) {
    var bloqueoInicio = timeToMinutes(exc.Hora_Inicio_1);
    var bloqueoFin = timeToMinutes(exc.Hora_Fin_1);
    var restantes = [];

    bloques.forEach(function(bloque) {
      var inicio = timeToMinutes(bloque.inicio);
      var fin = timeToMinutes(bloque.fin);
      if (bloqueoFin <= inicio || bloqueoInicio >= fin) {
        restantes.push(bloque);
        return;
      }
      if (bloqueoInicio > inicio) {
        restantes.push({ inicio: minutesToTime(inicio), fin: minutesToTime(Math.min(bloqueoInicio, fin)) });
      }
      if (bloqueoFin < fin) {
        restantes.push({ inicio: minutesToTime(Math.max(bloqueoFin, inicio)), fin: minutesToTime(fin) });
      }
    });
    bloques = restantes;
  });

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
