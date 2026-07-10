/**
 * API_Email.js — Templates y envío de emails de confirmación, recordatorios y reseñas.
 * Todos los emails usan la marca visual de Eduardo Callejo Osteopatía.
 */

/**
 * Envía email de confirmación al cliente tras reservar.
 */
function enviarConfirmacionCliente(citaData) {
  try {
    var config = getAllConfig();
    var email = citaData.Cliente_Email;
    if (!email) return;

    var tipoLabel = citaData.Tipo === 'domicilio' ? 'a domicilio' : 'en consulta';
    var baseUrl = ScriptApp.getService().getUrl();
    var cancelUrl = baseUrl + '?cancel=' + citaData.Token_Cancelacion;
    var reagendarUrl = baseUrl + '?reagendar=' + citaData.Token_Cancelacion;
    var whatsapp = config.whatsapp || '+34676435634';

    var asunto = '✅ Cita confirmada — ' + app_formatDate(citaData.Fecha) + ' a las ' + citaData.Hora_Inicio;

    var contenido = '<h2 style="color:#2A9D8F;margin:0 0 8px;">¡Cita confirmada!</h2>' +
      '<p style="color:#666;margin:0 0 24px;">' + (config.mensaje_confirmacion || '¡Gracias por tu reserva!') + '</p>' +

      '<div style="background:#F0FAF8;border-radius:12px;padding:20px;margin-bottom:24px;">' +
        '<table style="width:100%;border-collapse:collapse;">' +
          emailRow('📅 Fecha', app_formatDate(citaData.Fecha)) +
          emailRow('🕐 Hora', citaData.Hora_Inicio) +
          emailRow('🏥 Servicio', (citaData.servicio_nombre || '') + ' (' + tipoLabel + ')') +
          (citaData.Cliente_Direccion ? emailRow('📍 Dirección', citaData.Cliente_Direccion) : '') +
          (citaData.Tiempo_Desplazamiento ? emailRow('🚗 Desplazamiento', '~' + citaData.Tiempo_Desplazamiento + ' min') : '') +
          emailRow('💰 Precio', citaData.precio + '€') +
        '</table>' +
      '</div>' +

      '<div style="text-align:center;margin-bottom:24px;">' +
        '<a href="' + cancelUrl + '" style="display:inline-block;padding:10px 24px;background:#E74C3C;color:white;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px;">Cancelar cita</a>' +
        '<a href="' + reagendarUrl + '" style="display:inline-block;padding:10px 24px;background:#2A9D8F;color:white;border-radius:8px;text-decoration:none;font-weight:600;">Reagendar</a>' +
      '</div>' +

      '<p style="color:#999;font-size:13px;text-align:center;">' +
        (config.politica_cancelacion || '') +
      '</p>' +

      '<div style="text-align:center;margin-top:16px;">' +
        '<a href="https://wa.me/' + whatsapp.replace(/[^0-9]/g, '') + '" style="color:#25D366;font-weight:600;text-decoration:none;">💬 ¿Dudas? Contacta por WhatsApp</a>' +
      '</div>';

    var html = buildEmailTemplate(contenido);
    MailApp.sendEmail({
      to: email,
      subject: asunto,
      htmlBody: html,
      name: "Osteopatía Eduardo Callejo"
    });

  } catch (e) {
    console.error('Error enviando confirmación al cliente: ' + e.toString());
  }
}

/**
 * Envía notificación al administrador.
 * @param {Object} citaData
 * @param {string} tipo - 'nueva_cita', 'cancelacion', 'reagendamiento'
 */
