export function setupResponsiveLayout() {
  const narrow = matchMedia("(max-width: 980px)");
  const panel = document.querySelector(".metadata");
  const instrument = document.querySelector(".instrument");
  const controls = document.querySelector(".trace-controls");
  const button = document.querySelector(".menu-button");
  const mobileNav=document.querySelector(".mobile-nav");
  let open = false;
  panel.id = "activityDetails";
  button.setAttribute("aria-controls", panel.id);
  const update = () => {
    panel.hidden = narrow.matches && !open;
    panel.style.top=narrow.matches?mobileNav.getBoundingClientRect().bottom+"px":"";
    button.setAttribute("aria-expanded", String(narrow.matches && open));
    button.setAttribute("aria-label", open ? "Close details" : "Open details");
    if (narrow.matches) instrument.append(controls);
    else panel.insertBefore(controls, panel.querySelector(".activity-meta"));
    instrument.querySelector(".visual-wrap").inert = narrow.matches && open;
    instrument.querySelector(".editorial-reader").inert = narrow.matches && open;
    controls.inert = narrow.matches && open;
  };
  button.addEventListener("click", () => { open = !open; update(); });
  document.addEventListener("close-page-details",()=>{open=false;update();});
  document.addEventListener("keydown", (event) => {
    if (!narrow.matches || !open) return;
    if (event.key === "Escape") {
      event.stopImmediatePropagation();
      open = false;
      update();
      button.focus();
    } else if (event.key.startsWith("Arrow")) {
      event.stopImmediatePropagation();
    }
  });
  document.querySelectorAll("[data-mode]").forEach((mode) => mode.addEventListener("click", () => { open = false; update(); }));
  narrow.addEventListener("change", () => { open = false; update(); });
  new ResizeObserver(update).observe(mobileNav);
  update();
}
