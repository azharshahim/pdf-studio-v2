/**
 * Composants d'interface transverses : toasts, écran de chargement et
 * dialogues (caractères manquants, mot de passe). Dépendances injectées pour
 * rester testables et éviter les imports circulaires.
 */

import { icon } from './icons.js';
import * as U from './utils.js';

export function createUi(els) {
  let loadingDepth = 0;

  function pushLoading(label = 'Chargement…') {
    loadingDepth++;
    els.loadingLabel.textContent = label;
    els.loadingScreen.hidden = false;
  }

  function popLoading() {
    loadingDepth = Math.max(0, loadingDepth - 1);
    if (!loadingDepth) els.loadingScreen.hidden = true;
  }

  function toast(message, type = 'info', opts = {}) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icoName =
      type === 'success' ? 'check' : type === 'error' || type === 'warn' ? 'alert' : 'sparkle';
    el.innerHTML = `<span class="t-ico">${icon(icoName, 16)}</span><span class="t-msg">${U.escapeHtml(
      message
    )}</span>`;
    els.toasts.appendChild(el);
    const dismiss = () => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    };
    if (opts.action) {
      const b = document.createElement('button');
      b.className = 't-action';
      b.textContent = opts.action;
      b.addEventListener('click', () => {
        opts.onAction?.();
        dismiss();
      });
      el.appendChild(b);
    }
    setTimeout(dismiss, opts.duration ?? (type === 'error' ? 7500 : 4200));
  }

  /**
   * Avertit des caractères qu'aucune police embarquée ne peut dessiner.
   * @returns {Promise<boolean>} true pour poursuivre l'export.
   */
  function confirmMissingGlyphs(missing) {
    return new Promise((resolve) => {
      const list = missing
        .slice(0, 8)
        .map(
          (m) =>
            `<code>${U.escapeHtml(m.char)}</code> (U+${m.char
              .codePointAt(0)
              .toString(16)
              .toUpperCase()
              .padStart(4, '0')})`
        )
        .join(', ');
      const more = missing.length > 8 ? ` et ${missing.length - 8} autre(s)` : '';
      els.glyphText.innerHTML =
        `Ces caractères n'existent dans aucune des polices embarquées et seront remplacés par un carré vide : ` +
        `${list}${more}.<br />Vérifiez le texte ou choisissez une autre police.`;
      const done = (value) => {
        els.glyphDialog.removeEventListener('close', onClose);
        els.glyphCancel.removeEventListener('click', onCancel);
        els.glyphContinue.removeEventListener('click', onContinue);
        if (els.glyphDialog.open) els.glyphDialog.close();
        resolve(value);
      };
      const onClose = () => done(false);
      const onCancel = () => done(false);
      const onContinue = () => done(true);
      els.glyphDialog.addEventListener('close', onClose);
      els.glyphCancel.addEventListener('click', onCancel);
      els.glyphContinue.addEventListener('click', onContinue);
      els.glyphDialog.showModal();
    });
  }

  /**
   * Demande le mot de passe d'un PDF chiffré.
   * @returns {Promise<string|null>}
   */
  function askPassword(firstTry = true) {
    if (!els.passwordDialog) return Promise.resolve(null);
    els.passwordError.hidden = firstTry;
    els.passwordInput.value = '';
    return new Promise((resolve) => {
      const finish = (value) => {
        els.passwordForm.removeEventListener('submit', onSubmit);
        els.passwordCancel.removeEventListener('click', onCancel);
        els.passwordDialog.removeEventListener('close', onCancel);
        if (els.passwordDialog.open) els.passwordDialog.close();
        resolve(value);
      };
      const onSubmit = (e) => {
        e.preventDefault();
        const value = els.passwordInput.value;
        if (!value) {
          els.passwordError.hidden = false;
          return;
        }
        finish(value);
      };
      const onCancel = () => finish(null);
      els.passwordForm.addEventListener('submit', onSubmit);
      els.passwordCancel.addEventListener('click', onCancel);
      els.passwordDialog.addEventListener('close', onCancel);
      els.passwordDialog.showModal();
      requestAnimationFrame(() => els.passwordInput.focus());
    });
  }

  /**
   * Confirmation générique (suppression, dépassement de limite…).
   * @returns {Promise<boolean>}
   */
  function askConfirm({ title, message, confirmLabel, cancelLabel, danger = true } = {}) {
    if (!els.confirmDialog) return Promise.resolve(false);
    els.confirmTitle.textContent = title || '';
    els.confirmText.textContent = message || '';
    els.confirmOk.textContent = confirmLabel || (danger ? 'Confirmer' : 'OK');
    els.confirmOk.classList.toggle('danger', !!danger);
    if (els.confirmCancel) els.confirmCancel.textContent = cancelLabel || 'Annuler';
    return new Promise((resolve) => {
      const done = (value) => {
        els.confirmDialog.removeEventListener('close', onClose);
        els.confirmCancel.removeEventListener('click', onCancel);
        els.confirmOk.removeEventListener('click', onOk);
        if (els.confirmDialog.open) els.confirmDialog.close();
        resolve(value);
      };
      const onClose = () => done(false);
      const onCancel = () => done(false);
      const onOk = () => done(true);
      els.confirmDialog.addEventListener('close', onClose);
      els.confirmCancel.addEventListener('click', onCancel);
      els.confirmOk.addEventListener('click', onOk);
      els.confirmDialog.showModal();
      requestAnimationFrame(() => els.confirmCancel.focus());
    });
  }

  return { pushLoading, popLoading, toast, confirmMissingGlyphs, askPassword, askConfirm };
}
