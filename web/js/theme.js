/**
 * Droply Theme Manager
 */

const ThemeManager = {
  currentTheme: 'dark',

  init() {
    const saved = localStorage.getItem('droply_theme') || 'dark';
    this.setTheme(saved);

    // Bind theme chip clicks
    document.querySelectorAll('.theme-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const t = chip.getAttribute('data-theme');
        this.setTheme(t);
        // Persist to server
        if (typeof api !== 'undefined') {
          api.updateSettings({ theme: t }).catch(() => {});
        }
      });
    });
  },

  setTheme(themeName) {
    this.currentTheme = themeName;
    document.body.setAttribute('data-theme', themeName);
    localStorage.setItem('droply_theme', themeName);

    // Update active chip state
    document.querySelectorAll('.theme-chip').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-theme') === themeName);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
});
