/**
 * Archivo de configuración central de ReservaCita.
 * Contiene los IDs y nombres de pestañas de la hoja de cálculo,
 * así como constantes globales de la aplicación.
 */

var CONFIG = {
  // ID de la hoja de cálculo principal
  SPREADSHEET_ID: '1DP5weOc3PwN47WrzysogBJULa_m096tB6uLh5ah3-fE',

  // Nombres de las pestañas
  SHEET_CONFIGURACION: 'Configuracion',
  SHEET_HORARIOS: 'Horarios',
  SHEET_EXCEPCIONES: 'Excepciones',
  SHEET_SERVICIOS: 'Servicios',
  SHEET_CITAS: 'Citas',
  SHEET_CLIENTES: 'Clientes',

  // Administración
  ADMIN_EMAIL: 'eduardocvk@gmail.com',

  // Zona horaria
  TIMEZONE: 'Europe/Madrid',

  // Valores por defecto para la configuración inicial
  DEFAULTS: {
    nombre_negocio: 'Eduardo Callejo - Osteopatía',
    email_admin: 'eduardocvk@gmail.com',
    telefono: '+34676435634',
    whatsapp: '+34676435634',
    direccion_consulta: 'Plaza Santa Cristina 4, Madrid',
    duracion_sesion_minutos: '60',
    intervalo_slots_minutos: '15',
    margen_entre_citas_consulta: '15',
    margen_entre_citas_domicilio: '30',
    antelacion_minima_horas: '24',
    antelacion_maxima_dias: '60',
    antelacion_cancelacion_horas: '4',
    calendarios_disponibilidad: 'eduardocvk@gmail.com,edu@ciudadjoven.org',
    calendario_citas: '291d2d7860c785972d1a93a7f84fcee78bb0666be774c001732d67b6104c5008@group.calendar.google.com',
    url_logo: 'https://osteopatiamadrid.com/lovable-uploads/eduardo-callejo-logo.png',
    mensaje_confirmacion: '¡Gracias por tu reserva! Te esperamos en nuestra consulta.',
    politica_cancelacion: 'Puedes cancelar o reagendar tu cita hasta 4 horas antes de la hora programada.',
    recordatorio_24h_activo: 'true',
    recordatorio_2h_activo: 'true',
    url_google_maps_resena: '',
    color_primario: '#2A9D8F',
    color_secundario: '#264653'
  }
};
