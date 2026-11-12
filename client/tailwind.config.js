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
        // Onest (matn) va Geologica (sarlavha, yirik raqam) index.html da yuklangan — ikkalasi ham
        // lotin + kirillni to'liq qo'llaydi. Yuklanmasa tizim shrifti. Raqamlar uchun `tabular-nums`.
        sans: ['Onest', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['Geologica', 'Onest', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
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
        // Logotipdagi to'q sariq nuqta — faqat kichik urg'u (faol menyu belgisi)
        spark: token('--spark'),
        // Yon menyu (ikkala mavzuda to'q ko'k)
        nav: {
          DEFAULT: token('--nav-bg'),
          fg: token('--nav-fg'),
          muted: token('--nav-muted'),
        },

        // Holatlar
        success: {
          DEFAULT: token('--success'),
          soft: token('--success-soft'),
          solid: token('--success-solid'),
        },
        warning: {
          DEFAULT: token('--warning'),
          soft: token('--warning-soft'),
          solid: token('--warning-solid'), // ustida text-warning-fg (to'q matn)
          fg: token('--warning-fg'),
        },
        danger: {
          DEFAULT: token('--danger'),
          soft: token('--danger-soft'),
          solid: token('--danger-solid'),
        },
        info: {
          DEFAULT: token('--info'),
          soft: token('--info-soft'),
          solid: token('--info-solid'),
        },
        // Trust / agentlar urg'usi. Tailwind'ning violet-50…950 shkalasi ham saqlanadi.
        violet: {
          DEFAULT: token('--violet'),
          soft: token('--violet-soft'),
          solid: token('--violet-solid'),
        },
      },
      borderColor: {
        // Rangsiz `border` klassi ham token rangida bo'ladi
        DEFAULT: token('--line'),
      },
      borderRadius: {
        // Ierarxiya: boshqaruv elementi (control) < karta (card) < modal (sheet)
        control: '0.625rem',
        card: '1rem',
        sheet: '1.25rem',
      },
      boxShadow: {
        // Yumshoq qatlamli soyalar (ko'kimtir). --shadow-strength dark rejimda kuchaytiradi.
        card: '0 1px 2px rgb(var(--shadow-color) / calc(0.05 * var(--shadow-strength))), 0 8px 24px -12px rgb(var(--shadow-color) / calc(0.12 * var(--shadow-strength)))',
        pop: '0 2px 6px rgb(var(--shadow-color) / calc(0.08 * var(--shadow-strength))), 0 24px 48px -12px rgb(var(--shadow-color) / calc(0.26 * var(--shadow-strength)))',
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
