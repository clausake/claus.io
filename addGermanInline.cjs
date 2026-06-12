const fs = require('fs');
let appData = fs.readFileSync('src/App.tsx', 'utf-8');

appData = appData.replace(
  /settings\.language === 'es' \? 'La generación creativa ya no sigue un ciclo fijo para garantizar la exclusividad total de cada servicio\.' : 'Creative generation no longer follows a fixed cycle to ensure total exclusivity for each service\.'/g,
  "settings.language === 'es' ? 'La generación creativa ya no sigue un ciclo fijo para garantizar la exclusividad total de cada servicio.' : settings.language === 'de' ? 'Die kreative Generierung folgt keinem festen Zyklus mehr, um für jeden Service absolute Exklusivität zu gewährleisten.' : 'Creative generation no longer follows a fixed cycle to ensure total exclusivity for each service.'"
);

fs.writeFileSync('src/App.tsx', appData);
console.log('App.tsx inline translated updated');
