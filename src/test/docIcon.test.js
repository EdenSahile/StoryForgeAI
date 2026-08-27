import { describe, it, expect } from 'vitest';
import { getDocIcon } from '../logic/docIcon';

describe('getDocIcon', () => {
  it('renvoie picture_as_pdf pour un fichier .pdf', () => {
    expect(getDocIcon('guide.pdf')).toBe('picture_as_pdf');
  });

  it('renvoie description pour un fichier .docx', () => {
    expect(getDocIcon('notes.docx')).toBe('description');
  });

  it('renvoie article pour un fichier .txt', () => {
    expect(getDocIcon('brouillon.txt')).toBe('article');
  });

  it("ignore la casse de l'extension", () => {
    expect(getDocIcon('GUIDE.PDF')).toBe('picture_as_pdf');
  });

  it('renvoie une icône générique pour une extension inconnue ou absente', () => {
    expect(getDocIcon('fichier.xyz')).toBe('insert_drive_file');
    expect(getDocIcon('sansextension')).toBe('insert_drive_file');
  });
});
