/**
 * API_Reservas.js — Gestión completa de citas: crear, cancelar, reagendar.
 * Orquesta Calendar, Sheets, Maps y Email.
 */

// ═══════════════════════════════════════════════════════════
// CREAR RESERVA (CLIENTE)
// ═══════════════════════════════════════════════════════════

/**
 * Crea una nueva reserva desde la vista pública.
 * @param {Object} datos - {servicio_id, fecha, hora, nombre, email, telefono, direccion, notas}
 */
function crearReserva(datos) {
  try {
    // 1. Validar datos obligatorios
    if (!datos.servicio_id || !datos.fecha || !datos.hora || !datos.nombre || !datos.email || !datos.telefono) {
      return { success: false, message: 'Faltan datos obligatorios.' };
    }

    // 2. Doble-check disponibilidad
    var disponible = checkSlotAvailability(datos.fecha, datos.hora, datos.servicio_id);
    if (!disponible) {
      return { success: false, message: 'Lo sentimos, ese horario ya no está disponible. Por favor, elige otro.' };
    }

    // 3. Obtener servicio
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var servicio = servicios.find(function(s) { return s.ID == datos.servicio_id; });
    if (!servicio) return { success: false, message: 'Servicio no encontrado.' };

    var duracion = parseInt(servicio.Duracion_Minutos) || 60;
    var horaFin = minutesToTime(timeToMinutes(datos.hora) + duracion);

    // 4. Calcular desplazamiento si es a domicilio
    var tiempoDesplazamiento = '';
    if (servicio.Tipo === 'domicilio' && datos.direccion) {
      var config = getAllConfig();
      var origen = config.direccion_consulta || 'Plaza Santa Cristina 4, Madrid';
      tiempoDesplazamiento = calcularTiempoDesplazamiento(origen, datos.direccion);
    }

    // 5. Generar token de cancelación
    var token = Utilities.getUuid();

    // 6. Generar ID de cita
    var citaId = 'C' + new Date().getTime().toString(36).toUpperCase();

    // 7. Preparar datos de la cita
    var citaData = {
      ID: citaId,
      Fecha: datos.fecha,
      Hora_Inicio: datos.hora,
      Hora_Fin: horaFin,
      Servicio_ID: datos.servicio_id,
      Tipo: servicio.Tipo,
      Estado: 'confirmada',
      Cliente_Nombre: datos.nombre,
      Cliente_Email: datos.email,
      Cliente_Telefono: datos.telefono,
      Cliente_Direccion: datos.direccion || '',
      Tiempo_Desplazamiento: tiempoDesplazamiento,
      Token_Cancelacion: token,
      Fecha_Creacion: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm'),
      Notas: datos.notas || '',
      Calendar_Event_ID: '',
      Recordatorio_24h: '',
      Recordatorio_2h: '',
      Creada_Por: 'cliente'
    };

    // Enriquecer con nombre de servicio (para emails)
    citaData.servicio_nombre = servicio.Nombre;
    citaData.precio = servicio.Precio;

    // 8. Insertar en Sheets
    insertRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, citaData);

    // 9. Crear evento en Google Calendar
    var eventId = createCalendarEvent(citaData);
    if (eventId) {
      // Actualizar el registro con el eventId
      var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
      var citaRow = citas.find(function(c) { return c.ID === citaId; });
      if (citaRow) {
        citaRow.Calendar_Event_ID = eventId;
        updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, citaRow._rowIndex, citaRow);
      }
    }

    // 10. Actualizar/crear registro de cliente
    upsertCliente(datos.nombre, datos.email, datos.telefono, datos.direccion);

    // 11. Enviar emails
    enviarConfirmacionCliente(citaData);
    enviarNotificacionAdmin(citaData, 'nueva_cita');

    return { success: true, citaId: citaId };

  } catch (e) {
    console.error('Error creando reserva: ' + e.toString());
    return { success: false, message: 'Error interno: ' + e.toString() };
  }
}


