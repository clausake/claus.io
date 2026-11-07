// Porte C39-B — kit d'exemples pré-rempli, effaçable par le client.
//
// Contrat jugé (voie API, déterministe, aucune IA) :
//  1. au démarrage sur base VIERGE, le kit est AUTOMATIQUEMENT semé :
//     GET /api/demo/etat → present=true et les 4 surfaces sont réellement
//     lisibles par leurs routes métier (inventaire, recettes, menu-planning,
//     documents, documents/:id, haccp/documents) ;
//  2. POST /api/demo/supprimer efface EXACTEMENT les lignes tracées : les
//     mêmes GET rendent des collections vides, et la marque reste posée
//     (seme=true) ;
//  3. après purge, le redémarrage ne re-sème PAS (la marque fait foi) —
//     jugé par la relecture de l'état (seme=true, present=false) ;
//  4. semence idempotente : un second POST ne recrée rien (creees=[]).
//
// Le harnais est identique à ingredient-genere-actions.spec.ts : port libre,
// NODE_ENV=production, COOKDRIVE_AUTH_OFF=1, USER_DATA_PATH dédié.

import { test, expect } from "@playwright/test";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { createServer } from "net";

let PORT = 0;
let BASE = "";
const DATA_DIR = path.join(process.cwd(), "test", "tmp-demo-kit");
let server: ChildProcess;
let serveurFini: Promise<void> | null = null;

const portLibre = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });

const json = async (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => {
  const r = await fetch(`${BASE}${url}`, init as RequestInit);
  expect(r.ok, `${init?.method ?? "GET"} ${url} → ${r.status}`).toBeTruthy();
  return r.json();
};

test.beforeAll(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, "settings.json"),
    JSON.stringify({
      install_termine_le: new Date().toISOString(),
      fournisseur_choisi: "ollama",
    }),
  );
  if (!fs.existsSync(path.join(process.cwd(), "dist", "index.html"))) {
    throw new Error("dist/ absent : lancer `npm run build` avant cette suite");
  }
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  PORT = await portLibre();
  BASE = `http://127.0.0.1:${PORT}`;
  serveurFini = new Promise<void>((res) => {
    server = spawn(process.execPath, [tsxBin, "server.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        COOKDRIVE_AUTH_OFF: "1",
        COOKDRIVE_RATELIMIT_OFF: "1",
        PORT: String(PORT),
        USER_DATA_PATH: DATA_DIR,
        NODE_ENV: "production",
      },
      stdio: "pipe",
    });
    server.on("exit", () => res());
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/settings`);
      if (res.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
}, 45_000);

test.afterAll(async () => {
  server?.kill("SIGTERM");
  if (serveurFini) await serveurFini;
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test.setTimeout(150_000);

test.describe("C39-B — kit d'exemples pré-rempli et effaçable", () => {
  test("(1) le kit est semé automatiquement et chaque onglet a son exemple", async () => {
    const etat = await json("/api/demo/etat");
    expect(etat.status).toBe("ok");
    expect(etat.present).toBe(true);
    expect(etat.semé ?? etat.seme).toBe(true);
    // les 8 lignes tracées (1 stock, 1 fiche + 1 ingrédient + 1 plan,
    // 1 document + 2 lignes, 1 doc HACCP)
    expect(etat.entites.length).toBe(8);

    // chaque surface est RéELLEMENT lisible par sa route métier
    const inv = await json("/api/inventory");
    expect(inv.some((i: { id: string }) => i.id === "demo-inventaire")).toBe(true);
    const rec = await json("/api/recipes");
    expect(rec.some((r: { id: string }) => r.id === "demo-recette")).toBe(true);
    const plan = await json("/api/menu-planning");
    expect(plan.some((p: { id: string }) => p.id === "demo-planning")).toBe(true);
    const docs = await json("/api/documents");
    expect(docs.some((d: { id: string }) => d.id === "demo-document")).toBe(true);
    // les lignes du document sont portees par la MEME route (items injectes
    // par documents.ts:42 — il n'existe pas de GET /api/documents/:id)
    const demoDoc = docs.find((d: { id: string }) => d.id === "demo-document");
    expect(Array.isArray(demoDoc.items) ? demoDoc.items.length : 0).toBe(2);
    const haccp = await json("/api/haccp/documents");
    const haccpListe = Array.isArray(haccp) ? haccp : haccp.documents ?? [];
    expect(haccpListe.some((h: { id: string }) => h.id === "demo-haccp")).toBe(true);
  });

  test("(2) la purge efface exactement les lignes tracées et garde la marque", async () => {
    const r = await json("/api/demo/supprimer", { method: "POST" });
    expect(r.supprimees.length).toBe(8);

    // les mêmes GET rendent désormais des collections vides
    expect((await json("/api/inventory")).length).toBe(0);
    expect((await json("/api/recipes")).length).toBe(0);
    expect((await json("/api/menu-planning")).length).toBe(0);
    expect((await json("/api/documents")).length).toBe(0);

    // la marque SURVIT : present=false mais seme=true (pas de re-semage)
    const etat = await json("/api/demo/etat");
    expect(etat.present).toBe(false);
    expect(etat.semé ?? etat.seme).toBe(true);
  });

  test("(3) semence idempotente : le second POST ne recrée rien", async () => {
    const r = await json("/api/demo/semence", { method: "POST" });
    expect(r.creees).toEqual([]);
    const etat = await json("/api/demo/etat");
    expect(etat.present).toBe(false);
  });
});
