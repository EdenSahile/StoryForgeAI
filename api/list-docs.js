// api/list-docs.js
// Retourne la liste des documents indexés dans Pinecone

import { Pinecone } from "@pinecone-database/pinecone";
import { applyCors } from "./_cors.js";

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET, OPTIONS" })) return;

  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });

  const { PINECONE_API_KEY, PINECONE_INDEX_URL } = process.env;

  if (!PINECONE_API_KEY || !PINECONE_INDEX_URL) {
    return res.status(500).json({ error: "Configuration serveur incomplète." });
  }

  try {
    const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
    const indexHost = PINECONE_INDEX_URL.replace("https://", "");
    const index = pc.index("storyforge", indexHost);

    // Paginate through all vector IDs
    const allIds = [];
    let paginationToken;
    do {
      const result = await index.listPaginated({ limit: 100, paginationToken });
      const ids = (result.vectors || []).map((v) => v.id);
      allIds.push(...ids);
      paginationToken = result.pagination?.next;
    } while (paginationToken);

    // Only fetch the first chunk of each document to get its metadata
    const firstChunkIds = allIds.filter((id) => id.endsWith("_chunk_0"));

    if (firstChunkIds.length === 0) {
      return res.status(200).json({ documents: [] });
    }

    const fetchResult = await index.fetch({ ids: firstChunkIds });
    const records = fetchResult.records || {};

    const documents = firstChunkIds
      .filter((id) => records[id]?.metadata?.filename)
      .map((id) => {
        const { filename, totalChunks, uploadedAt } = records[id].metadata;
        return { filename, totalChunks, uploadedAt };
      });

    console.log(`[list-docs] Found ${documents.length} document(s)`);

    return res.status(200).json({ documents });
  } catch (error) {
    console.error("[list-docs] Error:", error);
    return res.status(500).json({ error: "Erreur lors du listing des documents." });
  }
}
