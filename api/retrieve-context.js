// api/retrieve-context.js
// Embed le brief → recherche Pinecone → retourne les chunks pertinents

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

export default async function handler(req, res) {
  // CORS
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'https://storypilot-ai.vercel.app'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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
      .filter((match) => match.score > 0.42) // seuil minimal de pertinence
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
