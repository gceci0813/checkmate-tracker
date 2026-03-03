import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        red: { DEFAULT: '#C12033', dark: '#9a1829', light: '#e8384a' },
        slate: { DEFAULT: '#3D4F5F', light: '#5a6e80' },
        success: '#2a9d5c',
        warning: '#e0923a',
        info: '#3a7fe0',
        purple: '#7a5be0',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
