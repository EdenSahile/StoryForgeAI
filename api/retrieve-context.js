// api/retrieve-context.js
// Embed le brief → recherche Pinecone → retourne les chunks pertinents

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { applyCors } from "./_cors.js";

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "POST, OPTIONS" })) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { OPENAI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_URL } = process.env;

  if (!OPENAI_API_KEY || !PINECONE_API_KEY || !PINECONE_INDEX_URL) {
    return res.status(500).json({
      error: "Configuration serveur incomplète.",
    });
  }

  try {
    const { brief, topK = 5 } = req.body;

    if (!brief || brief.trim().length < 10) {
      return res.status(400).json({
        error: "Brief trop court pour la recherche contextuelle.",
      });
    }

    if (
      req.body.topK !== undefined &&
      (typeof req.body.topK !== "number" ||
        !Number.isInteger(req.body.topK) ||
        req.body.topK < 1 ||
        req.body.topK > 20)
    ) {
      return res.status(400).json({
        error: "topK doit être un entier entre 1 et 20.",
      });
    }

    // 1. Embed the brief
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: [brief],
      dimensions: 512,
    });

    const briefVector = embeddingResponse.data[0].embedding;

    // 2. Query Pinecone
    const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
    const indexHost = PINECONE_INDEX_URL.replace("https://", "");
    const index = pc.index("storyforge", indexHost);

    const queryResponse = await index.query({
      vector: briefVector,
      topK: topK,
      includeMetadata: true,
    });

    // 3. Format results
    const chunks = queryResponse.matches
      // Seuil minimal de pertinence — calibré empiriquement le 2026-08-25 via
      // scripts/calibrate-threshold.mjs (20 briefs pré-étiquetés, dont le cas
      // de reproduction original "téléphone" de PR #78, score 43.41% < 0.45) :
      // sépare proprement les briefs pertinents (min observé 46.18%) des
      // hors-sujet (max observé 44.66%). Détail complet et méthode dans
      // context.md, session CALIBRATION-SEUIL-RAG. Recalibrer avec le script
      // si de nouveaux documents sont ajoutés à public/docs/.
      .filter((match) => match.score > 0.45)
      .map((match) => ({
        text: match.metadata.text,
        score: Math.round(match.score * 100),
        filename: match.metadata.filename,
        chunkIndex: match.metadata.chunkIndex,
      }));

    return res.status(200).json({
      success: true,
      chunks,
      totalMatches: queryResponse.matches.length,
    });
  } catch (error) {
    console.error("[retrieve] Error:", error);
    return res.status(500).json({
      error: "Erreur lors de la recherche contextuelle.",
    });
  }
}
