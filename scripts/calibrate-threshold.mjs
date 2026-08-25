// scripts/calibrate-threshold.mjs
//
// Script autonome de calibration du seuil de pertinence RAG (0.42 en dur dans
// api/retrieve-context.js, ligne ~78). N'est jamais appelé par l'app — exécuté
// à la main, pour recalibrer si de nouveaux documents sont ajoutés à
// public/docs/ ou si le seuil actuel est remis en question.
//
// Usage : node --env-file=.env scripts/calibrate-threshold.mjs
// (nécessite les mêmes variables d'environnement que l'app : OPENAI_API_KEY,
// PINECONE_API_KEY, PINECONE_INDEX_URL — cf. .env.example)
//
// Méthode : embedde chaque brief de test avec les mêmes paramètres que
// api/retrieve-context.js (modèle, dimensions), interroge Pinecone avec un
// topK élevé et SANS filtrer par score (pour voir la distribution complète,
// pas seulement ce qui passerait déjà le seuil actuel), puis compare la
// distribution des meilleurs scores entre briefs pertinents et hors-sujet.

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

// Mêmes paramètres que api/retrieve-context.js — garder synchronisé.
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;
const QUERY_TOP_K = 20;

// Étiquettes décidées à l'avance, avant tout appel — pas déduites après coup.
// On-topic : inspirés du contenu réel des 8 documents indexés dans
// public/docs/ (choix produit/couleur, livraison, retours, paiement Alma,
// SAV, programme fidélité Lumeo+, catalogue, facturation, fournisseurs).
// Off-topic : catégories sans aucun rapport avec Lumeo Boutique (déco/
// luminaires), volontairement variées pour ne pas biaiser vers une seule
// thématique hors-sujet.
const TEST_BRIEFS = [
  // --- On-topic (10) ---
  { label: "on-topic", text: "Je veux pouvoir choisir la couleur de ma suspension avant de l'ajouter au panier." },
  { label: "on-topic", text: "Je veux voir le délai de livraison estimé avant de valider ma commande de luminaires." },
  { label: "on-topic", text: "Je veux pouvoir payer ma commande en plusieurs fois via Alma." },
  { label: "on-topic", text: "Je veux retourner un article dans les 14 jours si je ne suis pas satisfait du produit reçu." },
  { label: "on-topic", text: "Je veux contacter le service client si mon luminaire arrive endommagé à la livraison." },
  { label: "on-topic", text: "Je veux suivre l'avancement d'une livraison de mobilier volumineux prévue sur rendez-vous." },
  { label: "on-topic", text: "Je veux consulter mon solde de cashback dans le programme de fidélité Lumeo+." },
  { label: "on-topic", text: "Je veux comparer les suspensions et lampes à poser disponibles par fournisseur et par prix." },
  { label: "on-topic", text: "Je veux recevoir une facture téléchargeable après chaque commande passée sur le site." },
  { label: "on-topic", text: "Je veux vérifier qu'un fournisseur respecte la charte qualité avant d'être référencé au catalogue." },

  // --- Off-topic (10), catégories variées ---
  { label: "off-topic", text: "Je veux réserver une table dans un restaurant proche de chez moi pour ce soir." },
  { label: "off-topic", text: "Je veux suivre mes calories quotidiennes dans une application de fitness." },
  { label: "off-topic", text: "Je veux réserver un vol pour mes prochaines vacances d'été." },
  { label: "off-topic", text: "Je veux consulter le solde de mon compte bancaire et faire un virement." },
  { label: "off-topic", text: "Je veux acheter une nouvelle carte graphique pour mon ordinateur de bureau." },
  { label: "off-topic", text: "Je veux essayer virtuellement des vêtements avant de les commander en ligne." },
  { label: "off-topic", text: "Je veux planifier l'entretien annuel de ma voiture chez le garagiste." },
  { label: "off-topic", text: "Je veux suivre l'évolution du prix de l'immobilier dans mon quartier." },
  { label: "off-topic", text: "Je veux apprendre une nouvelle langue avec des leçons quotidiennes personnalisées." },
  { label: "off-topic", text: "Je veux sauvegarder ma progression dans un jeu vidéo en ligne." },
  // Cas de reproduction original (PR #78) : ce brief exact a fait inventer au
  // modèle que Lumeo Boutique vend des téléphones (faux prix, faux cashback
  // Lumeo+), un seul chunk FAQ à 43% ayant passé le seuil 0.42 d'alors. Gardé
  // en permanence dans l'échantillon, pas juste un test ponctuel, pour que
  // toute recalibration future revérifie explicitement ce cas précis.
  { label: "off-topic", text: "Je souhaite pouvoir choisir la couleur de mon téléphone" },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Variable d'environnement manquante : ${name}. Lancer avec node --env-file=.env scripts/calibrate-threshold.mjs`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
  const PINECONE_API_KEY = requireEnv("PINECONE_API_KEY");
  const PINECONE_INDEX_URL = requireEnv("PINECONE_INDEX_URL");

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  const indexHost = PINECONE_INDEX_URL.replace("https://", "");
  const index = pc.index("storyforge", indexHost);

  const results = [];

  for (const brief of TEST_BRIEFS) {
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: [brief.text],
      dimensions: EMBEDDING_DIMENSIONS,
    });
    const vector = embeddingResponse.data[0].embedding;

    const queryResponse = await index.query({
      vector,
      topK: QUERY_TOP_K,
      includeMetadata: true,
    });

    const matches = queryResponse.matches || [];
    const top3 = matches.slice(0, 3).map((m) => ({
      score: Math.round(m.score * 10000) / 100, // pourcentage, 2 décimales
      filename: m.metadata?.filename ?? "?",
    }));

    results.push({
      label: brief.label,
      brief: brief.text,
      topScore: top3[0]?.score ?? 0,
      top3,
    });

    console.log(
      `[${brief.label}] "${brief.text.slice(0, 60)}${brief.text.length > 60 ? "..." : ""}" → meilleur score: ${top3[0]?.score ?? "N/A"}% (${top3[0]?.filename ?? "?"})`,
    );
  }

  // --- Tableau détaillé ---
  console.log("\n=== Détail par brief ===\n");
  console.table(
    results.map((r) => ({
      label: r.label,
      brief: r.brief.slice(0, 50) + (r.brief.length > 50 ? "..." : ""),
      "top1 score": r.topScore,
      "top1 doc": r.top3[0]?.filename ?? "?",
      "top2 score": r.top3[1]?.score ?? "-",
      "top2 doc": r.top3[1]?.filename ?? "-",
      "top3 score": r.top3[2]?.score ?? "-",
      "top3 doc": r.top3[2]?.filename ?? "-",
    })),
  );

  // --- Statistiques par groupe ---
  const onTopicScores = results.filter((r) => r.label === "on-topic").map((r) => r.topScore);
  const offTopicScores = results.filter((r) => r.label === "off-topic").map((r) => r.topScore);

  const stats = (arr) => ({
    count: arr.length,
    mean: Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100,
    min: Math.min(...arr),
    max: Math.max(...arr),
  });

  const onTopicStats = stats(onTopicScores);
  const offTopicStats = stats(offTopicScores);

  console.log("\n=== Statistiques (score du meilleur match, en %) ===\n");
  console.log(`On-topic  (n=${onTopicStats.count}) : moyenne ${onTopicStats.mean}%, min ${onTopicStats.min}%, max ${onTopicStats.max}%`);
  console.log(`Off-topic (n=${offTopicStats.count}) : moyenne ${offTopicStats.mean}%, min ${offTopicStats.min}%, max ${offTopicStats.max}%`);

  console.log("\n=== Séparation des groupes ===\n");
  if (offTopicStats.max < onTopicStats.min) {
    const suggestedThreshold = Math.round(((offTopicStats.max + onTopicStats.min) / 2) * 100) / 100;
    console.log(
      `Séparation nette : max off-topic (${offTopicStats.max}%) < min on-topic (${onTopicStats.min}%).\n` +
        `Seuil médian suggéré : ${suggestedThreshold}% (soit ${(suggestedThreshold / 100).toFixed(4)} sur l'échelle 0-1 utilisée dans le code).\n` +
        `Seuil actuel en dur : 42% (0.42).`,
    );
  } else {
    console.log(
      `Pas de séparation nette : les deux groupes se chevauchent ` +
        `(max off-topic ${offTopicStats.max}% >= min on-topic ${onTopicStats.min}%).\n` +
        `Aucun seuil unique ne sépare proprement les deux groupes sur cet échantillon — ` +
        `ne pas forcer une conclusion que les données ne permettent pas.`,
    );
  }
}

main().catch((error) => {
  console.error("Erreur pendant la calibration :", error);
  process.exit(1);
});
