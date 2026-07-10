const margenConsulta = 15;
const margenDomicilio = 30;
const duracionSesion = 60;

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  var parts = timeStr.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function check(slotHora, citaInicio, citaFin, tipoCita, tipoServicio) {
  var slot = {
    hora: slotHora,
    startMin: timeToMinutes(slotHora),
    endMin: timeToMinutes(slotHora) + duracionSesion,
    disponible: true
  };
  
  var cita = {
    Hora_Inicio: citaInicio,
    Hora_Fin: citaFin,
    Tipo: tipoCita,
    Tiempo_Desplazamiento: 0
  };
  
  var citaStart = timeToMinutes(cita.Hora_Inicio);
  var citaEnd = timeToMinutes(cita.Hora_Fin);

  if (citaEnd <= citaStart) citaEnd = citaStart + 60; // Fallback

  var margen = margenConsulta;
  if (cita.Tipo === 'domicilio') {
    margen = Math.max(margenDomicilio, cita.Tiempo_Desplazamiento);
  }
  var citaEndConMargen = citaEnd + margen;

  if (slot.startMin < citaEndConMargen && slot.endMin > citaStart) {
    slot.disponible = false;
    console.log(`Blocked by margen posterior: slot ${slot.startMin}-${slot.endMin} vs cita ${citaStart}-${citaEndConMargen}`);
  }

  if (tipoServicio === 'domicilio' && slot.disponible) {
    var slotStartConMargen = slot.startMin - margenDomicilio;
    // WRONG CONDITION IN CURRENT SCRIPT?
    // Current script: if (slotStartConMargen < citaEnd && slot.startMin > citaStart)
    if (slotStartConMargen < citaEnd && slot.startMin > citaStart) {
      slot.disponible = false;
      console.log(`Blocked by margen anterior (current code): slot ${slotStartConMargen}-${slot.endMin} vs cita ${citaStart}-${citaEnd}`);
    }
  }
  
  console.log(`Slot ${slotHora} after Cita ${citaInicio}-${citaFin} (${tipoCita}) for new ${tipoServicio}: Disponible = ${slot.disponible}`);
}

check('19:00', '18:00', '19:00', 'domicilio', 'consulta');
check('19:00', '18:00', '19:00', 'consulta', 'consulta');
