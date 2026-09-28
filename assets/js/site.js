/* Aaron in the Kitchen - vanilla JavaScript, no dependencies or build step.
   Recipes and navigation are real HTML; JS adds interaction only. */
(() => {
  "use strict";
  document.documentElement.classList.add("js");
  const config = window.AARON_CONFIG || {};
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  // Optional typography. Photos and video placeholders always remain local.
  if (config.useGoogleFonts) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&family=Gentium+Book+Plus:wght@400;700&family=Montserrat:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }

  // Navigation: click/tap, keyboard, and desktop pointer support.
  const nav = $(".site-nav");
  const mobileToggle = $(".mobile-toggle");
  const dropdownToggles = $$(".dropdown-toggle");
  function closeDropdowns(except = null) {
    dropdownToggles.forEach(button => {
      if (button === except) return;
      button.setAttribute("aria-expanded", "false");
      const panel = document.getElementById(button.getAttribute("aria-controls"));
      if (panel) panel.hidden = true;
    });
  }
  function setDropdown(button, open) {
    if (open) closeDropdowns(button);
    button.setAttribute("aria-expanded", String(open));
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    if (panel) panel.hidden = !open;
  }
  function closeMobileNav() {
    if (!nav || !mobileToggle) return;
    nav.classList.remove("is-open");
    mobileToggle.setAttribute("aria-expanded", "false");
    mobileToggle.setAttribute("aria-label", "Open navigation");
    closeDropdowns();
  }
  mobileToggle?.addEventListener("click", () => {
    const open = mobileToggle.getAttribute("aria-expanded") !== "true";
    mobileToggle.setAttribute("aria-expanded", String(open));
    mobileToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    nav.classList.toggle("is-open", open);
    if (!open) closeDropdowns();
  });
  dropdownToggles.forEach(button => {
    let openedByHover = false;
    button.addEventListener("click", () => {
      if (openedByHover && button.getAttribute("aria-expanded") === "true") {
        openedByHover = false;
        return;
      }
      setDropdown(button, button.getAttribute("aria-expanded") !== "true");
    });
    const item = button.closest(".has-dropdown");
    let leaveTimer;
    item.addEventListener("mouseenter", () => {
      clearTimeout(leaveTimer);
      if (matchMedia("(min-width:960px) and (hover:hover)").matches) {
        openedByHover = true;
        setDropdown(button, true);
      }
    });
    item.addEventListener("mouseleave", () => {
      if (matchMedia("(min-width:960px) and (hover:hover)").matches) {
        leaveTimer = setTimeout(() => {
          if (!item.contains(document.activeElement)) {
            openedByHover = false;
            setDropdown(button, false);
          }
        }, 180);
      }
    });
    item.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!item.contains(document.activeElement) && !item.matches(":hover")) setDropdown(button, false);
      }, 0);
    });
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".site-header")) closeDropdowns();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const open = dropdownToggles.find(button => button.getAttribute("aria-expanded") === "true");
    if (open) {
      closeDropdowns();
      open.focus();
    } else if (mobileToggle?.getAttribute("aria-expanded") === "true") {
      closeMobileNav();
      mobileToggle.focus();
    }
  });
  matchMedia("(min-width:960px)").addEventListener("change", closeMobileNav);

  // Expand the original, full biography rather than an invented replacement.
  const bioButton = $(".bio-toggle");
  bioButton?.addEventListener("click", () => {
    const expanded = bioButton.getAttribute("aria-expanded") !== "true";
    const full = document.getElementById(bioButton.getAttribute("aria-controls"));
    const preview = $(".bio-preview");
    if (full) full.hidden = !expanded;
    if (preview) preview.hidden = expanded;
    bioButton.setAttribute("aria-expanded", String(expanded));
    if (bioButton.firstChild) bioButton.firstChild.textContent = expanded ? "Show less " : "Show more ";
  });

  // Search the actual 43 recipes, including ingredient text. No fetch() or CDN.
  const catalog = $("[data-catalog]");
  if (catalog) {
    const search = $("#recipe-search", catalog);
    const sort = $("#recipe-sort", catalog);
    const clear = $(".clear-search", catalog);
    const resultCount = $("#results-count", catalog);
    const emptyState = $(".empty-state", catalog);
    const grid = $(".recipe-grid", catalog);
    const cards = $$(".recipe-card", grid);
    const normalize = value => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const recipeIndex = new Map((window.AARON_RECIPES || []).map(recipe => [recipe.slug, recipe]));
    const searchText = new Map(cards.map(card => {
      const recipe = recipeIndex.get(card.dataset.recipeId) || {};
      return [card, normalize([card.dataset.title, recipe.navTitle || "", recipe.category || "", recipe.ingredientText || ""].join(" "))];
    }));
    function updateCatalog() {
      const query = search.value.trim();
      const terms = normalize(query).split(/\s+/).filter(Boolean);
      let visible = 0;
      cards.forEach(card => {
        card.hidden = !terms.every(term => searchText.get(card).includes(term));
        if (!card.hidden) visible++;
      });
      const sorted = [...cards].sort((a, b) => {
        if (sort.value === "az") return a.dataset.title.localeCompare(b.dataset.title, "en");
        if (sort.value === "za") return b.dataset.title.localeCompare(a.dataset.title, "en");
        return Number(a.dataset.order) - Number(b.dataset.order);
      });
      sorted.forEach(card => grid.appendChild(card));
      resultCount.textContent = visible + (visible === 1 ? " recipe" : " recipes") + (query ? ' found for "' + query + '"' : "");
      clear.hidden = !search.value;
      emptyState.hidden = visible > 0;
      // Category links retain the search, and the URL can be shared when hosted.
      $$(".category-tab", catalog).forEach(link => {
        if (!link.dataset.baseHref) link.dataset.baseHref = link.getAttribute("href");
        link.setAttribute("href", link.dataset.baseHref + (query ? "?q=" + encodeURIComponent(query) : ""));
      });
      try {
        const url = new URL(location.href);
        if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
        history.replaceState(null, "", url);
      } catch (_) { /* Some local-file and privacy contexts restrict History API. */ }
    }
    function resetSearch() { search.value = ""; updateCatalog(); search.focus(); }
    $("[data-search-form]", catalog).addEventListener("submit", event => { event.preventDefault(); updateCatalog(); });
    search.addEventListener("input", updateCatalog);
    sort.addEventListener("change", updateCatalog);
    clear.addEventListener("click", resetSearch);
    $("[data-reset-search]", catalog).addEventListener("click", resetSearch);
    try { search.value = new URLSearchParams(location.search).get("q") || ""; } catch (_) { /* Local preview. */ }
    updateCatalog();
    if (location.hash === "#recipe-search") search.focus();
  }

  // Ingredient checklists are temporary. No account, cookies, or local storage.
  const ingredientInputs = $$(".ingredient-checkbox");
  if (ingredientInputs.length) {
    const progress = $("[data-check-progress]");
    const controls = $(".checklist-tools");
    if (controls) controls.hidden = false;
    function updateIngredients() {
      let checked = 0;
      ingredientInputs.forEach(input => {
        input.closest(".ingredient-item").classList.toggle("is-checked", input.checked);
        if (input.checked) checked++;
      });
      if (progress) progress.textContent = checked + " of " + ingredientInputs.length + " checked";
    }
    ingredientInputs.forEach(input => {
      input.addEventListener("change", updateIngredients);
      input.closest(".ingredient-item").addEventListener("click", event => {
        if (event.target.closest("a, input, button, label")) return;
        input.checked = !input.checked;
        updateIngredients();
      });
    });
    $("[data-reset-ingredients]")?.addEventListener("click", () => {
      ingredientInputs.forEach(input => { input.checked = false; });
      updateIngredients();
    });
    updateIngredients();
  }
  $$("[data-print]").forEach(button => button.addEventListener("click", () => window.print()));

  // Explicit preview mode until an owner-configured form endpoint is present.
  const form = $("#contact-form");
  if (form) {
    const fields = $("[data-contact-fields]", form);
    const status = $("#contact-status", form);
    const submit = $("#contact-submit", form);
    const name = $("#contact-name", form);
    const email = $("#contact-email", form);
    const message = $("#contact-message", form);
    const endpoint = typeof config.contactEndpoint === "string" ? config.contactEndpoint.trim() : "";
    const endpointReady = /^https:\/\//i.test(endpoint);
    fields.disabled = false;
    if (endpointReady) {
      $("#contact-note").textContent = "We look forward to hearing from you.";
      submit.firstChild.textContent = "Send message ";
    }
    [name, email, message].forEach(input => input.addEventListener("input", () => input.setCustomValidity("")));
    form.addEventListener("submit", async event => {
      event.preventDefault();
      status.classList.remove("is-error");
      status.textContent = "";
      name.value = name.value.trim();
      email.value = email.value.trim();
      message.value = message.value.trim();
      if (!name.value) name.setCustomValidity("Please enter your name.");
      if (message.value.length < 10) message.setCustomValidity("Please write a message of at least 10 characters.");
      if (!form.reportValidity()) return;
      if ($("#contact-website", form).value) {
        status.textContent = "This submission could not be processed.";
        return;
      }
      if (!endpointReady) {
        status.textContent = "Your message passed validation, but it has not been sent. This is a preview; a contact service must be connected first.";
        return;
      }
      submit.disabled = true;
      status.textContent = "Sending your message...";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(endpoint, {
          method: "POST", credentials: "omit", signal: controller.signal,
          headers: {"Content-Type": "application/json", "Accept": "application/json"},
          body: JSON.stringify({name: name.value, email: email.value, message: message.value})
        });
        if (!response.ok) throw new Error("The contact service did not accept the message.");
        status.textContent = "Thank you. Your message has been submitted.";
        form.reset();
      } catch (error) {
        status.classList.add("is-error");
        status.textContent = error.name === "AbortError"
          ? "The request timed out. Delivery could not be confirmed. Please check before trying again."
          : "Delivery could not be confirmed. Please check your connection or try again later.";
      } finally {
        clearTimeout(timeout);
        submit.disabled = false;
      }
    });
  }

  const backToTop = $(".back-to-top");
  if (backToTop) {
    const update = () => backToTop.classList.toggle("is-visible", window.scrollY > 650);
    window.addEventListener("scroll", update, {passive: true});
    update();
  }
})();
