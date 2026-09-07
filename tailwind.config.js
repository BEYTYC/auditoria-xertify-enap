/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Azul naval institucional.
        navy: {
          50: '#F2F5FA',
          100: '#E3EAF4',
          200: '#C4D2E7',
          300: '#95AECF',
          400: '#5F80B0',
          500: '#3A5F96',
          600: '#1B4C92',
          700: '#123A73',
          800: '#0B2A5B',
          900: '#071C3C',
          950: '#04142E',
        },
        // Dorado de los distintivos navales.
        gold: {
          300: '#EBD79A',
          400: '#E3C767',
          500: '#C9A227',
          600: '#A8861D',
          700: '#846813',
        },
      },
      // Una sola familia en toda la aplicación. `serif` apunta a la misma:
      // así el código existente sigue funcionando sin mezclar tipografías.
      fontFamily: {
        sans: ['"Aptos Display"', 'Aptos', '"Segoe UI Variable Text"', '"Segoe UI"', '"Libre Franklin"', 'system-ui', 'sans-serif'],
        serif: ['"Aptos Display"', 'Aptos', '"Segoe UI Variable Text"', '"Segoe UI"', '"Libre Franklin"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(7,28,60,.06), 0 8px 24px -12px rgba(7,28,60,.22)',
      },
    },
  },
  plugins: [],
}