// ═══════════════════════════════════════════════════════════
// CREAR RESERVA MANUAL (ADMIN)
// ═══════════════════════════════════════════════════════════

/**
 * Crea una cita manual desde el panel admin.
 * Email NO obligatorio, sin captcha.
 */
function crearReservaAdmin(datos) {
  try {
    if (!datos.servicio_id || !datos.fecha || !datos.hora || !datos.nombre) {
      return { success: false, message: 'Rellena al menos servicio, fecha, hora y nombre.' };
    }

    // Obtener servicio
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var servicio = servicios.find(function(s) { return s.ID == datos.servicio_id; });
    if (!servicio) return { success: false, message: 'Servicio no encontrado.' };

    var duracion = parseInt(servicio.Duracion_Minutos) || 60;
    var horaFin = minutesToTime(timeToMinutes(datos.hora) + duracion);

    // Desplazamiento
    var tiempoDesplazamiento = '';
    if (servicio.Tipo === 'domicilio' && datos.direccion) {
      var config = getAllConfig();
      var origen = config.direccion_consulta || 'Plaza Santa Cristina 4, Madrid';
      tiempoDesplazamiento = calcularTiempoDesplazamiento(origen, datos.direccion);
    }

    var token = Utilities.getUuid();
    var citaId = 'A' + new Date().getTime().toString(36).toUpperCase();

    var citaData = {
      ID: citaId,
      Fecha: datos.fecha,
      Hora_Inicio: datos.hora,
      Hora_Fin: horaFin,
      Servicio_ID: datos.servicio_id,
      Tipo: servicio.Tipo,
      Estado: 'confirmada',
      Cliente_Nombre: datos.nombre,
      Cliente_Email: datos.email || '',
      Cliente_Telefono: datos.telefono || '',
      Cliente_Direccion: datos.direccion || '',
      Tiempo_Desplazamiento: tiempoDesplazamiento,
      Token_Cancelacion: token,
      Fecha_Creacion: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm'),
      Notas: datos.notas || '',
      Calendar_Event_ID: '',
      Recordatorio_24h: '',
      Recordatorio_2h: '',
      Creada_Por: 'admin'
    };

    citaData.servicio_nombre = servicio.Nombre;
    citaData.precio = servicio.Precio;

    // Insertar en Sheets
    insertRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, citaData);

    // Calendar
    var eventId = createCalendarEvent(citaData);
    if (eventId) {
      var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
      var citaRow = citas.find(function(c) { return c.ID === citaId; });
      if (citaRow) {
        citaRow.Calendar_Event_ID = eventId;
        updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, citaRow._rowIndex, citaRow);
      }
    }

    // Actualizar cliente (solo si tiene email)
    if (datos.email) {
      upsertCliente(datos.nombre, datos.email, datos.telefono, datos.direccion);
      // Enviar confirmación al cliente solo si tiene email
      enviarConfirmacionCliente(citaData);
    }

    return { success: true, citaId: citaId };

  } catch (e) {
    console.error('Error creando cita admin: ' + e.toString());
    return { success: false, message: 'Error: ' + e.toString() };
  }
}


// ═══════════════════════════════════════════════════════════
// CANCELAR RESERVA
// ═══════════════════════════════════════════════════════════

/**
 * Cancela una reserva por token.
 */
