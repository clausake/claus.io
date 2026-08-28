// Prompts LLM — extraits de server.ts (Phase 2).
// Les constantes STANDARD_QUANTITIES_* sont dupliquées par langue pour les
// standards de portions par personne.

  export function constructMenuPrompt(
    type: "creative" | "traditional" | "gastronomic",
    language: string,
    isSingle: boolean,
    rotationText: string,
    pastNames: string
  ): string {
    const langMap = { fr: "FRANÇAIS", es: "ESPAÑOL", de: "DEUTSCH", it: "ITALIANO", en: "ENGLISH" };
    const langName = langMap[language as keyof typeof langMap] || "ENGLISH";

    let prompt = "";

    if (language === "fr") {
      prompt += `MANDAT LINGUISTIQUE CRITIQUE: LA RÉPONSE ENTIÈRE (Y COMPRIS LES NOMS DES PLATS, LES INGRÉDIENTS, LES ÉTAPES DE LA RECETTE ET LES ALLERGÈNES) DOIT ÊTRE ÉCRITE EN FRANÇAIS PARFAIT ET GRAMMATICALMENT CORRECT. NE MÉLANGE PAS LES LANGUES.\n\n`;
      if (pastNames) {
        prompt += `MANDAT DE MÉMOIRE: Ne génère pas et ne suggère pas les recettes précédemment créées suivantes: ${pastNames}.\n\n`;
      }

      if (type === "creative") {
        prompt += `Agis en tant que Chef Visionnaire d'Avant-Garde spécialisé dans la cuisine moderniste et la fusion mondiale.\n`;
        if (isSingle) {
          prompt += `Génère un UNIQUE MENU CRÉATIF COMPLET (1 Entrée, 1 Plat, 1 Dessert) extrêmement élaboré. Tu dois utiliser des techniques culinaires professionnelles (fermentations, émulsions, fusions inattendues). Concentre-toi sur des accords de saveurs surprenants, de la fusion d'avant-garde et une innovation extrême.\n`;
        } else {
          prompt += `Génère un PLAN DE MENU CRÉATIF SUR 7 JOURS extrêmement élaboré. Chaque jour doit comporter exactement 1 Entrée, 1 Plat et 1 Dessert. Tu dois utiliser des techniques culinaires professionnelles. Concentre-toi sur des accords de saveurs surprenants, de la fusion d'avant-garde et une innovation extrême.\n${rotationText}\n`;
        }
        prompt += `Directives opérationnelles:
  1. EXCELLENCE CULINAIRE: Brise les codes de la cuisine traditionnelle. Invente des concepts inédits (ex: glaces salées, demi-glaces de légumes, sauces de fruits fermentés). Décris des processus culinaires sophistiqués en paragraphes éloquents.
  2. MENUS COMPLETS: Chaque jour DOIT avoir un objet complet 'entree', 'plat' et 'dessert'. Ne laisse aucun service vide.
  3. ÉTAPES DE PRÉPARATION: Fournis des étapes de préparation ultra-détaillées (minimum 6 phrases par recette). Écris des paragraphes fluides décrivant les techniques culinaires chronologiquement. IMPORTANT: N'insère JAMAIS de retours à la ligne physiques bruts dans les chaînes de texte JSON; utilise uniquement '\\n' pour les sauts de ligne. Chaque propriété doit tenir sur une seule ligne physique dans le JSON généré.
  4. COHÉRENCE DES RECETTES: Chaque plat doit contenir au moins 5 ingrédients distincts. Les profils aromatiques doivent être créatifs mais pertinents. Liste des allergènes de manière rigoureuse.
  5. QUANTITÉS STRICTES POUR UNE SEULE PORTION: Établis toutes les quantités d'ingrédients pour exactement UNE PORTION INDIVIDUELLE. Utilise des unités professionnelles ('g', 'ml', 'cl', 'cuillère à café', 'pincée', 'pièce').
  6. UNICITÉ DES NOMS: Évite les clichés. Transforme les ingrédients courants en noms de plats créatifs et inspirants.

  CRITICAL: RÉPONDS STRICTEMENT ET UNIQUEMENT EN FORMAT JSON VALIDE EN FRANÇAIS. Les clés de l'objet JSON (comme 'jour', 'entree', 'nom') doivent rester telles quelles pour compatibilité système.
  STRUCTURE TECHNIQUE PHYSIQUE REQUISE (Tu DOIS générer entree, plat ET dessert. Remplis chaque champ sans exception. Pas de texte explicatif avant ou après le JSON):
  {
    "status": "success",
    "creative_menu": [
      {
        "jour": "${isSingle ? 'Création Unique' : 'Nom du Giorno'}",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 50, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Étapes détaillées..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 150, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Étapes détaillées..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 30, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Étapes détaillées..."}
      }
    ]
  }`;
      } else if (type === "traditional") {
        prompt += `Agis en tant que Maître Restaurateur d'Élite et Gardien du Terroir.\n`;
        prompt += `Génère un UNIQUE MENU DE BISTROT TRADITIONNEL (1 Entrée, 1 Plat, 1 Dessert) extrêmement détaillé.\n`;
        prompt += `Directives opérationnelles:
  1. CUISINE DE BISTROT AUTHENTIQUE: Concentre-toi sur des classiques de terroir réconfortants et authentiques (comme le boeuf bourguignon, la blanquette de veau, la tarte tatin) élevés aux standards de la bistronomie moderne. Pas de chimie, pas de fusions étranges.
  2. ÉTAPES DE PRÉPARATION: Minimum 6 phrases par recette détaillant les mijotages, rissolages, déglaçages par ordre chronologique. N'insère jamais de retours à la ligne physiques bruts dans le texte JSON; utilise uniquement '\\n'.
  3. RECETTES COHÉRENTES: Au moins 5 ingrédients par plat. Profils classiques et savoureux. Allergènes rigoureux inclus.
  4. PORTION UNIQUE: Calibre toutes les quantités d'ingrédients pour une seule portion individuelle. Utilise des unités professionnelles ('g', 'ml', 'cl', 'cuillère à soupe', 'pincée', 'pièce').
  5. NOMS SUR L'ARDOISE: Les noms des plats doivent sonner comme ceux rédigés à la craie sur l'ardoise d'un bistrot rustique de qualité.

  CRITICAL: RÉPONDS STRICTEMENT EN JSON VALIDE EN FRANÇAIS. Les clés doivent être conservées telles quelles. Pas de texte explicatif avant ou après le JSON.
  STRUCTURE TECHNIQUE PHYSIQUE REQUISE:
  {
    "status": "success",
    "traditional_menu": [
      {
        "jour": "Menu Unique",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 50, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Étapes détaillées..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 150, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Étapes détaillées..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 30, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Étapes détaillées..."}
      }
    ]
  }`;
      } else if (type === "gastronomic") {
        prompt += `Agis en tant que Chef Exécutif 3 Étoiles Michelin d'un restaurant gastronomique de renommée mondiale.\n`;
        prompt += `Génère un UNIQUE MENU GASTRONOMIQUE DE HAUTE VOLÉE (1 Entrée, 1 Plat, 1 Dessert) d'un raffinement absolu.\n`;
        prompt += `Directives opérationnelles:
  1. PURE EXCELLENCE ET NOBLESSE: Utilise uniquement des matières premières d'exception et nobles (foie gras, truffe, caviar, homard, boeuf wagyu, feuilles d'or, herbes rares). Concentre-toi sur un dressage élégant, minimaliste et spectaculaire. Intègre des techniques virtuoses (émulsions ultra-légères, consommés limpides, jus corsés réduits à la perfection, glaçages miroirs).
  2. ÉTAPES DE PRÉPARATION: Minimum 6 phrases décrivant le processus en termes gastronomiques haut de gamme. N'insère jamais de retours à la ligne physiques bruts dans le texte JSON; utilise uniquement '\\n'.
  3. ALLERGÈNES ET MATIÈRES COHÉRENTES: Au moins 5 ingrédients d'excellence. Profils subtils, mariages poétiques de saveurs.
  4. PORTIONS DE DÉGUSTATION MINIMALISTES: Les assiettes gastronomiques utilisent des micro-quantités calibrées extrêmement finement pour une seule portion de dégustation (ex: 10g de caviar, 5ml d'huile parfumée, 80g de filet mignon).
  5. TITRES POÉTIQUES: Les intitulés de plats doivent être épurés, modernes et extrêmement évocateurs.

  CRITICAL: RÉPONDS UNIQUEMENT EN FORMAT JSON VALIDE EN FRANÇAIS. Les clés doivent rester identiques. Pas de texte explicatif avant ou après le JSON.
  STRUCTURE TECHNIQUE PHYSIQUE REQUISE:
  {
    "status": "success",
    "gastronomic_menu": [
      {
        "jour": "Repas Unique",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 40, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Étapes détaillées..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 120, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Étapes détaillées..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 20, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Étapes détaillées..."}
      }
    ]
  }`;
      }
    }

    else if (language === "es") {
      prompt += `MANDATO LINGÜÍSTICO CRÍTICO: TODA LA RESPUESTA (INCLUIDOS LOS NOMBRES DE LOS PLATOS, LOS INGREDIENTES, LOS PASOS DE LA RECETA Y LOS ALÉRGENOS) DEBE ESTAR ESCRITA EN UN ESPAÑOL PERFECTO Y GRAMATICALMENTE CORRECTO. NO MEZCLES IDIOMAS.\n\n`;
      if (pastNames) {
        prompt += `MANDATO DE MEMORIA: No generes ni sugieras las siguientes recetas creadas anteriormente: ${pastNames}.\n\n`;
      }

      if (type === "creative") {
        prompt += `Actúa como un Chef Visionario de Vanguardia especializado en cocina de fusión moderna y de vanguardia.\n`;
        if (isSingle) {
          prompt += `Genera un ÚNICO MENÚ CREATIVO COMPLETO (1 Entrada, 1 Plato Principal, 1 Postre) extremadamente elaborado. Debes utilizar técnicas culinarias profesionales (fermentaciones, espumas, crossovers inesperados). Concéntrate en maridajes de sabores sorprendentes y una innovación extrema.\n`;
        } else {
          prompt += `Genera un PLAN DE MENÚ CREATIVO DE 7 DÍAS extremadamente elaborado. Cada día debe incluir exactamente 1 Entrada, 1 Plato Principal y 1 Postre. Debes utilizar técnicas culinarias profesionales.\n${rotationText}\n`;
        }
        prompt += `Instrucciones operativas:
  1. EXCELENCIA CULINARIA: Rompe las reglas de la cocina tradicional. Inventa conceptos nuevos (ej. helados salados, demiglaces vegetales, salsas de frutas fermentadas). Describe procesos culinarios sofisticados.
  2. MENÚS COMPLETOS: Cada día DEBE tener un objeto completo para 'entree', 'plat' y 'dessert'. No dejes ningún plato vacío.
  3. PASOS DE PREPARACIÓN: Proporciona pasos de preparación ultra detallados (mínimo 6 oraciones por receta) ordenados cronológicamente. IMPORTANTE: NUNCA insertes saltos de línea físicos crudos en las cadenas JSON; usa exclusivamente '\\n' para saltos de línea. Cada propiedad debe ocupar exactamente una sola línea física en el JSON generado.
  4. RECETAS COHERENTES: Cada plato debe contener al menos 5 ingredientes distintos. Perfiles de sabores creativos pero con sentido culinario. Alérgenos rigurosos incluidos.
  5. CANTIDADES ESTRICTAS PARA UNA SOLA PORCIÓN: Calibra todas las cantidades de ingredientes para una sola porción individual. Usa unidades profesionales ('g', 'ml', 'cl', 'cuillère à café', 'pincée', 'pièce').
  6. UNICIDAD DE NOMBRES: Evita los clichés. Nombre creativo e inspirador para los platos.

  CRITICAL: RESPONDE ESTRICTAMENTE EN FORMATO JSON VÁLIDO EN ESPAÑOL. Las claves del objeto JSON (como 'jour', 'entree', 'nom') deben permanecer iguales para compatibilidad. Pas de texte explicatif avant ou après le JSON.
  ESTRUCTURA TÉCNICA REQUERIDA:
  {
    "status": "success",
    "creative_menu": [
      {
        "jour": "${isSingle ? 'Creación Única' : 'Nombre del Día'}",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 50, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Pasos detallados..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 150, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Pasos detallados..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 30, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Pasos detallados..."}
      }
    ]
  }`;
      } else if (type === "traditional") {
        prompt += `Actúa como un Maestro Restaurador de Élite y Guardián de la Tradición.\n`;
        prompt += `Genera un ÚNICO MENÚ DE BISTRÓ TRADICIONAL EXTREMADAMENTE DETALLADO (1 Entrada, 1 Plato Principal, 1 Postre).\n`;
        prompt += `Instrucciones operativas:
  1. COCINA DE BISTRÓ AUTÉNTICA: Concéntrate en recetas clásicas y reconfortantes de terroir (como boeuf bourguignon, blanqueta, tarta tatin) elevadas a estándares modernos. Sin cocina molecular, sin fusiones extrañas.
  2. PASOS DE PREPARACIÓN: Mínimo 6 oraciones detallando los guisados, dorados y reducciones cronológicamente. NUNCA uses saltos de línea físicos en el JSON; usa '\\n' para saltos de línea.
  3. RECETAS COHERENTES: Al menos 5 ingredientes por plato. Perfiles tradicionales. Alérgenos incluidos.
  4. PORCIÓN INDIVIDUAL: Cantidades calibradas exactamente para una sola porción. Usa unidades profesionales ('g', 'ml', 'cl', 'cuillère à soupe', 'pincée', 'pièce').
  5. NOMBRES EN LA PIZARRA: Los nombres de los platos deben sonar rústicos e inspiradores.

  CRITICAL: RESPONDE ESTRICTAMENTE EN JSON VÁLIDO EN ESPAÑOL. Las claves JSON deben ser idénticas. Pas de texte explicatif avant ou après le JSON.
  ESTRUCTURA TÉCNICA REQUERIDA:
  {
    "status": "success",
    "traditional_menu": [
      {
        "jour": "Menú Único",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 50, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Pasos detallados..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 150, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Pasos detallados..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 30, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Pasos detallados..."}
      }
    ]
  }`;
      } else if (type === "gastronomic") {
        prompt += `Actúa como un Chef Ejecutivo de 3 Estrellas Michelin en un restaurante de alta cocina de renombre mundial.\n`;
        prompt += `Genera un ÚNICO MENÚ GASTRONÓMICO DE ALTO NIVEL (1 Entrada, 1 Plato Principal, 1 Postre) extremadamente refinado y poético.\n`;
        prompt += `Instrucciones operativas:
  1. PURA EXCELENCIA Y NOBLEZA: Usa ingredientes nobles de alta gama (foie gras, trufa, caviar, langosta, wagyu, hierbas raras). Enfoque en presentación minimalista y artística. Emprende técnicas virtuosas (emulsiones, caldos claros, jugos reducidos, glaseados espejo).
  2. PASOS DE PREPARACIÓN: Mínimo 6 oraciones detalladas con términos culinarios de alta gama. NUNCA uses saltos de línea físicos en el JSON; usa '\\n'.
  3. ALÉRGENOS COMPLETILES: Al menos 5 ingredientes de alta calidad. Maridajes poéticos de sabores.
  4. PORCIONES DE DEGUSTACIÓN SUTILES: Cantidades para porción de degustación fina pequeña (ej. 10g de caviar, 5ml de aceite aromatizado, 80g de wagyu).
  5. NOMBRES POÉTICOS: Nombres poéticos, modernos y minimalistas para los platos.

  CRITICAL: RESPONDE ESTRICTAMENTE EN JSON VÁLIDO EN ESPAÑOL. Las claves deben mantenerse idénticas. Pas de texte explicatif avant ou après le JSON.
  ESTRUCTURA TÉCNICA REQUERIDA:
  {
    "status": "success",
    "gastronomic_menu": [
      {
        "jour": "Menú Único",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 40, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Pasos detallados..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 120, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Pasos detallados..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 20, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Pasos detallados..."}
      }
    ]
  }`;
      }
    }

    else if (language === "de") {
      prompt += `KRITISCHE SPRACHVORGABE: DIE GESAMTE ANTWORT (EINSCHLIESSLICH GERICHTSNAMEN, ZUTATEN, REZEPTSCHRITTE UND ALLERGENE) MUSS IN PERFEKTEM, GRAMMATIKALISCH KORREKTEM DEUTSCH VERFASST SEIN. KEINE SPRACHMISCHUNG.\n\n`;
      if (pastNames) {
        prompt += `GEDÄCHTNIS-MANDAT: Generieren oder schlagen Sie die folgenden zuvor erstellten Rezepte NICHT vor: ${pastNames}.\n\n`;
      }

      if (type === "creative") {
        prompt += `Agieren Sie als visionärer Avantgarde-Chefkoch, der auf moderne Fusionsküche spezialisiert ist.\n`;
        if (isSingle) {
          prompt += `Erstellen Sie ein EINZIGARTIGES, SEHR DETALLIERTES KREATIVES VOLLSTÄNDIGES MENÜ (1 Vorspeise, 1 Hauptgericht, 1 Dessert). Sie müssen professionelle Kochtechniken anwenden (Fermentation, Schäume, unerwartete süß-salzige Kombinationen). Konzentrieren Sie sich auf überraschende Geschmackspaarungen und extreme Innovation.\n`;
        } else {
          prompt += `Erstellen Sie einen KREATIVEN 7-TAGE-MENÜPLAN. Jeder Tag muss genau 1 Vorspeise, 1 Hauptgericht und 1 Dessert enthalten. Nutzen Sie professionelle Kochtechniken.\n${rotationText}\n`;
        }
        prompt += `Betriebliche Richtlinien:
  1. KULINARISCHE EXZELLENZ: Brechen Sie die Regeln der traditionellen Küche. Erfinden Sie neue Konzepte (z.B. herzhaftes Eis, Gemüse-Demiglace, fermentierte Fruchtsaucen). Beschreiben Sie anspruchsvolle Kochverfahren in opulent hergestellten Absätzen.
  2. VOLLSTÄNDIGE MENÜS: Jeder Tag MUSS ein vollständiges Objekt für 'entree', 'plat' und 'dessert' enthalten. Lassen Sie keine Gänge leer.
  3. ZUBEREITUNGSSCHRITTE: Stellen Sie extrem detaillierte Zubereitungsschritte bereit (mindestens 6 Sätze pro Rezept) in chronologischer Reihenfolge. WICHTIG: Verwenden Sie NIEMALS echte physische Zeilenumbrüche im JSON-Text; verwenden Sie ausschließlich das Metazeichen '\\n' für Zeilenumbrüche. Jede Eigenschaft muss in einer einzigen Zeile im JSON-Code stehen.
  4. STIMMIGE REZEPTE: Jedes Gericht muss mindestens 5 unterschiedliche Zutaten enthalten. Kreative, aber kulinarisch stimmige Geschmacksprofile. Inklusive strenger Allergenliste.
  5. MENGEN FÜR EINE PORTION: Alle Zutatenmengen müssen exakt auf EINE EINZELPORTION ausgestellt sein. Nutzen Sie professionelle Einheiten ('g', 'ml', 'cl', 'cuillère à café', 'pincée', 'pièce').
  6. EINZIGARTIGE TITEL: Vermeiden Sie Klischees. Verwandeln Sie Standardzutaten in kreative Namen.

  CRITICAL: ANTWORTEN SIE STRENG ALS GÜLTIGES JSON-FORMAT AUF DEUTSCH. Die JSON-Schlüssel (wie 'jour', 'entree', 'nom') müssen für Systemkompatibilität beibehalten werden. Keine Erklärungen vor oder nach dem JSON.
  ERFORDERLICHE STRUKTUR:
  {
    "status": "success",
    "creative_menu": [
      {
        "jour": "${isSingle ? 'Kreation' : 'Tagesname'}",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 50, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Detaillierte Schritte..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 150, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Detaillierte Schritte..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 30, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Detaillierte Schritte..."}
      }
    ]
  }`;
      } else if (type === "traditional") {
        prompt += `Agieren Sie als Elite-Maître-Restaurateur und Hüter der traditionellen Bistro-Kultur.\n`;
        prompt += `Erstellen Sie ein SEHR DETAILLIERTES traditionelles Bistro-Menü (1 Vorspeise, 1 Hauptgericht, 1 Dessert).\n`;
        prompt += `Betriebliche Richtlinien:
  1. AUTHENTISCHE BISTRO-KÜCHE: Konzentrieren Sie sich auf traditionelle, herzerwärmende Klassiker der französischen Bistro-Kultur (wie Boeuf Bourguignon, Blanquette de veau, Tarte Tatin), angepasst an moderne Bistronomie-Standards. Keine molekulare Chemie, keine bizarren Fusionen.
  2. ZUBEREITUNGSSCHRITTE: Mindestens 6 detaillierte Sätze, die das Schmoren, Braten und Reduzieren chronologisch beschreiben. NIEMALS echte Zeilenumbrüche im JSON verwenden; nutzen Sie immer '\\n'.
  3. STIMMIGE REZEPTE: Mindestens 5 Zutaten pro Gericht. Klassische Geschmacksprofile. Allergene sorgfältig angeben.
  4. EINZELNE PORTION: Alle Mengen müssen perfekt für eine Einzelportion ausgelegt sein. Nutzen Sie professionelle Einheiten ('g', 'ml', 'cl', 'cuillère à soupe', 'pincée', 'pièce').
  5. NAMEN WIE AUF DER SCHIEFERTAFEL: Die Namen der Gerichte müssen wie kreidegeschrieben auf einer rustikalen Bistro-Tafel klingen.

  CRITICAL: ANTWORTEN SIE STRENG ALS GÜLTIGES JSON-FORMAT AUF DEUTSCH. Die Schlüssel müssen unverändert bleiben. Keine Erklärungen vor oder nach dem JSON.
  ERFORDERLICHE STRUKTUR:
  {
    "status": "success",
    "traditional_menu": [
      {
        "jour": "Einzigartiges Menü",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 50, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Detaillierte Schritte..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 150, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Detaillierte Schritte..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 30, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Detaillierte Schritte..."}
      }
    ]
  }`;
      } else if (type === "gastronomic") {
        prompt += `Agieren Sie als 3-Sterne-Michelin-Küchenchef eines weltbekannten Gourmet-Restaurants.\n`;
        prompt += `Erstellen Sie ein EINZIGARTIGES, EXTREM DETAILLIERTES Gourmet-Menü (1 Vorspeise, 1 Hauptgericht, 1 Dessert) von absolutem Raffinement.\n`;
        prompt += `Betriebliche Richtlinien:
  1. SPITZENKÜCHE & EDLE ZUTATEN: Verwenden Sie ausschließlich erstklassige, edle Zutaten (Foie Gras, Trüffel, Kaviar, Hummer, Wagyu-Rind, seltene Kräuter). Minimalistische und spektakuläre Präsentation. Nutzen Sie virtuose Techniken (leichte Emulsionen, klare Consommés, Spiegelglasuren, perfekte Saucenreduktionen).
  2. ZUBEREITUNGSSCHRITTE: Mindestens 6 Sätze in gehobener kulinarischer Sprache. NIEMALS echte physische Zeilenumbrüche im JSON; nutzen Sie immer '\\n'.
  3. STIMMIGE REZEPTE: Mindestens 5 exzellente Zutaten. Poetische Aromenkombinationen. Allergene erfassen.
  4. MINIMALISTISCHE VERKOSTUNGSPORTIONEN: Stellen Sie die Mengen für eine sehr kleine, feine Feinschmecker-Verkostung ein (z. B. 10 g Kaviar, 5 ml aromatisierte Oel, 80 g Wagyu-Filet).
  5. POETISCHE TITEL: Klare, moderne und poetische Bezeichnungen.

  CRITICAL: ANTWORTEN SIE STRENG ALS GÜLTIGES JSON-FORMAT AUF DEUTSCH. Keine Erklärungen vor oder nach dem JSON.
  ERFORDERLICHE STRUKTUR:
  {
    "status": "success",
    "gastronomic_menu": [
      {
        "jour": "Feinschmecker-Menü",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 40, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Detaillierte Schritte..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 120, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Detaillierte Schritte..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 20, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Detaillierte Schritte..."}
      }
    ]
  }`;
      }
    }

    else if (language === "it") {
      prompt += `MANDATO LINGUISTICO CRITICO: TUTTA LA RISPOSTA (INCLUSI I NOMI DEI PIATTI, GLI INGREDIENTI, I PASSAGGI DELLA RICETTA E GLI ALLERGENI) DEVE ESSERE SCRITTA IN UN ITALIANO PERFETTO E GRAMMATICALMENTE CORRETTO. NON MISCHIARE LE LINGUE.\n\n`;
      if (pastNames) {
        prompt += `MANDATO DI MEMORIA: Non generare o suggerire le seguenti ricette precedentemente generate: ${pastNames}.\n\n`;
      }

      if (type === "creative") {
        prompt += `Agisci come uno Chef Visionario d'Avanguardia specializzato in cucina d'avanguardia e fusion globale.\n`;
        if (isSingle) {
          prompt += `Genera un SINGOLO MENU CREATIVO COMPLETO (1 Antipasto, 1 Primo/Secondo, 1 Dolce) estremamente elaborato. Devi usare tecniche culinarie professionali (fermentazioni, schiume, fusioni inaspettate). Concentrati su abbinamenti sorprendenti e un'estrema innovazione.\n`;
        } else {
          prompt += `Genera un PIANO DI MENU CREATIVO DI 7 GIORNI estremamente elaborato. Ogni giorno deve includere esattamente 1 Antipasto, 1 Primo/Secondo e 1 Dolce. Usa tecniche professionali d'avanguardia.\n${rotationText}\n`;
        }
        prompt += `Istruzioni operative:
  1. ECCELLENZA CULINARIA: Rompi le regole della cucina tradizionale. Inventa concetti inediti (es. gelati salati, demiglace vegetali, salse di frutta fermentata). Descrivi processi culinari complessi ed eleganti.
  2. MENU COMPLETI: Ogni giorno DEVE contenere un oggetto completo per 'entree', 'plat' e 'dessert'. No campi vuoti.
  3. PASSAGGI DI PREPARAZIONE: Fornisci passaggi di preparazione ultra-dettagliati (minimo 6 frasi per ricetta) in ordine cronologico. IMPORTANTE: Non inserire MAI veri ritorni a capo fisici nelle stringhe JSON; usa esclusivamente '\\n' per andare a capo nel testo. Ciascuna proprietà deve stare su una sola riga nel JSON generato.
  4. RICETTE COERENTI: Ciascun piatto deve contenere almeno 5 ingredienti distinti. Profili gustativi geniali ma coerenti. Allergeni elencati rigorosamente.
  5. QUANTITÀ PER UNA INVOLUCRATA PORTIONE: Tutte le quantità calibrate per ESATTAMENTE UNA SINGOLA PORZIONE. Usa unità di dicitura professionale ('g', 'ml', 'cl', 'cuillère à café', 'pincée', 'pièce').
  6. UNICITÀ DEI NOMI: Evita luoghi comuni. Nomi creativi, moderni e ispirati.

  CRITICAL: RISPONDI STRETTAMENTE IN FORMATO JSON VALIDO IN ITALIANO. Le chiavi JSON (como 'jour', 'entree', 'nom') rimangono identiche per compatibilità. Senza commenti extra.
  STRUTTURA TECNICA RICHIESTA:
  {
    "status": "success",
    "creative_menu": [
      {
        "jour": "${isSingle ? 'Creazione Unica' : 'Nome del Giorno'}",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 50, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Passaggi dettagliati..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 150, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Passaggi dettagliati..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 30, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Passaggi dettagliati..."}
      }
    ]
  }`;
      } else if (type === "traditional") {
        prompt += `Agici come un Maestro Ristoratore d'Élite e Custode della Tradizione del bistrot.\n`;
        prompt += `Genera un MENU DA BISTROT TRADIZIONALE ESTREMAMENTE DETTAGLIATO (1 Antipasto, 1 Primo/Secondo, 1 Dolce).\n`;
        prompt += `Istruzioni operative:
  1. CUCINA DA BISTROT AUTENTICA: Concentrati su ricette classiche, confortanti e genuine (come stufati, blanquette, tarte tatin) elevate alla bistronomia moderna. Niente chimica o fuzioni strambe.
  2. PASSAGGI DI PREPARAZIONE: Minimo 6 frasi dettagliate sul brasare, sobbollire, sfumare in ordine cronologico. NON usare mai a capo reali nel testo JSON; usa sempre '\\n'.
  3. RICETTE COERENTI: Almeno 5 ingredienti per piatto. Gusto autentico. Allergeni elencati con cura.
  4. SINGOLA PORTIONE: Ingredienti calibrati per una sola porzione. Usa unità professionali ('g', 'ml', 'cl', 'cuillère à soupe', 'pincée', 'pièce').
  5. NOME SULLA LAVAGNA: I titoli delle ricette devono suonare evocativi e rustici come su una ardesia di un vero bistrot di una volta.

  CRITICAL: RISPONDI STRETTAMENTE IN JSON VALIDO IN ITALIANO. Le chiavi rimangono quelle predefinite. Senza commenti extra.
  STRUTTURA TECNICA RICHIESTA:
  {
    "status": "success",
    "traditional_menu": [
      {
        "jour": "Menu Unico",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 50, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Passaggi dettagliati..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 150, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Passaggi dettagliati..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 30, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Passaggi dettagliati..."}
      }
    ]
  }`;
      } else if (type === "gastronomic") {
        prompt += `Agici come un Executive Chef Stellato di un ristorante gourmet di fama mondiale.\n`;
        prompt += `Genera un SINGOLO MENU GASTRONOMICO DI ALTO LIVELLO ESTREMAMENTE DETTAGLIATO (1 Antipasto, 1 Primo/Secondo, 1 Dolce) con cura sublime.\n`;
        prompt += `Istruzioni operative:
  1. ECCELLENZA ASSOLUTA E MATERIE NOBILI: Utilizza solo ingredienti nobili (foie gras, tartufo, caviale, astice, wagyu, erbe aromatiche rare). Enfatizza un impiattamento artistico e di forte impatto. Implementa tecniche raffinate come emulsioni finissime, consommés cristallini, riduzioni perfette di sughi ristretti, glasse a specchio.
  2. PASSAGGI DI PREPARAZIONE: Almeno 6 frasi scritte con terminologia culinaria gourmet. NON inserire a capo fisici nel testo JSON; usa solo '\\n'.
  3. ABBINAMENTI PERFETTI: Almeno 5 ingredienti sublimi. Sottili accostamenti poetici di sapore.
  4. MICRO-PORTIONISTICA DA DEGUSTAZIONE: Ingredienti calibrati per una piccola e raffinata porzione da menù degustazione (es: 10g caviale, 5ml olio aromatizzato, 80g filetto).
  5. TITOLI POETICI: Nomi brevi, minimalisti e poetici d'alta cucina.

  CRITICAL: RISPONDI STRETTAMENTE IN JSON VALIDO IN ITALIANO. Le chiavi rimangono immutate. Senza commenti extra.
  STRUTTURA TECNICA RICHIESTA:
  {
    "status": "success",
    "gastronomic_menu": [
      {
        "jour": "Menu Unico",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 40, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Passaggi dettagliati..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 120, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Passaggi dettagliati..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 20, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Passaggi dettagliati..."}
      }
    ]
  }`;
      }
    }

    else {
      // Default to EN if not FR/ES/DE/IT
      prompt += `CRITICAL LANGUAGE MANDATE: THE ENTIRE RESPONSE (INCLUDING DISH NAMES, INGREDIENTS, RECIPE STEPS, AND ALLERGENS) MUST BE WRITTEN IN PERFECT, GRAMMATICALLY CORRECT ENGLISH. DO NOT MIX LANGUAGES.\n\n`;
      if (pastNames) {
        prompt += `MEMORY MANDATE: Do NOT generate or suggest any of the following previously generated recipes: ${pastNames}.\n\n`;
      }

      if (type === "creative") {
        prompt += `Act as a Visionary Avant-Garde Chef specializing in Modernist and Global Fusion Cuisine.\n`;
        if (isSingle) {
          prompt += `Generate a SINGLE HIGHLY ELABORATE CREATIVE FULL-COURSE MENU (1 Entree, 1 Plat, 1 Dessert). You MUST use professional culinary techniques (fermentations, foams, unexpected savory/sweet crossovers). Focus on shocking flavor pairings, avant-garde fusion, and extreme innovation.\n`;
        } else {
          prompt += `Generate a 7-DAY HIGHLY ELABORATE CREATIVE FULL-COURSE MENU. Each day must include exactly 1 Entree, 1 Plat, and 1 Dessert. You MUST use professional culinary techniques. Focus on shocking flavor pairings, avant-garde fusion, and extreme innovation.\n${rotationText}\n`;
        }
        prompt += `Operational Mandates:
  1. CULINARY EXCELLENCE: Break the rules of traditional cooking. Invent new concepts (e.g., savory ice creams, vegetable demiglaces, fermented fruit sauces). Write sophisticated chef techniques in eloquent paragraphs.
  2. FULL COURSE MENUS: Every day MUST have a complete 'entree', 'plat', and 'dessert' object. Do not leave any course empty.
  3. PREPARATION STEPS QUALITY: Provide ULTRA DETAILED preparation_steps (min 6 sentences per recipe). IMPORTANT: DO NOT write robotic, repetitive steps. Write natural, flowing paragraphs describing the culinary process chronologically. IMPORTANT: DO NOT insert raw, physical newlines inside string values in the JSON output; use '\\n' for line breaks. Each property must fit onto exactly one line in the raw generated JSON.
  4. COHERENT RECIPES: Each dish MUST have at least 5 distinct ingredients. Flavor profiles must make culinary sense. Include a rigorous allergens list.
  5. STRICT REALISTIC QUANTITIES (FOR 1 PORTION ONLY): Ensure ALL ingredient quantities are scaled precisely for exactly ONE SINGLE PORTION. Use professional units ('g', 'ml', 'cl', 'cuillère à café', 'pincée', 'pièce').
  6. CRITICAL NAME UNIQUENESS: DO NOT use cliché names. Transform everyday ingredients into unique and inspiring dish names.

  CRITICAL: RESPOND STRICTLY AND ONLY IN VALID JSON FORMAT IN ENGLISH. Note: JSON keys ('jour', 'entree', 'nom') must remain as specified for system compatibility, but string values must be in English. No explanations.
  REQUIRED STRUCTURE:
  {
    "status": "success",
    "creative_menu": [
      {
        "jour": "${isSingle ? 'Unique Creation' : 'Day Name in English'}",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 50, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Steps..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 150, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Steps..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 30, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Steps..."}
      }
    ]
  }`;
      } else if (type === "traditional") {
        prompt += `Act as an Elite Maître Restaurateur and Guardian of Authentic Bistro Culture.\n`;
        prompt += `Generate a SINGLE EXTREMELY DETAILED traditional bistro menu (1 Entree, 1 Plat, 1 Dessert).\n`;
        prompt += `Operational Mandates:
  1. CHIC BISTRO CUISINE: Focus on comforting, generous, classic authentic French dishes (like boeuf bourguignon, blanquette, tarte tatin) elevated to modern Bistronomy standards. No molecular chemistry, no fusions.
  2. PREPARATION STEPS QUALITY: Provide ULTRA DETAILED preparation_steps (min 6 sentences per recipe) chronologically. DO NOT write raw, physical newlines in JSON; use '\\n'.
  3. COHERENT RECIPES: Each dish MUST have at least 5 distinct ingredients. Bistro classics. Include allergens.
  4. STRICT PORTION WEIGHTS: All quantities must be scaled for exactly ONE SINGLE PORTION. Use professional units ('g', 'ml', 'cl', 'cuillère à soupe', 'pincée', 'pièce').
  5. UNIQUE NAMES: Names must sound rustic and authentic, like chalk-written titles on a high-grade blackboard.

  CRITICAL: RESPOND STRICTLY AND ONLY IN VALID JSON FORMAT IN ENGLISH.
  REQUIRED STRUCTURE:
  {
    "status": "success",
    "traditional_menu": [
      {
        "jour": "Unique Menu",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 50, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Steps..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 150, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Steps..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 30, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Steps..."}
      }
    ]
  }`;
      } else if (type === "gastronomic") {
        prompt += `Act as a 3-Michelin Star Executive Chef of a world-renowned Fine Dining Restaurant.\n`;
        prompt += `Generate a SINGLE EXTREMELY DETAILED gastronomic full-course meal (1 Entree, 1 Plat, 1 Dessert) of absolute elegance.\n`;
        prompt += `Operational Mandates:
  1. PURE LUXURY & FINE DINING: Use only premium, noble ingredients (foie gras, truffles, sea urchin, caviar, lobster, wagyu, rare herbs). Focus on absolute perfection, minimalist but striking presentation, and poetic names. Emprende techniques like light emulsions, clear consommés, perfectly reduced jus, mirror glazes.
  2. PREPARATION STEPS: Min 6 sentences in high-end gastronomic language. DO NOT insert physical enter/newline breaks in JSON string properties; use '\\n'.
  3. ACCURATE ALLERGENS AND PAIRINGS: At least 5 high-end ingredients. Simple but sublime flavor pairings.
  4. PORTIONS DE TASTING: Quantities scaled precisely for a single small, finely plated tasting portion (e.g., 10g caviar, 5ml infused oil, 80g beef).
  5. POETIC TITLES: Minimalist, sophisticated and elegant titles.

  CRITICAL: RESPOND STRICTLY AND ONLY IN VALID JSON FORMAT IN ENGLISH.
  REQUIRED STRUCTURE:
  {
    "status": "success",
    "gastronomic_menu": [
      {
        "jour": "Unique Dish",
        "entree": {"nom": "...", "ingredients": [{"name": "...", "quantite": 40, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Steps..."},
        "plat": {"nom": "...", "ingredients": [{"name": "...", "quantite": 120, "unite": "g"}], "allergens": ["..."], "preparation_steps": "Steps..."},
        "dessert": {"nom": "...", "ingredients": [{"name": "...", "quantite": 20, "unite": "ml"}], "allergens": ["..."], "preparation_steps": "Steps..."}
      }
    ]
  }`;
      }
    }

    return prompt;
  }

  export const STANDARD_QUANTITIES_PROMPT = `
        IMPORTANT: Respecte IMP\xC9RATIVEMENT CES STANDARDS DE QUANTIT\xC9S PAR PERSONNE :
        - INTERDICTION ABSOLUE : N'utilise JAMAIS de "L\xE9gumes surgel\xE9s" dans tes recettes. Utilise uniquement des produits FRAIS et de SAISON.
        - ENTR\xC9ES : Charcuteries diverses (60g), Jambon (70g), Terrine ou p\xE2t\xE9 (60g), Pizza/quiche/tartes sal\xE9es (100g), Crudit\xE9s fra\xEEches (150g), F\xE9culents en salade - riz, p\xE2tes, taboul\xE9 (80g).
        - P\xC2TES - RIZ : P\xE2tes de bl\xE9 dur (150g en plat, 125g en garniture), Tagliatelle (150g en plat, 125g en garniture), Gnocchi (350g en plat, 300g en garniture), Raviolis et autres farcies (380g), Riz (125g).
        - POISSONS : En filets (145g), Calamars et autres (200g), Fruits de mer (100g).
        - VIANDES : Poitrine de boeuf (180g), Entrec\xF4te (180g), Viande hach\xE9e (145g), Saut\xE9s boeuf, veau, porc, dinde, poulet (220g), Saut\xE9 de canard (280g), R\xF4ti boeuf, dinde, veau, porc, agneau (180g).
        - GARNITURES : L\xE9gumes FRAIS du march\xE9 (250g), Lentilles (125g), Frites et autres pdt (250g), Polenta (60g), Quinoa (250g), Ebly (125g).
        - AUTRES : Pesto (80g).
  `;

  export const STANDARD_QUANTITIES_IT_PROMPT = `
        IMPORTANTE: RISPETTATE TASSATIVAMENTE QUESTI STANDARD QUANTITATIVI A PERSONA:
        - DIVIETO ASSOLUTO: Non utilizzate MAI "verdure surgelate" nelle vostre ricette. Usate solo prodotti FRESCHI e DI STAGIONE.
        - ANTIPASTI: Salumi misti (60g), Prosciutto (70g), Terrina o paté (60g), Pizza/quiche/torte salate (100g), Verdure crude fresche (150g), Insalate di amidi - riso, pasta, tabbouleh (80g).
        - PASTA - RISO: Pasta di grano duro (150g come piatto principale, 125g come contorno), Tagliatelle (150g principale, 125g contorno), Gnocchi (350g principale, 300g contorno), Ravioli e altre paste ripiene (380g), Riso (125g).
        - PESCE: Fileti (145g), Calamari e simili (200g), Frutti di mare (100g).
        - CARNE: Punta di petto di manzo (180g), Entrecôte (180g), Carne macinata (145g), Manzo, vitello, maiale, tacchino, pollo saltati (220g), Anatra saltata (280g), Arrosto di manzo, tacchino, vitello, maiale, agnello (180g).
        - CONTORNI: Verdure FRESCHE di mercato (250g), Lenticchie (125g), Patatine fritte e altre patate (250g), Polenta (60g), Quinoa (250g), Ebly/Grano (125g).
        - ALTRO: Pesto (80g).
`;

  export const STANDARD_QUANTITIES_DE_PROMPT = `
        WICHTIG: BEFOLGEN SIE UNBEDINGT DIESE MENGENSTANDARDS PRO PERSON:
        - ABSOLUTES VERBOT: Verwenden Sie NIEMALS "tiefgefrorenes Gemüse" in Ihren Rezepten. Verwenden Sie nur FRISCHE und SAISONALE Produkte.
        - VORSPEISEN: Verschiedene Aufschnitte (60g), Schinken (70g), Terrine oder Pastete (60g), Pizza/Quiche/herzhafte Kuchen (100g), Frische Rohkost (150g), Stärkehaltige Salate - Reis, Nudeln, Taboulé (80g).
        - NUDELN / REIS: Hartweizennudeln (150g Hauptgericht, 125g Beilage), Tagliatelle (150g Hauptgericht, 125g Beilage), Gnocchi (350g Hauptgericht, 300g Beilage), Ravioli und andere gefüllte Nudeln (380g), Reis (125g).
        - FISCH: Filets (145g), Tintenfisch und Ähnliches (200g), Meeresfrüchte (100g).
        - FLEISCH: Rinderbrust (180g), Entrecôte (180g), Hackfleisch (145g), Rind-, Kalb-, Schweine-, Puten-, Hühnerpfanne (220g), Entenpfanne (280g), Rinder-, Puten-, Kalbs-, Schweine-, Lammbraten (180g).
        - BEILAGEN: FRISCHES Marktgemüse (250g), Linsen (125g), Pommes frites und andere Kartoffeln (250g), Polenta (60g), Quinoa (250g), Ebly (125g).
        - ANDERE: Pesto (80g).
`;
  export const STANDARD_QUANTITIES_ENG_PROMPT = `
        IMPORTANT: ABSOLUTELY REQUIRE THESE QUANTITY STANDARDS PER PERSON:
        - ABSOLUTE PROHIBITION: NEVER use "frozen vegetables" in your recipes. Use only FRESH and SEASONAL products.
        - STARTERS: Various cold cuts (60g), Ham (70g), Terrine or p\xE2t\xE9 (60g), Pizza/quiche/savory tarts (100g), Fresh raw vegetables (150g), Starchy salads - rice, pasta, tabbouleh (80g).
        - PASTA - RICE: Durum wheat pasta (150g as a main dish, 125g as a side), Tagliatelle (150g as a main dish, 125g as a side), Gnocchi (350g as a main dish, 300g as a side), Ravioli and other stuffed pasta (380g), Rice (125g).
        - FISH: Fillets (145g), Squid and others (200g), Seafood (100g).
        - MEAT: Beef brisket (180g), Rib steak (180g), Minced meat (145g), Beef, veal, pork, turkey, chicken stir-fry (220g), Duck stir-fry (280g), Roast beef, turkey, veal, pork, lamb (180g).
        - SIDE DISHES: FRESH market vegetables (250g), Lentils (125g), Fries and other potatoes (250g), Polenta (60g), Quinoa (250g), Ebly/Wheat (125g).
        - OTHERS: Pesto (80g).
  `;
  export const STANDARD_QUANTITIES_ES_PROMPT = `
        IMPORTANTE: RESPETA IMPERATIVAMENTE ESTOS EST\xC1NDARES DE CANTIDADES POR PERSONA:
        - PROHIBICI\xD3N ABSOLUTA: NUNCA utilices "verduras congeladas" en tus recetas. Utiliza \xFAnicamente productos FRESCOS y de TEMPORADA.
        - ENTRANTES: Embutidos varios (60g), Jam\xF3n (70g), Terrina o pat\xE9 (60g), Pizza/quiche/tartas saladas (100g), Verduras crudas frescas (150g), Ensaladas de almid\xF3n (arroz, pasta, tabul\xE9) (80g).
        - PASTA - ARROZ: Pasta de trigo duro (150g como plato principal, 125g como guarnici\xF3n), Tallarines (150g principal, 125g guarnici\xF3n), Gnocchi (350g principal, 300g guarnici\xF3n), Raviolis y otras pastas rellenas (380g), Arroz (125g).
        - PESCADOS: En filetes (145g), Calamares y otros (200g), Mariscos (100g).
        - CARNES: Pecho de ternera (180g), Entrecot (180g), Carne picada (145g), Salteados de ternera, cerdo, pavo, pollo (220g), Salteado de pato (280g), Asado de ternera, pavo, cerdo, cordero (180g).
        - GUARNICIONES: Verduras FRESCAS de mercado (250g), Lentejas (125g), Patatas fritas y otras patatas (250g), Polenta (60g), Quinoa (250g), Trigo (125g).
        - OTROS: Pesto (80g).
  `;
