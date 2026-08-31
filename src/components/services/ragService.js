// src/components/services/ragService.js
// Service front-end pour l'upload de documents et la recherche contextuelle

/**
 * Upload un document, le chunk et l'indexe dans Pinecone
 * @param {File} file - Le fichier à uploader
 * @param {function} onProgress - Callback de progression (0-100)
 * @returns {Promise<{filename, chunks, characters}>}
 */
export async function uploadDocument(file, onProgress) {
  // Validate file
  const validExtensions = ["pdf", "docx", "txt"];
  const ext = file.name.split(".").pop().toLowerCase();

  if (!validExtensions.includes(ext)) {
    throw new Error(`Format non supporté : .${ext}. Utilisez PDF, DOCX ou TXT.`);
  }

  // Limite sur le fichier brut (10 Mo), pas sur le corps de requête : le contenu
  // part encodé en base64 (+33 %), et `api/upload-doc.js` dimensionne son
  // `bodyParser.sizeLimit` en conséquence pour qu'un fichier de 10 Mo pile passe.
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Fichier trop volumineux. Maximum 10 Mo.");
  }

  onProgress?.(10);

  // Convert to base64
  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Erreur de lecture du fichier."));
    reader.readAsDataURL(file);
  });

  onProgress?.(30);

  // Send to API
  const response = await fetch("/api/upload-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      content,
    }),
  });

  onProgress?.(80);

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Erreur serveur (${response.status})`);
  }

  const result = await response.json();
  onProgress?.(100);

  return result;
}

/**
 * Recherche les chunks pertinents dans Pinecone pour un brief donné
 * @param {string} brief - Le brief utilisateur
 * @param {number} topK - Nombre de chunks à récupérer
 * @returns {Promise<{chunks: Array<{text, score, filename}>}>}
 */
export async function retrieveContext(brief, topK = 5) {
  const response = await fetch("/api/retrieve-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief, topK }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Erreur lors de la recherche contextuelle.");
  }

  return response.json();
}

/**
 * Récupère la liste des documents indexés dans Pinecone
 * @returns {Promise<Array<{filename, totalChunks, uploadedAt}>>}
 */
export async function listDocuments() {
  const response = await fetch("/api/list-docs");

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Erreur lors du listing des documents.");
  }

  const { documents } = await response.json();
  return documents;
}

export async function deleteDocument(filename) {
  const response = await fetch("/api/delete-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Erreur lors de la suppression.");
  }

  return response.json();
}

/**
 * Récupère la configuration serveur exposée au client (ex: mode démo)
 * @returns {Promise<{demoMode: boolean}>}
 */
export async function getConfig() {
  const response = await fetch("/api/config");

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Erreur lors de la récupération de la configuration.");
  }

  return response.json();
}
