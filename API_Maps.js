/**
 * API_Maps.js — Cálculo de tiempos de desplazamiento con Google Maps.
 * Usa Maps.newDirectionFinder() (servicio avanzado de Apps Script) con cache.
 */

/**
 * Calcula el tiempo de desplazamiento entre dos direcciones.
 * @param {string} origen - Dirección de origen
 * @param {string} destino - Dirección de destino
 * @return {number} Tiempo en minutos (incluyendo margen de seguridad)
 */
function calcularTiempoDesplazamiento(origen, destino) {
  if (!origen || !destino) return 30; // fallback

  try {
    // Intentar cache primero
    var cacheKey = 'travel_' + Utilities.base64Encode(origen + '|' + destino);
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) {
      return parseInt(cached);
    }

    // Consultar Google Maps Directions API
    var directions = Maps.newDirectionFinder()
      .setOrigin(origen)
      .setDestination(destino)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .setLanguage('es')
      .getDirections();

    if (!directions || !directions.routes || directions.routes.length === 0) {
      console.log('No se encontraron rutas de ' + origen + ' a ' + destino);
      return 30; // fallback
    }

    var route = directions.routes[0];
    if (!route.legs || route.legs.length === 0) return 30;

    var durationSeconds = route.legs[0].duration.value;
    var durationMinutes = Math.ceil(durationSeconds / 60);

    // Añadir margen de seguridad (10 minutos para aparcar, subir, etc.)
    var totalMinutes = durationMinutes + 10;

    // Cachear resultado por 6 horas (21600 segundos)
    cache.put(cacheKey, totalMinutes.toString(), 21600);

    return totalMinutes;
  } catch (e) {
    console.error('Error calculando desplazamiento: ' + e.toString());
    return 30; // fallback: 30 minutos por defecto
  }
}

/**
 * Valida que una dirección sea geocodificable.
 * @param {string} direccion - Dirección a validar
 * @return {Object} {valida: boolean, direccion_formateada: string}
 */
function validarDireccion(direccion) {
  if (!direccion) return { valida: false, direccion_formateada: '' };

  try {
    var geocoder = Maps.newGeocoder().geocode(direccion);
    if (geocoder && geocoder.results && geocoder.results.length > 0) {
      return {
        valida: true,
        direccion_formateada: geocoder.results[0].formatted_address || direccion
      };
    }
    return { valida: false, direccion_formateada: '' };
  } catch (e) {
    console.error('Error validando dirección: ' + e.toString());
    return { valida: false, direccion_formateada: direccion };
  }
}
