// Serveur MCP stdio minimal (domaine 2 de GH-600) — MEME registre que la
// route HTTP, aucun accomodement, aucun secret.
//
// Protocole JSON-RPC 2.0 ligne par ligne sur stdin/stdout :
//   initialize  -> capabilities {tools: {listChanged:false}}
//   tools/list  -> catalogue + autorisations
//   tools/call  -> {name, arguments} -> appelerOutil()
//   ping        -> {}
//
// SECURITE : ce processus est lance par le maitre sur sa propre machine. Il
// n'authentifie pas (pas de session HTTP) ; il ne doit donc jamais etre expose
// sur un reseau. Les outils qu'il expose sont ceux du registre : 5 lectures +
// `proposer_action` (boite de suggestions), jamais une ecriture metier.
import readline from "node:readline";
import { appelerOutil, catalogue } from "./src/services/outils/index.js";

// initDatabase() ecrit un `console.log` d'info sur stdout. En stdio, stdout
// EST le canal JSON-RPC : on le détourne vers stderr pendant l'init, puis on
// le rend. Sans ça, la premiere ligne lue par le client serait du texte brut.
// Le stockage reste celui de l'application (~/.clausio), pas un dossier du depot.
const logReel = console.log;
console.log = (...args: unknown[]) => console.error(...args);
const { initDatabase } = await import("./src/db/init.js");
const { db } = await initDatabase();
console.log = logReel;

const outils = catalogue();
const noms = new Set(outils.filter((o) => o.autorise).map((o) => o.nom));

function repondre(id: unknown, resultat: unknown): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: resultat }) + "\n");
}
function echouer(id: unknown, code: number, message: string): void {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (ligne) => {
  if (ligne.trim() === "") return;
  let requete: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    requete = JSON.parse(ligne);
  } catch {
    echouer(null, -32700, "Parse error");
    return;
  }
  const id = requete.id ?? null;
  try {
    switch (requete.method) {
      case "initialize":
        repondre(id, {
          protocolVersion: "2025-06-18",
          serverInfo: { name: "clausio-local", version: "1.0" },
          capabilities: { tools: { listChanged: false } },
        });
        break;
      case "ping":
        repondre(id, {});
        break;
      case "tools/list":
        repondre(id, { tools: outils.map((o) => ({
          name: o.nom, description: o.description,
          inputSchema: { type: "object", properties: { arguments: { type: "object" } } },
        })) });
        break;
      case "tools/call": {
        const params = requete.params ?? {};
        const nom = String(params.name ?? "");
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        if (!noms.has(nom)) {
          echouer(id, -32602, "OUTIL_NON_AUTORISE: " + nom);
          break;
        }
        const resultat = await appelerOutil(db, nom, args);
        repondre(id, {
          content: [{ type: "text", text: JSON.stringify(resultat) }],
          isError: !resultat.ok,
        });
        break;
      }
      default:
        echouer(id, -32601, "Method not found");
    }
  } catch (e) {
    echouer(id, -32603, e instanceof Error ? e.message : String(e));
  }
});

process.on("SIGINT", async () => { rl.close(); await db.close(); process.exit(0); });
