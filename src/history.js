/**
 * Pile d'annulation / rétablissement pour les modifications de texte.
 * Les instantanés sont des tableaux d'éditions clonés : peu volumineux et
 * suffisants pour restaurer exactement l'état précédent.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createHistory(limit = 80) {
  let undoStack = [];
  let redoStack = [];

  return {
    /** Enregistre l'état AVANT une mutation. */
    push(snapshot) {
      if (!Array.isArray(snapshot)) return;
      undoStack.push(clone(snapshot));
      if (undoStack.length > limit) undoStack.shift();
      redoStack = [];
    },

    /** Dépile un état précédent et renvoie le nouveau tableau, ou null. */
    undo(current) {
      if (!undoStack.length) return null;
      const previous = undoStack.pop();
      redoStack.push(clone(current));
      return clone(previous);
    },

    redo(current) {
      if (!redoStack.length) return null;
      const next = redoStack.pop();
      undoStack.push(clone(current));
      return clone(next);
    },

    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    clear() {
      undoStack = [];
      redoStack = [];
    },
  };
}
