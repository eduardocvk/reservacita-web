/**
 * API_Calendario.js — Integración con Google Calendar.
 * Lectura de disponibilidad desde múltiples calendarios y escritura de citas.
 */

/**
 * Lee eventos de todos los calendarios configurados para una fecha dada.
 * @param {string} dateString - Fecha en formato YYYY-MM-DD
 * @return {Array} Array de eventos con start, end, title, allDay
 */
function getCalendarEvents(dateString) {
  try {
    var config = getAllConfig();
    var calIds = (config.calendarios_disponibilidad || '').split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; });

    if (calIds.length === 0) return [];

    var date = new Date(dateString + 'T00:00:00');
    var startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    var endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    var allEvents = [];

    calIds.forEach(function(calId) {
      try {
        var cal = CalendarApp.getCalendarById(calId);
        if (!cal) {
          console.log('Calendario no encontrado: ' + calId);
          return;
        }

        var events = cal.getEvents(startOfDay, endOfDay);
        events.forEach(function(ev) {
          // Ignorar eventos de todo el día que no bloqueen (ej: cumpleaños)
          // Pero incluir los que sí bloqueen (ej: "Vacaciones")
          allEvents.push({
            title: ev.getTitle(),
            start: ev.getStartTime().getTime(),
            end: ev.getEndTime().getTime(),
            allDay: ev.isAllDayEvent(),
            calendarId: calId
          });
        });
      } catch (e) {
        console.error('Error leyendo calendario ' + calId + ': ' + e.toString());
      }
    });

    return allEvents;
  } catch (e) {
    console.error('Error en getCalendarEvents: ' + e.toString());
    return [];
  }
}

/**
 * Crea un evento en el calendario de citas.
 * @param {Object} citaData - Datos de la cita
 * @return {string} ID del evento creado
 */
function createCalendarEvent(citaData) {
  try {
    var config = getAllConfig();
    var calId = config.calendario_citas;
    if (!calId) {
      console.error('No hay calendario de citas configurado');
      return '';
    }

    var cal = CalendarApp.getCalendarById(calId);
    if (!cal) {
      console.error('Calendario de citas no encontrado: ' + calId);
      return '';
    }

    // Construir fecha/hora
    var startDate = new Date(citaData.Fecha + 'T' + citaData.Hora_Inicio + ':00');
    var endDate = new Date(citaData.Fecha + 'T' + citaData.Hora_Fin + ':00');

    // Título
    var tipoEmoji = citaData.Tipo === 'domicilio' ? '🏠' : '🦴';
    var title = tipoEmoji + ' ' + (citaData.Cliente_Nombre || 'Cliente');

    // Descripción
    var desc = '📋 RESERVA DE CITA\n\n';
    desc += '👤 Cliente: ' + (citaData.Cliente_Nombre || '') + '\n';
    if (citaData.Cliente_Email) desc += '📧 Email: ' + citaData.Cliente_Email + '\n';
    if (citaData.Cliente_Telefono) desc += '📱 Teléfono: ' + citaData.Cliente_Telefono + '\n';
    desc += '🏥 Servicio: ' + (citaData.servicio_nombre || citaData.Servicio_ID) + '\n';
    desc += '📍 Tipo: ' + (citaData.Tipo === 'domicilio' ? 'A domicilio' : 'En consulta') + '\n';
    if (citaData.Cliente_Direccion) desc += '🏠 Dirección: ' + citaData.Cliente_Direccion + '\n';
    if (citaData.Tiempo_Desplazamiento) desc += '🚗 Desplazamiento: ~' + citaData.Tiempo_Desplazamiento + ' min\n';
    if (citaData.Notas) desc += '\n📝 Notas: ' + citaData.Notas + '\n';
    desc += '\n🔗 Creada por: ' + (citaData.Creada_Por || 'cliente');

    // Ubicación
    var location = citaData.Tipo === 'domicilio'
      ? (citaData.Cliente_Direccion || '')
      : (config.direccion_consulta || '');

    // Crear evento
    var event = cal.createEvent(title, startDate, endDate, {
      description: desc,
      location: location
    });

    // Color del evento
    if (citaData.Tipo === 'domicilio') {
      event.setColor(CalendarApp.EventColor.CYAN);
    } else {
      event.setColor(CalendarApp.EventColor.GREEN);
    }

    return event.getId();
  } catch (e) {
    console.error('Error creando evento en calendario: ' + e.toString());
    return '';
  }
}

/**
 * Elimina un evento del calendario de citas.
 * @param {string} eventId - ID del evento a eliminar
 */
function deleteCalendarEvent(eventId) {
  try {
    if (!eventId) return;

    var config = getAllConfig();
    var calId = config.calendario_citas;
    if (!calId) return;

    var cal = CalendarApp.getCalendarById(calId);
    if (!cal) return;

    var event = cal.getEventById(eventId);
    if (event) {
      event.deleteEvent();
    }
  } catch (e) {
    console.error('Error eliminando evento: ' + e.toString());
  }
}

/**
 * Actualiza un evento del calendario.
 * @param {string} eventId - ID del evento
 * @param {Object} newData - Nuevos datos (Fecha, Hora_Inicio, Hora_Fin, etc.)
 */
function updateCalendarEvent(eventId, newData) {
  try {
    if (!eventId) return;

    var config = getAllConfig();
    var calId = config.calendario_citas;
    if (!calId) return;

    var cal = CalendarApp.getCalendarById(calId);
    if (!cal) return;

    var event = cal.getEventById(eventId);
    if (!event) return;

    // Actualizar fecha/hora si se proporcionan
    if (newData.Fecha && newData.Hora_Inicio && newData.Hora_Fin) {
      var startDate = new Date(newData.Fecha + 'T' + newData.Hora_Inicio + ':00');
      var endDate = new Date(newData.Fecha + 'T' + newData.Hora_Fin + ':00');
      event.setTime(startDate, endDate);
    }

    // Actualizar título si se proporciona
    if (newData.Cliente_Nombre) {
      var tipoEmoji = newData.Tipo === 'domicilio' ? '🏠' : '🦴';
      event.setTitle(tipoEmoji + ' ' + newData.Cliente_Nombre);
    }

    // Actualizar ubicación
    if (newData.Cliente_Direccion) {
      event.setLocation(newData.Cliente_Direccion);
    }
  } catch (e) {
    console.error('Error actualizando evento: ' + e.toString());
  }
}
