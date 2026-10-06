// ==UserScript==
// @name         Immichinko — daily photo rediscovery
// @namespace    https://github.com/wispdevon/Immichinko
// @version      0.2.0
// @description  Add Immichinko below Sharing and review photos inside Immich.
// @match        https://im.devonlabs.space/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
// SPDX-License-Identifier: Apache-2.0
(() => {
  'use strict';
  if (window.top !== window.self || window.__immichinkoSidebarInstalled) return;
  window.__immichinkoSidebarInstalled = true;

  // For reverse-proxy injection, configure data-app-url on the script tag.
  // The userscript uses the already-running local companion app.
  const source = document.currentScript;
  const appUrl = new URL(source?.dataset.appUrl || 'http://localhost:3100/');
  if (
    !['http:', 'https:'].includes(appUrl.protocol) ||
    appUrl.username ||
    appUrl.password
  )
    return;
  const marker = 'immichinko';
  const rowId = 'immichinko-sidebar-row';
  const panelId = 'immichinko-panel';
  let panel;
  let frame;
  let host;
  let queued = false;
  let previousTitle;
  const hidden = new Map();
  const inactive = new Map();

  const style = document.createElement('style');
  style.textContent = `
    #${rowId} a:focus-visible { outline:2px solid var(--immich-ui-primary-500, #accbfa); outline-offset:-2px; }
    #${rowId} a[aria-current="page"] { color:var(--immich-ui-primary-500, #accbfa); background:color-mix(in srgb, var(--immich-ui-primary-500, #accbfa) 12%, transparent); }
    #${panelId} { position:absolute; inset:0; z-index:10; display:flex; flex-direction:column; background:var(--immich-ui-light-100, #171717); }
    #${panelId} .immichinko-toolbar { min-height:48px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 16px; border-bottom:1px solid var(--immich-ui-default-border, #444); }
    #${panelId} .immichinko-toolbar strong { font-size:16px; font-weight:500; }
    #${panelId} button, #${panelId} .immichinko-open { min-height:44px; padding:8px 12px; border-radius:8px; color:inherit; background:transparent; cursor:pointer; }
    #${panelId} button:focus-visible, #${panelId} a:focus-visible { outline:2px solid var(--immich-ui-primary-500, #accbfa); outline-offset:2px; }
    #${panelId} iframe { width:100%; flex:1; min-height:0; border:0; }
    #${panelId} .immichinko-connection { padding:8px 16px; font-size:13px; }
    #${panelId} .immichinko-connection[hidden] { display:none; }
  `;
  document.head.append(style);

  function sharingLink() {
    return [...document.querySelectorAll('#sidebar a[href]')].find((link) => {
      const target = new URL(link.href, location.href);
      return (
        target.origin === location.origin &&
        target.pathname.replace(/\/$/, '') === '/sharing'
      );
    });
  }
  function sidebarRow(link) {
    let row = link;
    while (
      row.parentElement &&
      row.parentElement.parentElement?.closest('#sidebar') &&
      !row.parentElement.querySelector(
        'a[href]:not([href="' + link.getAttribute('href') + '"])',
      )
    ) {
      row = row.parentElement;
    }
    return row;
  }
  function theme() {
    return document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark')
      ? 'dark'
      : 'light';
  }
  function sendTheme() {
    frame?.contentWindow?.postMessage(
      { type: 'immichinko:theme', theme: theme() },
      appUrl.origin,
    );
  }
  function closePanel() {
    panel?.remove();
    panel = undefined;
    frame = undefined;
    for (const [element, state] of hidden) {
      element.hidden = state.hidden;
      element.inert = state.inert;
      if (state.display)
        element.style.setProperty('display', state.display, state.priority);
      else element.style.removeProperty('display');
    }
    hidden.clear();
    for (const [link, state] of inactive) {
      link.className = state.className;
      link.setAttribute('aria-current', state.current);
    }
    inactive.clear();
    host = undefined;
    if (previousTitle !== undefined) {
      document.title = previousTitle;
      previousTitle = undefined;
    }
    const link = document.querySelector(`#${rowId} a`);
    if (link?.hasAttribute('aria-current'))
      link.removeAttribute('aria-current');
  }
  function leave() {
    if (location.hash === '#' + marker) {
      const url = new URL(location.href);
      url.hash = '';
      history.replaceState(history.state, '', url);
    }
    closePanel();
  }
  function openPanel(main) {
    host = main;
    previousTitle = document.title;
    document.title = 'Immichinko · Immich';
    panel = document.createElement('section');
    panel.id = panelId;
    panel.setAttribute('aria-label', 'Immichinko daily photo rediscovery');
    const toolbar = document.createElement('div');
    toolbar.className = 'immichinko-toolbar';
    const title = document.createElement('strong');
    title.textContent = 'Immichinko';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Back to Immich';
    back.addEventListener('click', () => {
      leave();
      document.querySelector(`#${rowId} a`)?.focus();
    });
    toolbar.append(title, back);
    const connection = document.createElement('div');
    connection.className = 'immichinko-connection';
    connection.textContent = 'Connecting to your review app… ';
    const separate = document.createElement('a');
    separate.href = appUrl.href;
    separate.target = '_blank';
    separate.rel = 'noopener noreferrer';
    separate.className = 'immichinko-open';
    separate.textContent = 'Open separately ↗';
    connection.append(separate);
    frame = document.createElement('iframe');
    frame.title = 'Immichinko photo review';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
    );
    frame.addEventListener('load', sendTheme);
    frame.src = appUrl.href;
    panel.append(toolbar, connection, frame);
    host.append(panel);
  }
  function hideContent(main) {
    for (const element of main.children) {
      if (element === panel || !(element instanceof HTMLElement)) continue;
      if (!hidden.has(element))
        hidden.set(element, {
          hidden: element.hidden,
          inert: element.inert,
          display: element.style.getPropertyValue('display'),
          priority: element.style.getPropertyPriority('display'),
        });
      if (!element.hidden) element.hidden = true;
      if (!element.inert) element.inert = true;
      if (element.style.getPropertyValue('display') !== 'none')
        element.style.setProperty('display', 'none', 'important');
    }
    for (const link of document.querySelectorAll(
      '#sidebar a[aria-current="page"]',
    )) {
      if (link.closest('#' + rowId)) continue;
      if (!inactive.has(link))
        inactive.set(link, {
          className: link.className,
          current: link.getAttribute('aria-current'),
        });
      link.removeAttribute('aria-current');
      link.classList.remove('bg-primary/10', 'text-primary');
    }
  }
  function installRow(sharing) {
    const reference = sidebarRow(sharing);
    let row = document.getElementById(rowId);
    if (!row) {
      row = reference.cloneNode(true);
      row.id = rowId;
      for (const element of row.querySelectorAll('[id]'))
        element.removeAttribute('id');
      const link = row.querySelector('a');
      link.href = appUrl.href;
      link.removeAttribute('aria-current');
      link.removeAttribute('data-sveltekit-preload-data');
      link.classList.remove('bg-primary/10', 'text-primary');
      link.setAttribute('aria-label', 'Immichinko');
      const label = link.querySelector('span');
      if (label) label.textContent = 'Immichinko';
      else link.append('Immichinko');
      const path = link.querySelector('svg path');
      if (path)
        path.setAttribute(
          'd',
          'M21 19V5H3v14h18m-2-2H5V7h14v10M8.5 8A1.5 1.5 0 1 0 8.5 11A1.5 1.5 0 1 0 8.5 8M6 16h12l-4-5-3 4-2-3-3 4Z',
        );
      link.addEventListener('click', (event) => {
        if (
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (location.hash !== '#' + marker) {
          const url = new URL(location.href);
          url.hash = marker;
          history.pushState(history.state, '', url);
        }
        sync();
        const sidebar = document.getElementById('sidebar');
        if (
          sidebar &&
          getComputedStyle(
            sidebar.parentElement,
          ).gridTemplateColumns.startsWith('0px') &&
          !sidebar.inert
        )
          document.getElementById('top-menu-button')?.click();
      });
    }
    if (reference.nextElementSibling !== row) reference.after(row);
    return row.querySelector('a');
  }
  function sync() {
    queued = false;
    const sharing = sharingLink();
    if (!sharing) {
      closePanel();
      document.getElementById(rowId)?.remove();
      return;
    }
    const link = installRow(sharing);
    const main = document
      .querySelector('#sidebar')
      ?.parentElement?.querySelector(':scope > main');
    const active = location.hash === '#' + marker;
    if (!active || !main) {
      if (panel) closePanel();
      return;
    }
    if (panel && (host !== main || !panel.isConnected)) closePanel();
    if (!panel) openPanel(main);
    hideContent(main);
    if (link.getAttribute('aria-current') !== 'page')
      link.setAttribute('aria-current', 'page');
    sendTheme();
  }
  function schedule() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(sync);
    }
  }
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'inert'],
  });
  new MutationObserver(sendTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  addEventListener('popstate', schedule);
  addEventListener('hashchange', schedule);
  document.addEventListener(
    'click',
    (event) => {
      const link =
        event.target instanceof Element
          ? event.target.closest('#sidebar a[href]')
          : null;
      if (
        link &&
        !link.closest('#' + rowId) &&
        location.hash === '#' + marker &&
        !event.ctrlKey &&
        !event.metaKey
      )
        leave();
    },
    true,
  );
  addEventListener('message', (event) => {
    if (
      event.origin !== appUrl.origin ||
      event.source !== frame?.contentWindow ||
      event.data?.type !== 'immichinko:ready'
    )
      return;
    const status = panel?.querySelector('.immichinko-connection');
    if (status) status.hidden = true;
    sendTheme();
  });
  // A failed iframe often still fires "load". Keep the separate-app link until
  // the companion explicitly confirms readiness.
  schedule();
})();
