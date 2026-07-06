if (typeof window !== "undefined" && typeof document !== "undefined") {
  const updateNavbarScrollState = () => {
    document.documentElement.classList.toggle(
      "navbar-scrolled",
      window.scrollY > 8,
    );
  };

  updateNavbarScrollState();
  window.addEventListener("scroll", updateNavbarScrollState, { passive: true });
}
