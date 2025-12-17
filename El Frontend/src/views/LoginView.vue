<script setup lang="ts">
/**
 * LoginView
 * 
 * Authentication page with:
 * - Modern glassmorphism design
 * - Iridescent accents
 * - Form validation
 * - Remember me option
 */

import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { LogIn, Eye, EyeOff, AlertCircle, Cpu } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const rememberMe = ref(false)
const showPassword = ref(false)
const localError = ref<string | null>(null)

const isValid = computed(() => username.value.length >= 3 && password.value.length >= 8)
const error = computed(() => localError.value || authStore.error)

async function handleLogin() {
  if (!isValid.value) return

  localError.value = null

  try {
    await authStore.login({
      username: username.value,
      password: password.value,
      remember_me: rememberMe.value,
    })

    // Redirect to original destination or dashboard
    const redirect = route.query.redirect as string
    router.push(redirect || '/')
  } catch {
    // Error is handled in store
  }
}
</script>

<template>
  <div class="login-page">
    <!-- Background decoration -->
    <div class="login-bg">
      <div class="login-bg-gradient" />
      <div class="login-bg-grid" />
    </div>
    
    <div class="login-container">
      <!-- Logo/Title -->
      <div class="login-header">
        <div class="login-logo">
          <Cpu class="w-10 h-10" />
        </div>
        <h1 class="login-title">AutomationOne</h1>
        <p class="login-subtitle">Debug Dashboard</p>
      </div>

      <!-- Login Card with Glass Effect -->
      <div class="login-card glass-panel">
        <div class="login-card-header">
          <h2 class="login-card-title">Anmelden</h2>
          <p class="login-card-desc">Geben Sie Ihre Zugangsdaten ein</p>
        </div>

        <form @submit.prevent="handleLogin" class="login-form">
          <!-- Error Message -->
          <div v-if="error" class="login-error">
            <AlertCircle class="w-5 h-5 flex-shrink-0" />
            <span>{{ error }}</span>
          </div>

          <!-- Username -->
          <div class="form-group">
            <label for="username" class="label">Benutzername oder E-Mail</label>
            <input
              id="username"
              v-model="username"
              type="text"
              class="input"
              placeholder="admin"
              autocomplete="username"
              required
            />
          </div>

          <!-- Password -->
          <div class="form-group">
            <label for="password" class="label">Passwort</label>
            <div class="password-input">
              <input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="input"
                placeholder="••••••••"
                autocomplete="current-password"
                required
              />
              <button
                type="button"
                class="password-toggle"
                @click="showPassword = !showPassword"
              >
                <Eye v-if="!showPassword" class="w-5 h-5" />
                <EyeOff v-else class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Remember Me -->
          <div class="form-group-inline">
            <input
              id="remember"
              v-model="rememberMe"
              type="checkbox"
              class="checkbox"
            />
            <label for="remember" class="checkbox-label">
              Angemeldet bleiben (7 Tage)
            </label>
          </div>

          <!-- Submit -->
          <button
            type="submit"
            class="btn-primary w-full"
            :disabled="!isValid || authStore.isLoading"
          >
            <span v-if="authStore.isLoading" class="flex items-center gap-2">
              <svg class="animate-spin w-5 h-5" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Wird angemeldet...
            </span>
            <span v-else class="flex items-center gap-2">
              <LogIn class="w-5 h-5" />
              Anmelden
            </span>
          </button>
        </form>
      </div>

      <!-- Footer -->
      <p class="login-footer">
        God-Kaiser Server · Debug Mode
      </p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: var(--color-bg-primary);
  position: relative;
  overflow: hidden;
}

/* Background decoration */
.login-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.login-bg-gradient {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(
    circle at 30% 30%,
    rgba(96, 165, 250, 0.08) 0%,
    transparent 50%
  ),
  radial-gradient(
    circle at 70% 70%,
    rgba(167, 139, 250, 0.08) 0%,
    transparent 50%
  );
  animation: rotate 60s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.login-bg-grid {
  position: absolute;
  inset: 0;
  background-image: 
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 50px 50px;
}

/* Container */
.login-container {
  width: 100%;
  max-width: 24rem;
  position: relative;
  z-index: 1;
}

/* Header */
.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-logo {
  width: 4rem;
  height: 4rem;
  margin: 0 auto 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 1rem;
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-3));
  color: white;
}

.login-title {
  font-size: 1.875rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--color-iridescent-1), var(--color-iridescent-3));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.login-subtitle {
  color: var(--color-text-muted);
  margin-top: 0.5rem;
}

/* Card */
.login-card {
  border-radius: 1rem;
  overflow: hidden;
}

.login-card-header {
  padding: 1.5rem 1.5rem 0;
}

.login-card-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.login-card-desc {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-top: 0.25rem;
}

/* Form */
.login-form {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-group-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Password input */
.password-input {
  position: relative;
}

.password-input .input {
  padding-right: 3rem;
}

.password-toggle {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  padding: 0.25rem;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}

.password-toggle:hover {
  color: var(--color-text-primary);
}

/* Checkbox */
.checkbox {
  width: 1rem;
  height: 1rem;
  border-radius: 0.25rem;
  border: 1px solid var(--glass-border);
  background-color: var(--color-bg-tertiary);
  cursor: pointer;
  accent-color: var(--color-iridescent-1);
}

.checkbox-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  cursor: pointer;
}

/* Error */
.login-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.2);
  border-radius: 0.5rem;
  color: var(--color-error);
  font-size: 0.875rem;
}

/* Footer */
.login-footer {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  margin-top: 1.5rem;
}
</style>
