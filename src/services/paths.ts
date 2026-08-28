import path from "path";
import { resolveStorageDir } from "../db/init.js";

// Dossier de stockage des uploads (images, scans, PDF).
export const uploadsDir = path.join(resolveStorageDir(), "uploads");