function enviarNotificacionAdmin(citaData, tipo) {
  try {
    var config = getAllConfig();
    var adminEmail = config.email_admin || CONFIG.ADMIN_EMAIL;

    var asuntos = {
      'nueva_cita': '🆕 Nueva cita: ' + (citaData.Cliente_Nombre || '') + ' — ' + citaData.Fecha + ' ' + citaData.Hora_Inicio,
      'cancelacion': '❌ Cita cancelada: ' + (citaData.Cliente_Nombre || '') + ' — ' + citaData.Fecha,
      'reagendamiento': '🔄 Cita reagendada: ' + (citaData.Cliente_Nombre || '')
    };

    var tipoLabel = citaData.Tipo === 'domicilio' ? '📍 A domicilio' : '🏥 En consulta';

    var contenido = '<h2 style="color:#264653;margin:0 0 16px;">' +
      (tipo === 'nueva_cita' ? '🆕 Nueva reserva' : tipo === 'cancelacion' ? '❌ Cancelación' : '🔄 Reagendamiento') +
      '</h2>' +

      '<div style="background:#F8FAFB;border-radius:12px;padding:20px;">' +
        '<table style="width:100%;border-collapse:collapse;">' +
          emailRow('👤 Cliente', citaData.Cliente_Nombre || '') +
          emailRow('📧 Email', citaData.Cliente_Email || 'Sin email') +
          emailRow('📱 Teléfono', citaData.Cliente_Telefono || '') +
          emailRow('📅 Fecha', app_formatDate(citaData.Fecha)) +
          emailRow('🕐 Hora', citaData.Hora_Inicio + ' - ' + (citaData.Hora_Fin || '')) +
          emailRow('🏥 Servicio', (citaData.servicio_nombre || '') + ' — ' + tipoLabel) +
          (citaData.Cliente_Direccion ? emailRow('📍 Dirección', citaData.Cliente_Direccion) : '') +
          (citaData.Notas ? emailRow('📝 Notas', citaData.Notas) : '') +
          emailRow('📋 Creada por', citaData.Creada_Por || 'cliente') +
        '</table>' +
      '</div>';

    if (citaData.Cliente_Telefono) {
      var tlf = citaData.Cliente_Telefono.toString().replace(/\D/g, '');
      if (tlf.length === 9) tlf = '34' + tlf;
      
      var textoConfirmacion = 'Hola ' + (citaData.Cliente_Nombre || '') + ', te confirmo tu cita de osteopatía para el ' + app_formatDate(citaData.Fecha) + ' a las ' + citaData.Hora_Inicio + '. ¡Nos vemos pronto!';
      var textoRecordatorio = 'Hola ' + (citaData.Cliente_Nombre || '') + ', te escribo para recordarte que tienes una cita de osteopatía mañana a las ' + citaData.Hora_Inicio + '. ¡Un saludo!';
      
      var linkConfirmacion = 'https://wa.me/' + tlf + '?text=' + encodeURIComponent(textoConfirmacion);
      var linkRecordatorio = 'https://wa.me/' + tlf + '?text=' + encodeURIComponent(textoRecordatorio);
      
      contenido += '<div style="margin-top:24px;text-align:center;">' +
        '<a href="' + linkConfirmacion + '" style="display:inline-block;padding:12px 16px;background:#25D366;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;margin-right:12px;font-size:14px;">💬 Enviar Confirmación</a>' +
        '<a href="' + linkRecordatorio + '" style="display:inline-block;padding:12px 16px;background:#128C7E;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">⏰ Guardar Recordatorio</a>' +
        '</div>';
    }

    var html = buildEmailTemplate(contenido);
    MailApp.sendEmail({
      to: adminEmail,
      subject: asuntos[tipo] || 'Notificación ReservaCita',
      htmlBody: html,
      name: "Osteopatía Eduardo Callejo"
    });

  } catch (e) {
    console.error('Error enviando notificación admin: ' + e.toString());
  }
}

/**
 * Envía recordatorio al cliente.
 * @param {Object} citaData
 * @param {string} tiempoAntes - '24h' o '2h'
 */
