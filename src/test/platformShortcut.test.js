import { describe, it, expect } from "vitest";
import { submitModifierKey } from "../logic/platformShortcut";

describe("submitModifierKey", () => {
  it('renvoie "⌘" sur macOS (navigator.platform "MacIntel")', () => {
    expect(submitModifierKey("MacIntel")).toBe("⌘");
  });

  it('renvoie "⌘" sur iPad / iPhone', () => {
    expect(submitModifierKey("iPad")).toBe("⌘");
    expect(submitModifierKey("iPhone")).toBe("⌘");
  });

  it('renvoie "Ctrl" sur Windows ("Win32")', () => {
    expect(submitModifierKey("Win32")).toBe("Ctrl");
  });

  it('renvoie "Ctrl" sur Linux ("Linux x86_64")', () => {
    expect(submitModifierKey("Linux x86_64")).toBe("Ctrl");
  });

  it('détecte aussi "Macintosh" dans une chaîne façon userAgent', () => {
    expect(
      submitModifierKey(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      ),
    ).toBe("⌘");
  });

  it('chaîne vide ou inconnue → "Ctrl" (défaut sûr, pas de ⌘ fantôme)', () => {
    expect(submitModifierKey("")).toBe("Ctrl");
    expect(submitModifierKey("Something else")).toBe("Ctrl");
  });
});
