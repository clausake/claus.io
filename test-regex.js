const str = "Stock d'alerte : Poivre Noir Grains (0 kg restant pour un minimum de 1 kg paramétré)";
const match = str.match(/Stock d'alerte : (.*?) \((.*?) (.*?) restant pour un minimum de (.*?) (.*?) paramétré\)/);
console.log(match);