function enviarRecordatorio(citaData, tiempoAntes) {
  try {
    if (!citaData.Cliente_Email) return;

    var config = getAllConfig();
    var whatsapp = config.whatsapp || '+34676435634';
    var tipoLabel = citaData.Tipo === 'domicilio' ? 'a domicilio' : 'en consulta';
    var baseUrl = ScriptApp.getService().getUrl();
    var reagendarUrl = baseUrl + '?reagendar=' + citaData.Token_Cancelacion;

    var asunto = '⏰ Recordatorio: Tu cita de osteopatía ' + (tiempoAntes === '24h' ? 'es mañana' : 'es en 2 horas');

    var contenido = '<h2 style="color:#2A9D8F;margin:0 0 8px;">⏰ Recordatorio de tu cita</h2>' +
      '<p style="color:#666;margin:0 0 20px;">Tu cita de osteopatía ' + tipoLabel + ' es ' +
      (tiempoAntes === '24h' ? '<strong>mañana</strong>' : 'dentro de <strong>2 horas</strong>') + ':</p>' +

      '<div style="background:#F0FAF8;border-radius:12px;padding:20px;margin-bottom:20px;">' +
        '<table style="width:100%;border-collapse:collapse;">' +
          emailRow('📅 Fecha', app_formatDate(citaData.Fecha)) +
          emailRow('🕐 Hora', citaData.Hora_Inicio) +
          emailRow('🏥 Servicio', (citaData.servicio_nombre || '') + ' (' + tipoLabel + ')') +
          (citaData.Tipo === 'consulta' ? emailRow('📍 Lugar', config.direccion_consulta || '') : '') +
          (citaData.Cliente_Direccion ? emailRow('📍 Tu dirección', citaData.Cliente_Direccion) : '') +
        '</table>' +
      '</div>' +

      '<div style="text-align:center;">' +
        '<a href="' + reagendarUrl + '" style="color:#2A9D8F;font-weight:600;text-decoration:none;">¿Necesitas cambiar la hora? Reagendar</a>' +
        '<br><br>' +
        '<a href="https://wa.me/' + whatsapp.replace(/[^0-9]/g, '') + '" style="color:#25D366;font-weight:600;text-decoration:none;">💬 WhatsApp</a>' +
      '</div>';

    var html = buildEmailTemplate(contenido);
    MailApp.sendEmail({
      to: citaData.Cliente_Email,
      subject: asunto,
      htmlBody: html,
      name: "Osteopatía Eduardo Callejo"
    });

  } catch (e) {
    console.error('Error enviando recordatorio: ' + e.toString());
  }
}

/**
 * Envía email de confirmación de cancelación al cliente.
 */
function enviarConfirmacionCancelacion(citaData) {
  try {
    if (!citaData.Cliente_Email) return;

    var baseUrl = ScriptApp.getService().getUrl();

    var contenido = '<h2 style="color:#E74C3C;margin:0 0 8px;">Cita cancelada</h2>' +
      '<p style="color:#666;margin:0 0 20px;">Tu cita del <strong>' + app_formatDate(citaData.Fecha) + '</strong> a las <strong>' + citaData.Hora_Inicio + '</strong> ha sido cancelada.</p>' +
      '<div style="text-align:center;">' +
        '<a href="' + baseUrl + '" style="display:inline-block;padding:12px 28px;background:#2A9D8F;color:white;border-radius:8px;text-decoration:none;font-weight:600;">Reservar nueva cita</a>' +
      '</div>';

    var html = buildEmailTemplate(contenido);
    MailApp.sendEmail({
      to: citaData.Cliente_Email,
      subject: '❌ Cita cancelada — ' + app_formatDate(citaData.Fecha),
      htmlBody: html,
      name: "Osteopatía Eduardo Callejo"
    });

  } catch (e) {
    console.error('Error enviando cancelación: ' + e.toString());
  }
}

/**
 * Envía solicitud de reseña en Google Maps tras la cita.
 */
