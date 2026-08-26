// api/upload-doc.js
// Reçoit un fichier (PDF, DOCX, TXT), le chunk, embed via OpenAI, stocke dans Pinecone

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

// ─── Chunking ─────────────────────────────────────────────
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 50,
  separators: ["\n\n", "\n", ". ", "! ", "? ", " ", ""],
});

async function chunkText(text) {
  return splitter.splitText(text);
}

// ─── Text extraction ──────────────────────────────────────
async function extractText(content, filename) {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "txt") {
    return Buffer.from(content, "base64").toString("utf-8");
  }

  if (ext === "pdf") {
    const buffer = Buffer.from(content, "base64");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(content, "base64");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // Filet de sécurité : en usage normal, ce cas est déjà rejeté en 400 par le handler
  // avant même d'appeler extractText() (cf. check d'extension juste après la validation
  // filename/content). Gardé ici pour protéger la fonction elle-même si elle est un jour
  // appelée ailleurs que depuis ce handler.
  throw new Error(`Format non supporté : .${ext}. Utilisez PDF, DOCX ou TXT.`);
}

// ─── Handler ──────────────────────────────────────────────
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

  if (process.env.DEMO_MODE === "true") {
    return res.status(403).json({ error: "Upload désactivé en mode démo." });
  }

  // Validate env
  const { OPENAI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_URL } = process.env;

  if (!OPENAI_API_KEY || !PINECONE_API_KEY || !PINECONE_INDEX_URL) {
    return res.status(500).json({
      error: "Configuration serveur incomplète. Vérifiez les variables d'environnement.",
    });
  }

  try {
    const { filename, content } = req.body;

    if (!filename || !content) {
      return res.status(400).json({
        error: "Fichier manquant. Envoyez { filename, content (base64) }.",
      });
    }

    const ext = filename.toLowerCase().split(".").pop();
    if (!["txt", "pdf", "docx"].includes(ext)) {
      return res.status(400).json({
        error: `Format non supporté : .${ext}. Utilisez PDF, DOCX ou TXT.`,
      });
    }

    // 1. Extract text
    console.log(`[upload] Extracting text from ${filename}...`);
    const text = await extractText(content, filename);

    if (!text || text.trim().length < 50) {
      return res.status(400).json({
        error: "Le document est vide ou trop court pour être indexé.",
      });
    }

    // 2. Chunk
    console.log(`[upload] Chunking text (${text.length} chars)...`);
    const chunks = await chunkText(text);
    console.log(`[upload] ${chunks.length} chunks created.`);

    if (chunks.length === 0) {
      return res.status(400).json({
        error: "Impossible de découper le document en chunks.",
      });
    }

    // 3. Embed via OpenAI
    console.log(`[upload] Embedding ${chunks.length} chunks via OpenAI...`);
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: chunks,
      dimensions: 512,
    });

    const embeddings = embeddingResponse.data.map((d) => d.embedding);

    // 4. Delete existing chunks for this filename (bug chunks orphelins : un
    // remplacement qui génère moins de chunks que l'ancien laissait les chunks
    // en trop de l'ancienne version dans Pinecone). Même logique de listing par
    // préfixe que api/delete-doc.js.
    console.log(`[upload] Checking for existing chunks of ${filename}...`);
    const pc = new Pinecone({ apiKey: PINECONE_API_KEY });

    // Extract host from URL
    const indexHost = PINECONE_INDEX_URL.replace("https://", "");
    const index = pc.index("storyforge", indexHost);

    const prefix = `${filename.replace(/[^a-zA-Z0-9]/g, "_")}_chunk_`;
    const candidateIds = [];
    let paginationToken;
    while (true) {
      const params = { prefix, limit: 100 };
      if (paginationToken) params.paginationToken = paginationToken;
      const result = await index.listPaginated(params);
      candidateIds.push(...(result.vectors || []).map((v) => v.id));
      paginationToken = result.pagination?.next;
      if (!paginationToken) break;
    }

    // Le préfixe assaini n'est pas unique : deux filenames différents peuvent
    // s'assainir vers la même chaîne (ex: "doc!.txt" et "doc?.txt" → "doc__txt").
    // On confirme via les métadonnées (même pattern que api/list-docs.js) que
    // le chunk trouvé appartient bien à CE filename avant de le supprimer.
    let existingIds = [];
    if (candidateIds.length > 0) {
      const fetchResult = await index.fetch({ ids: candidateIds });
      const records = fetchResult.records || {};
      existingIds = candidateIds.filter((id) => records[id]?.metadata?.filename === filename);
    }

    if (existingIds.length > 0) {
      console.log(`[upload] Removing ${existingIds.length} existing chunk(s) for ${filename}`);
      await index.deleteMany({ ids: existingIds });
    }

    // 5. Upsert into Pinecone
    console.log(`[upload] Upserting into Pinecone...`);

    const vectors = chunks.map((chunk, i) => ({
      id: `${filename.replace(/[^a-zA-Z0-9]/g, "_")}_chunk_${i}`,
      values: embeddings[i],
      metadata: {
        text: chunk,
        filename: filename,
        chunkIndex: i,
        totalChunks: chunks.length,
        uploadedAt: new Date().toISOString(),
      },
    }));

    // Upsert in batches of 100
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.upsert({ records: batch });
    }

    console.log(`[upload] ✅ ${chunks.length} chunks indexed for ${filename}`);

    return res.status(200).json({
      success: true,
      filename,
      chunks: chunks.length,
      characters: text.length,
    });
  } catch (error) {
    console.error("[upload] Error:", error);
    return res.status(500).json({
      error: "Erreur lors de l'indexation du document.",
    });
  }
}