function cancelarReserva(token) {
  try {
    if (!token) return { success: false, message: 'Token no válido.' };

    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var cita = citas.find(function(c) { return c.Token_Cancelacion === token; });
    if (!cita) return { success: false, message: 'No se encontró la cita.' };

    if (cita.Estado !== 'confirmada') {
      return { success: false, message: 'Esta cita ya no se puede cancelar (estado: ' + cita.Estado + ').' };
    }

    // Verificar antelación mínima de cancelación
    var config = getAllConfig();
    var antelacionCancel = parseInt(config.antelacion_cancelacion_horas) || 4;
    var citaDateTime = new Date(cita.Fecha + 'T' + cita.Hora_Inicio + ':00');
    var now = new Date();
    var horasAntes = (citaDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (horasAntes < antelacionCancel) {
      return { success: false, message: 'No es posible cancelar con menos de ' + antelacionCancel + ' horas de antelación. Contacta por WhatsApp.' };
    }

    // Cambiar estado
    cita.Estado = 'cancelada';
    updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, cita._rowIndex, cita);

    // Eliminar evento del calendario
    if (cita.Calendar_Event_ID) {
      deleteCalendarEvent(cita.Calendar_Event_ID);
    }

    // Enriquecer con nombre servicio
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var svc = servicios.find(function(s) { return s.ID == cita.Servicio_ID; });
    cita.servicio_nombre = svc ? svc.Nombre : '';

    // Emails
    enviarConfirmacionCancelacion(cita);
    enviarNotificacionAdmin(cita, 'cancelacion');

    return { success: true };

  } catch (e) {
    console.error('Error cancelando reserva: ' + e.toString());
    return { success: false, message: 'Error: ' + e.toString() };
  }
}


// ═══════════════════════════════════════════════════════════
// REAGENDAR RESERVA
// ═══════════════════════════════════════════════════════════

/**
 * Reagenda una cita: cambia fecha y hora.
 */
function reagendarReserva(token, nuevaFecha, nuevaHora) {
  try {
    if (!token || !nuevaFecha || !nuevaHora) {
      return { success: false, message: 'Datos incompletos para reagendar.' };
    }

    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var cita = citas.find(function(c) { return c.Token_Cancelacion === token; });
    if (!cita) return { success: false, message: 'No se encontró la cita.' };

    if (cita.Estado !== 'confirmada') {
      return { success: false, message: 'Esta cita ya no se puede reagendar.' };
    }

    // Verificar disponibilidad del nuevo slot
    var disponible = checkSlotAvailability(nuevaFecha, nuevaHora, cita.Servicio_ID);
    if (!disponible) {
      return { success: false, message: 'El horario seleccionado ya no está disponible.' };
    }

    // Obtener servicio para calcular hora fin
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var servicio = servicios.find(function(s) { return s.ID == cita.Servicio_ID; });
    var duracion = parseInt(servicio ? servicio.Duracion_Minutos : 60);
    var nuevaHoraFin = minutesToTime(timeToMinutes(nuevaHora) + duracion);

    // Actualizar cita
    cita.Fecha = nuevaFecha;
    cita.Hora_Inicio = nuevaHora;
    cita.Hora_Fin = nuevaHoraFin;
    cita.Recordatorio_24h = '';  // Resetear recordatorios
    cita.Recordatorio_2h = '';
    updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, cita._rowIndex, cita);

    // Actualizar evento en calendario
    if (cita.Calendar_Event_ID) {
      updateCalendarEvent(cita.Calendar_Event_ID, cita);
    }

    // Enriquecer
    cita.servicio_nombre = servicio ? servicio.Nombre : '';
    cita.precio = servicio ? servicio.Precio : '';

    // Emails
    enviarConfirmacionCliente(cita);
    enviarNotificacionAdmin(cita, 'reagendamiento');

    return { success: true };

  } catch (e) {
    console.error('Error reagendando: ' + e.toString());
    return { success: false, message: 'Error: ' + e.toString() };
  }
}


// ═══════════════════════════════════════════════════════════
// CONSULTAS
// ═══════════════════════════════════════════════════════════

/**
 * Busca una cita por token (para la vista de cancelación/reagendamiento).
 */
function getCitaPorToken(token) {
  try {
    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var cita = citas.find(function(c) { return c.Token_Cancelacion === token; });

    if (!cita) return { error: 'No se encontró ninguna cita con este enlace.' };

    // Formatear fecha
    cita.Fecha = app_normalizarFecha(cita.Fecha);

    // Enriquecer con nombre de servicio
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var svc = servicios.find(function(s) { return s.ID == cita.Servicio_ID; });
    cita.servicio_nombre = svc ? svc.Nombre : '';

    return cita;
  } catch (e) {
    return { error: 'Error buscando cita: ' + e.toString() };
  }
}

