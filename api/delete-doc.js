// api/delete-doc.js
// Supprime tous les chunks d'un document depuis Pinecone

import { Pinecone } from "@pinecone-database/pinecone";
import { applyCors } from "./_cors.js";

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "POST, OPTIONS" })) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  if (process.env.DEMO_MODE === "true") {
    return res.status(403).json({ error: "Suppression désactivée en mode démo." });
  }

  const { PINECONE_API_KEY, PINECONE_INDEX_URL } = process.env;

  if (!PINECONE_API_KEY || !PINECONE_INDEX_URL) {
    return res.status(500).json({
      error: "Configuration serveur incomplète.",
    });
  }

  try {
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({ error: "Nom de fichier manquant." });
    }

    const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
    const indexHost = PINECONE_INDEX_URL.replace("https://", "");
    const index = pc.index("storyforge", indexHost);

    // Sur Serverless Pinecone, la suppression par filtre metadata n'est pas supportée.
    // On liste les IDs par préfixe (même pattern que l'upload) puis on supprime par IDs.
    const prefix = `${filename.replace(/[^a-zA-Z0-9]/g, "_")}_chunk_`;
    const candidateIds = [];
    let paginationToken = undefined;
    while (true) {
      const params = { prefix, limit: 100 };
      if (paginationToken) params.paginationToken = paginationToken;
      const result = await index.listPaginated(params);
      console.log(`[delete] listPaginated result:`, JSON.stringify(result).substring(0, 200));
      candidateIds.push(...(result.vectors || []).map((v) => v.id));
      paginationToken = result.pagination?.next;
      if (!paginationToken) break;
    }

    // Le préfixe assaini n'est pas unique : deux filenames différents peuvent
    // s'assainir vers la même chaîne (ex: "doc!.txt" et "doc?.txt" → "doc__txt").
    // On confirme via les métadonnées (même pattern que api/list-docs.js et
    // api/upload-doc.js) que le chunk trouvé appartient bien à CE filename
    // avant de le supprimer.
    let idsToDelete = [];
    if (candidateIds.length > 0) {
      const fetchResult = await index.fetch({ ids: candidateIds });
      const records = fetchResult.records || {};
      idsToDelete = candidateIds.filter((id) => records[id]?.metadata?.filename === filename);
    }

    if (idsToDelete.length === 0) {
      console.warn(`[delete] No chunks found for ${filename}`);
      return res.status(200).json({ success: true, filename, chunksDeleted: 0 });
    }

    await index.deleteMany({ ids: idsToDelete });

    console.log(`[delete] Removed ${idsToDelete.length} chunks for ${filename}`);

    return res.status(200).json({ success: true, filename, chunksDeleted: idsToDelete.length });
  } catch (error) {
    console.error("[delete] Error:", error);
    return res.status(500).json({
      error: "Erreur lors de la suppression.",
    });
  }
}
