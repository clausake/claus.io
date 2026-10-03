#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""REGISTRE des mutations du contrat DASHBOARD (Sprint 13).

Pourquoi un fichier et non des litteraux dans le script: le poste rogne et
double les emissions longues, et une ancre mal transcrite ne mord JAMAIS — ce
qui se presente comme « la mutation ne mord pas » alors que c'est l'ancre qui
est morte (la faute consignee du 09/09). Les ancres vivent donc dans un fichier
de DONNEES, et chaque ancre est comptee sur les octets relus avant de juger.

Les ancres portent les lignes DISTINCTES de leur bloc pour muter la BRANCH d'un
SEUL bloc. La route cost-data porte la requete SUM(total_amount) GROUP BY date
(la borne de fin, jugee par D2) et la boucle labor (jugee par D3); la route
stock-data porte la requete SUM(quantity*unit_price) GROUP BY category (jugee
par D5) et la boucle colors (jugee par D5). La borne de fin est une REGLE
PARTAGEE par les DEUX tests qui lisent les documents (D2 et D3) : pour que la
mutation ne morde que UNE voie, D3 ne juge plus le cout de la facture (son
assert cout a ete retire — la regle de cout est jugee par D2 seule), et la
mutation `date < ?` ne morde que D2. La liste des couleurs et le GROUP BY sont
jugees par D5/D4, et les DEUX mutations de stock-data portent des ancres qui ne
se recouvrent pas (la concat injecte une ligne extra que D4 juge et D5 ignore,
car l'UI filtre les valeurs nulles).
"""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RT = os.path.join(BASE, "src", "routes", "dashboard.ts")

NL = chr(10)


def L(*lignes):
    return NL.join(list(lignes))


MUTATIONS = [
    dict(id="M1", fichier=RT, attendu="D1",
         titre="la route cost-data redevient une SEMAINE FACTICE sur zero ligne",
         avant=L(
             '  // LE CONTRAT (Sprint 13): la route rend la FENETRE REELLE, jamais une semaine',
             '  // inventee. Sur une base sans facture ni planning, le result contient les jours',
             '  // du creneau avec cout=0 et labor=0 (l\'UI dessine ce qu\'il y a, pas ce qu\'il',
             '  // n\'y a pas). Le fallback FAIT FAUX (Lun 4200 ... Dim) sur zero ligne: c\'est la',
             '  // famille de Sprint 10 (« un mode qui ment sur ses donnees »), consigne pour',
             '  // la meme faute sur /api/purchasing/forecast.',
             '  res.json(result);',
         ),
         apres=L(
             '  // LE CONTRAT (Sprint 13): la route rend la FENETRE REELLE, jamais une semaine',
             '  // inventee. Sur une base sans facture ni planning, le result contient les jours',
             '  // du creneau avec cout=0 et labor=0 (l\'UI dessine ce qu\'il y a, pas ce qu\'il',
             '  // n\'y a pas). Le fallback FAIT FAUX (Lun 4200 ... Dim) sur zero ligne: c\'est la',
             '  // famille de Sprint 10 (« un mode qui ment sur ses donnees »), consigne pour',
             '  // la meme faute sur /api/purchasing/forecast.',
             '  if (totalFood === 0 && totalLabor === 0) {',
             '    return res.json([',
             '      { name: "Lun", cout: 4200, labor: 1200 },',
             '      { name: "Mar", cout: 3800, labor: 1200 },',
             '      { name: "Mer", cout: 5100, labor: 1400 },',
             '      { name: "Jeu", cout: 4600, labor: 1200 },',
             '      { name: "Ven", cout: 5900, labor: 1800 },',
             '      { name: "Sam", cout: 6200, labor: 2000 },',
             '      { name: "Dim", cout: 3100, labor: 1000 },',
             '    ]);',
             '  }',
             '  res.json(result);',
         )),
    dict(id="M2", fichier=RT, attendu="D2",
         titre="la borne de fin du creneau redevient EXCLUSIVE (la facture sort du corps)",
         avant=L(
             '  const foodCosts = await db.all(`',
             '    SELECT ',
             '      date,',
             '      SUM(total_amount) as total',
             '    FROM documents ',
             '    WHERE date >= ? AND date <= ?',
             '    GROUP BY date',
             '  `, [startDate, endDate]);',
         ),
         apres=L(
             '  const foodCosts = await db.all(`',
             '    SELECT ',
             '      date,',
             '      SUM(total_amount) as total',
             '    FROM documents ',
             '    WHERE date >= ? AND date < ?',
             '    GROUP BY date',
             '  `, [startDate, endDate]);',
         )),
    dict(id="M3", fichier=RT, attendu="D3",
         titre="le labor redevient une somme inventee (0 au lieu du chiffre relus)",
         avant=L(
             '        const [h1, m1] = slot.start_time.split(":").map(Number);',
             '        const [h2, m2] = slot.end_time.split(":").map(Number);',
             '        let diff = h2 * 60 + m2 - (h1 * 60 + m1);',
             '        if (diff < 0) diff += 24 * 60;',
             '        memberHours += diff / 60;',
         ),
         apres=L(
             '        const [h1, m1] = slot.start_time.split(":").map(Number);',
             '        const [h2, m2] = slot.end_time.split(":").map(Number);',
             '        let diff = h2 * 60 + m2 - (h1 * 60 + m1);',
             '        if (diff < 0) diff += 24 * 60;',
             '        memberHours += 0;',
         )),
    dict(id="M4", fichier=RT, attendu="D5",
         titre="la somme des prix redevient la SOMME DES QUANTITES (sans unit_price)",
         avant=L(
             '    "SELECT category as name, SUM(quantity * unit_price) as value FROM inventory GROUP BY category",',
         ),
         apres=L(
             '    "SELECT category as name, SUM(quantity) as value FROM inventory GROUP BY category",',
         )),
    dict(id="M5", fichier=RT, attendu="D5",
         titre="la couleur redevient ABSENTE (le mapped objet ne la porte plus)",
         avant=L(
             '  res.json(',
             '    data.map((d, i) => ({ ...d, color: colors[i % colors.length] })),',
             '  );',
         ),
         apres=L(
             '  res.json(',
             '    data.map((d, i) => ({ ...d })),',
             '  );',
         )),
    dict(id="M6", fichier=RT, attendu="D4",
         titre="stock-data injecte une ligne sur une base VIDE (un PASS creux qui rend un corps non vide)",
         avant=L(
             '  res.json(',
             '    data.map((d, i) => ({ ...d, color: colors[i % colors.length] })),',
             '  );',
         ),
         apres=L(
             '  res.json(',
             '    data.map((d, i) => ({ ...d, color: colors[i % colors.length] })).concat([{ name: "Vide", value: 0, color: "#000000" }]),',
             '  );',
         )),
    dict(id="M7", fichier=RT, attendu="S1",
         titre="la purge des alertes de stock ne s execute jamais (l alerte persiste apres la DELETE)",
         avant=L(
            '  const lowStockIds =',
            '    lowStockItems.length > 0',
            "      ? lowStockItems.map((i) => \"'stock_\" + i.id + \"'\").join(\",\")",
            "      : \"'none'\";",
            '  await db.run(',
            '    `DELETE FROM alerts WHERE id LIKE \'stock_%\' AND id NOT IN (${lowStockIds})`,',
            '  );',
         ),
         apres=L(
            '  const lowStockIds =',
            '    lowStockItems.length > 0',
            "      ? lowStockItems.map((i) => \"'stock_\" + i.id + \"'\").join(\",\")",
            "      : \"'none'\";",
            '  await db.run(',
            '    `UPDATE alerts SET status = \'resolved\' WHERE id = \'stock_never_exists\'`,',
            '  );',
         )),
    dict(id="M8", fichier=RT, attendu="S2",
         titre="le COUNT des articles critiques redevient le COUNT des articles ok",
         avant=L(
            '  const critical = await db.get(',
            "    'SELECT COUNT(*) as count FROM inventory WHERE status = \"critical\"',",
            '  );',
         ),
         apres=L(
            '  const critical = await db.get(',
            "    'SELECT COUNT(*) as count FROM inventory WHERE status = \"ok\"',",
            '  );',
         )),
    dict(id="M9", fichier=RT, attendu="S1",
         titre="la valeur du stock redevient la SOMME DES QUANTITES (sans unit_price)",
         avant=L(
            '  const cost = await db.get(',
            "    \"SELECT SUM(quantity * unit_price) as total FROM inventory\",",
            '  );',
            '  const alerts = await db.get(',
         ),
         apres=L(
            '  const cost = await db.get(',
            "    \"SELECT SUM(quantity) as total FROM inventory\",",
            '  );',
            '  const alerts = await db.get(',
         )),
]