/**
 * Obtiene todas las citas (admin).
 */
function getCitasTodas() {
  try {
    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);

    citas.forEach(function(c) {
      // Formatear fecha
      c.Fecha = app_normalizarFecha(c.Fecha);
      
      if (c.Hora_Inicio) c.Hora_Inicio = formatTimeValue(c.Hora_Inicio);
      if (c.Hora_Fin) c.Hora_Fin = formatTimeValue(c.Hora_Fin);

      var svc = servicios.find(function(s) { return s.ID == c.Servicio_ID; });
      c.servicio_nombre = svc ? svc.Nombre : '';
    });

    // Ordenar por fecha descendente
    citas.sort(function(a, b) { return a.Fecha > b.Fecha ? -1 : 1; });

    return citas;
  } catch (e) {
    return [];
  }
}

/**
 * Obtiene las próximas citas (dashboard).
 */
function getProximasCitas() {
  try {
    var hoy = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);

    var futuras = citas.filter(function(c) {
      var fecha = c.Fecha;
      fecha = app_normalizarFecha(fecha);
      c.Fecha = fecha;
      return fecha >= hoy && c.Estado === 'confirmada';
    });

    futuras.forEach(function(c) {
      if (c.Hora_Inicio) c.Hora_Inicio = formatTimeValue(c.Hora_Inicio);
      if (c.Hora_Fin) c.Hora_Fin = formatTimeValue(c.Hora_Fin);
      var svc = servicios.find(function(s) { return s.ID == c.Servicio_ID; });
      c.servicio_nombre = svc ? svc.Nombre : '';
    });

    futuras.sort(function(a, b) {
      if (a.Fecha === b.Fecha) return a.Hora_Inicio > b.Hora_Inicio ? 1 : -1;
      return a.Fecha > b.Fecha ? 1 : -1;
    });

    return futuras.slice(0, 10);
  } catch (e) {
    return [];
  }
}

/**
 * Obtiene estadísticas para el dashboard.
 */
function getEstadisticas() {
  try {
    var now = new Date();
    var hoy = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd');

    // Inicio de semana (lunes)
    var inicioSemana = new Date(now);
    var day = inicioSemana.getDay();
    var diff = day === 0 ? 6 : day - 1;
    inicioSemana.setDate(inicioSemana.getDate() - diff);
    var inicioSemanaStr = Utilities.formatDate(inicioSemana, CONFIG.TIMEZONE, 'yyyy-MM-dd');

    // Inicio de mes
    var inicioMes = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth(), 1), CONFIG.TIMEZONE, 'yyyy-MM-dd');

    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);

    // Normalizar fechas
    citas.forEach(function(c) {
      c.Fecha = app_normalizarFecha(c.Fecha);
    });

    var citasHoy = citas.filter(function(c) { return c.Fecha === hoy && c.Estado === 'confirmada'; }).length;
    var citasSemana = citas.filter(function(c) { return c.Fecha >= inicioSemanaStr && c.Fecha <= hoy && c.Estado === 'confirmada'; }).length;
    var citasPendientes = citas.filter(function(c) { return c.Fecha >= hoy && c.Estado === 'confirmada'; }).length;
    var cancelacionesMes = citas.filter(function(c) { return c.Fecha >= inicioMes && c.Estado === 'cancelada'; }).length;

    return {
      citasHoy: citasHoy,
      citasSemana: citasSemana,
      citasPendientes: citasPendientes,
      cancelacionesMes: cancelacionesMes
    };
  } catch (e) {
    return { citasHoy: 0, citasSemana: 0, citasPendientes: 0, cancelacionesMes: 0 };
  }
}

/**
 * Cambia el estado de una cita (admin).
 */
function actualizarEstadoCita(citaId, nuevoEstado) {
  try {
    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var cita = citas.find(function(c) { return c.ID == citaId; });
    if (!cita) return { success: false, message: 'Cita no encontrada.' };

    cita.Estado = nuevoEstado;
    updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, cita._rowIndex, cita);

    // Si se cancela desde admin, eliminar evento de calendario
    if (nuevoEstado === 'cancelada' && cita.Calendar_Event_ID) {
      deleteCalendarEvent(cita.Calendar_Event_ID);
    }

    return { success: true };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.toString() };
  }
}

