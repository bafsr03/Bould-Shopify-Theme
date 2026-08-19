/**
 * bould-form-guard.js
 *
 * Invisible spam protection for public theme forms, plus email-address obfuscation.
 *
 * Two traps, both invisible to real visitors:
 *   1. Honeypot  — a hidden `bould_website_url` field that naive bots auto-fill.
 *   2. Time trap — a submit that happens faster than a human plausibly could.
 *
 * Scope note: this is client-side only. Liquid cannot reject a POST, so a bot that
 * posts directly to /contact skips this entirely. That case is covered by Shopify's
 * built-in reCAPTCHA (Settings > Checkout > Spam protection), which only applies to
 * forms rendered with the Liquid {% form %} tag. The two layers are complementary.
 */
(function () {
  'use strict';

  var HONEYPOT = 'bould_website_url';
  var TIMESTAMP = 'bould_ts';
  var DEFAULT_MIN_SECONDS = 3;

  function stamp(form) {
    var ts = form.querySelector('input[name="' + TIMESTAMP + '"]');
    if (ts) ts.value = String(Date.now());
  }

  function isBot(form) {
    var honeypot = form.querySelector('input[name="' + HONEYPOT + '"]');
    if (honeypot && honeypot.value.trim() !== '') return true;

    var ts = form.querySelector('input[name="' + TIMESTAMP + '"]');
    if (!ts || !ts.value) return false;

    var started = parseInt(ts.value, 10);
    if (isNaN(started)) return false;

    var min = parseInt(ts.getAttribute('data-guard-min-seconds'), 10);
    if (isNaN(min)) min = DEFAULT_MIN_SECONDS;

    return Date.now() - started < min * 1000;
  }

  function lockSubmit(form) {
    var button = form.querySelector('[type="submit"]');
    if (!button) return;
    // Deferred so the button's own name/value still reaches the native submission.
    setTimeout(function () {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    }, 0);
  }

  function guard(form) {
    if (form.dataset.formGuardReady === 'true') return;
    form.dataset.formGuardReady = 'true';

    stamp(form);

    form.addEventListener('submit', function (event) {
      // Fail silently — a bot does not need feedback, and a human never gets here.
      if (isBot(form)) {
        event.preventDefault();
        return;
      }
      lockSubmit(form);
    });
  }

  /**
   * Rebuilds addresses split across data attributes so scrapers reading the raw
   * HTML never see a complete address.
   */
  function revealEmails(root) {
    var links = root.querySelectorAll('[data-email-user][data-email-domain]');

    Array.prototype.forEach.call(links, function (link) {
      if (link.dataset.emailReady === 'true') return;

      var user = link.getAttribute('data-email-user');
      var domain = link.getAttribute('data-email-domain');
      if (!user || !domain) return;

      var address = user + String.fromCharCode(64) + domain;
      link.dataset.emailReady = 'true';
      link.setAttribute('href', 'mailto:' + address);

      var target = link.querySelector('[data-email-text]');
      if (target) target.textContent = address;
    });
  }

  function init(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll('form[data-form-guard]'), guard);
    revealEmails(scope);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init(document);
    });
  } else {
    init(document);
  }

  // Theme editor re-renders sections without a page load.
  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });
})();
