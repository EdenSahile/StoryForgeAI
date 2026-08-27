/**
 * Détermine l'icône Material Symbols d'un document à partir de son extension
 * réelle (doc.name), jamais de son statut de traitement — un fichier .txt en
 * cours d'indexation doit rester une icône .txt, pas basculer sur une icône
 * PDF le temps du chargement.
 * @param {string} filename - Nom du fichier, avec son extension (ex: "guide.pdf")
 * @returns {string} Nom de l'icône Material Symbols Outlined
 */
export function getDocIcon(filename) {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "pdf") return "picture_as_pdf";
  if (ext === "docx") return "description";
  if (ext === "txt") return "article";

  return "insert_drive_file";
}
