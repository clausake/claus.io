// Le paquet de features Motion, charge APRES le premier rendu.
//
// Separation volontaire dans son propre fichier : c'est l'appel `import()` qui
// cree la frontiere de chunk. Importe statiquement, domAnimation remonterait dans
// le bundle d'entree et la reduction de poids serait annulee sans rien casser de
// visible (le defaut que le harnais e2e attrape).
//
// domAnimation couvre ce que l'app utilise reellement (verifie par recherche:
// aucun whileHover/drag/layout/LayoutGroup dans src/) : animations, variantes,
// animations de sortie (donc AnimatePresence) et gestes tap/hover/focus.
// domMax (pan/drag + layout) ne sert a rien ici: MenuAnalysis fait du DnD HTML5
// natif (React.DragEvent), pas un geste Motion.
export { domAnimation as default } from "motion/react";