function enviarSolicitudResena(citaData) {
  try {
    if (!citaData.Cliente_Email) return;

    var config = getAllConfig();
    var urlResena = config.url_google_maps_resena;
    if (!urlResena) return; // No hay URL de reseñas configurada

    var contenido = '<h2 style="color:#2A9D8F;margin:0 0 8px;">¿Qué tal tu experiencia?</h2>' +
      '<p style="color:#666;margin:0 0 20px;">Hola ' + (citaData.Cliente_Nombre || '') + ', espero que tu sesión de osteopatía haya ido bien. ' +
      'Tu opinión nos ayuda mucho a mejorar. ¿Podrías dejarnos una reseña?</p>' +
      '<div style="text-align:center;margin:24px 0;">' +
        '<a href="' + urlResena + '" style="display:inline-block;padding:14px 32px;background:#FBBC04;color:#333;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">' +
        '⭐ Dejar reseña en Google</a>' +
      '</div>' +
      '<p style="color:#999;font-size:13px;text-align:center;">¡Gracias! Tu opinión es muy importante para nosotros.</p>';

    var html = buildEmailTemplate(contenido);
    MailApp.sendEmail({
      to: citaData.Cliente_Email,
      subject: '⭐ ¿Qué tal tu sesión? — Eduardo Callejo Osteopatía',
      htmlBody: html,
      name: "Osteopatía Eduardo Callejo"
    });

  } catch (e) {
    console.error('Error enviando solicitud de reseña: ' + e.toString());
  }
}


// ═══════════════════════════════════════════════════════════
// TEMPLATE DE EMAIL
// ═══════════════════════════════════════════════════════════

/**
 * Construye el HTML completo del email con branding.
 */
function buildEmailTemplate(contenido) {
  var config = getAllConfig();
  var logo = config.url_logo || 'https://osteopatiamadrid.com/lovable-uploads/eduardo-callejo-logo.png';
  var nombre = config.nombre_negocio || 'Eduardo Callejo - Osteopatía';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#F8FAFB;font-family:Arial,Helvetica,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFB;padding:20px 0;">' +
    '<tr><td align="center">' +
      '<table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">' +

        // Header
        '<tr><td style="background:linear-gradient(135deg,#2A9D8F,#5CB896);padding:28px;text-align:center;">' +
          '<img src="' + logo + '" alt="' + nombre + '" style="height:52px;margin-bottom:8px;"><br>' +
          '<span style="color:white;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Osteopatía Madrid</span>' +
        '</td></tr>' +

        // Contenido
        '<tr><td style="padding:32px 28px;">' + contenido + '</td></tr>' +

        // Footer
        '<tr><td style="padding:20px 28px;border-top:1px solid #E8ECF0;text-align:center;">' +
          '<p style="color:#999;font-size:12px;margin:0;">© 2026 ' + nombre + '</p>' +
          '<p style="color:#999;font-size:12px;margin:4px 0 0;">' +
            '<a href="https://osteopatiamadrid.com" style="color:#2A9D8F;text-decoration:none;">osteopatiamadrid.com</a>' +
          '</p>' +
        '</td></tr>' +

      '</table>' +
    '</td></tr></table></body></html>';
}

/**
 * Helper para crear una fila de tabla en el email.
 */
function emailRow(label, value) {
  if (!value) return '';
  return '<tr>' +
    '<td style="padding:6px 0;color:#999;font-size:13px;vertical-align:top;width:140px;">' + label + '</td>' +
    '<td style="padding:6px 0;color:#333;font-size:14px;font-weight:600;">' + value + '</td>' +
    '</tr>';
}

/**
 * Formateo de fecha para emails (función independiente del frontend).
 */
function app_formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    var d;
    if (dateStr instanceof Date) {
      d = dateStr;
    } else {
      d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00'));
    }
    if (isNaN(d.getTime())) return dateStr.toString();

    var dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return dias[d.getDay()] + ' ' + d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
  } catch (e) {
    return dateStr.toString();
  }
}
