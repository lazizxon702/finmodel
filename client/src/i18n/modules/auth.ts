import { defineModule } from '../types';

// Kirish sahifasi (LoginPage)
export default defineModule({
  uz: {
    'auth.title': 'Tizimga kirish',
    'auth.subtitle': 'Davom etish uchun login va parolingizni kiriting',
    'auth.username': 'Login',
    'auth.username_placeholder': 'Masalan: admin',
    'auth.password': 'Parol',
    'auth.password_placeholder': 'Parolingiz',
    'auth.show_password': "Parolni ko'rsatish",
    'auth.hide_password': 'Parolni yashirish',
    'auth.submit': 'Kirish',
    'auth.submitting': 'Kirilmoqda...',
    'auth.error': "Kirib bo'lmadi. Login yoki parolni tekshiring.",
  },
  ru: {
    'auth.title': 'Вход в систему',
    'auth.subtitle': 'Введите логин и пароль, чтобы продолжить',
    'auth.username': 'Логин',
    'auth.username_placeholder': 'Например: admin',
    'auth.password': 'Пароль',
    'auth.password_placeholder': 'Ваш пароль',
    'auth.show_password': 'Показать пароль',
    'auth.hide_password': 'Скрыть пароль',
    'auth.submit': 'Войти',
    'auth.submitting': 'Вход...',
    'auth.error': 'Не удалось войти. Проверьте логин или пароль.',
  },
  en: {
    'auth.title': 'Sign in',
    'auth.subtitle': 'Enter your username and password to continue',
    'auth.username': 'Username',
    'auth.username_placeholder': 'For example: admin',
    'auth.password': 'Password',
    'auth.password_placeholder': 'Your password',
    'auth.show_password': 'Show password',
    'auth.hide_password': 'Hide password',
    'auth.submit': 'Sign in',
    'auth.submitting': 'Signing in...',
    'auth.error': 'Could not sign in. Check your username or password.',
  },
});