/**
 * Modifica una reserva existente desde el panel de administración.
 */
function modificarReservaAdmin(datos) {
  try {
    if (!datos || !datos.ID) {
      return { success: false, message: 'ID de cita no proporcionado.' };
    }

    var citas = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS);
    var cita = citas.find(function(c) { return c.ID == datos.ID; });
    if (!cita) {
      return { success: false, message: 'Cita no encontrada.' };
    }

    var servicios = getSheetDataAsJson(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_SERVICIOS);
    var servicioId = datos.servicio_id || cita.Servicio_ID;
    var servicio = servicios.find(function(s) { return s.ID == servicioId; });
    if (!servicio) servicio = { Tipo: cita.Tipo || 'consulta', Duracion_Minutos: 60, Nombre: '' };

    var duracion = parseInt(servicio.Duracion_Minutos) || 60;
    var horaInicio = datos.hora || cita.Hora_Inicio;
    var horaFin = minutesToTime(timeToMinutes(horaInicio) + duracion);

    // Calcular desplazamiento si es a domicilio
    var tiempoDesplazamiento = cita.Tiempo_Desplazamiento || '';
    if (servicio.Tipo === 'domicilio') {
      var dir = datos.direccion !== undefined ? datos.direccion : cita.Cliente_Direccion;
      if (dir && dir !== cita.Cliente_Direccion) {
        var config = getAllConfig();
        var origen = config.direccion_consulta || 'Plaza Santa Cristina 4, Madrid';
        tiempoDesplazamiento = calcularTiempoDesplazamiento(origen, dir);
      }
    } else {
      tiempoDesplazamiento = '';
    }

    // Actualizar datos
    cita.Servicio_ID = servicioId;
    cita.Tipo = servicio.Tipo;
    cita.Fecha = datos.fecha || cita.Fecha;
    cita.Hora_Inicio = horaInicio;
    cita.Hora_Fin = horaFin;
    if (datos.estado) cita.Estado = datos.estado;
    if (datos.nombre !== undefined) cita.Cliente_Nombre = datos.nombre;
    if (datos.email !== undefined) cita.Cliente_Email = datos.email;
    if (datos.telefono !== undefined) cita.Cliente_Telefono = datos.telefono;
    if (datos.direccion !== undefined) cita.Cliente_Direccion = datos.direccion;
    cita.Tiempo_Desplazamiento = tiempoDesplazamiento;
    if (datos.notas !== undefined) cita.Notas = datos.notas;

    // Sincronizar con calendario de Google
    if (cita.Estado === 'cancelada') {
      if (cita.Calendar_Event_ID) {
        deleteCalendarEvent(cita.Calendar_Event_ID);
        cita.Calendar_Event_ID = '';
      }
    } else {
      if (cita.Calendar_Event_ID) {
        updateCalendarEvent(cita.Calendar_Event_ID, cita);
      } else if (cita.Estado === 'confirmada') {
        cita.servicio_nombre = servicio.Nombre;
        cita.Calendar_Event_ID = createCalendarEvent(cita);
      }
    }

    // Actualizar cliente en pestaña de clientes si hay datos
    if (cita.Cliente_Nombre && (cita.Cliente_Email || cita.Cliente_Telefono)) {
      upsertCliente(cita.Cliente_Nombre, cita.Cliente_Email || '', cita.Cliente_Telefono || '', cita.Cliente_Direccion || '');
    }

    // Guardar en Google Sheets
    updateRowData(CONFIG.SPREADSHEET_ID, CONFIG.SHEET_CITAS, cita._rowIndex, cita);

    return { success: true, cita: cita };
  } catch (e) {
    console.error('Error modificando cita admin: ' + e.toString());
    return { success: false, message: 'Error: ' + e.toString() };
  }
}
