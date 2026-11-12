/** @type {import('tailwindcss').Config} */

// CSS o'zgaruvchisini (index.css dagi "R G B" uchligi) alfa bilan ishlaydigan Tailwind rangiga aylantiradi.
// Masalan: bg-surface, bg-surface/80, text-fg-muted, border-line.
const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Inter index.html da yuklangan; raqamlar uchun `tabular-nums` klassini qo'shing
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        // Fonlar
        app: token('--bg-app'),
        surface: {
          DEFAULT: token('--bg-surface'),
          2: token('--bg-surface-2'),
        },
        elevated: token('--bg-elevated'),
        overlay: token('--overlay'),

        // Matn
        fg: {
          DEFAULT: token('--fg'),
          secondary: token('--fg-secondary'),
          muted: token('--fg-muted'),
          inverse: token('--fg-inverse'),
        },

        // Chegaralar
        line: {
          DEFAULT: token('--line'),
          strong: token('--line-strong'),
        },

        // Brend: to'ldirilgan tugma/aktiv holat. accent: sirt ustidagi matn, ikonka, fokus halqasi
        brand: {
          DEFAULT: token('--brand'),
          hover: token('--brand-hover'),
          fg: token('--brand-fg'),
          soft: token('--brand-soft'),
        },
        accent: token('--accent'),

        // Holatlar
        success: {
          DEFAULT: token('--success'),
          soft: token('--success-soft'),
          solid: token('--success-solid'),
        },
        warning: {
          DEFAULT: token('--warning'),
          soft: token('--warning-soft'),
        },
        danger: {
          DEFAULT: token('--danger'),
          soft: token('--danger-soft'),
          solid: token('--danger-solid'),
        },
        info: {
          DEFAULT: token('--info'),
          soft: token('--info-soft'),
        },
      },
      borderColor: {
        // Rangsiz `border` klassi ham token rangida bo'ladi
        DEFAULT: token('--line'),
      },
      borderRadius: {
        // Ierarxiya: boshqaruv elementi (control) < karta (card) < modal (sheet)
        control: '0.5rem',
        card: '0.75rem',
        sheet: '1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow-color) / 0.05)',
        pop: '0 12px 32px -8px rgb(var(--shadow-color) / 0.28), 0 2px 6px rgb(var(--shadow-color) / 0.08)',
      },
      minHeight: {
        touch: '2.75rem', // 44px teginish maydoni
      },
      minWidth: {
        touch: '2.75rem',
      },
    },
  },
  plugins: [],
}
