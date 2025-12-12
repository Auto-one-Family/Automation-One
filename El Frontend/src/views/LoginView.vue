<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { LogIn, Eye, EyeOff, AlertCircle } from 'lucide-vue-next'

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
  <div class="min-h-screen flex items-center justify-center p-4 bg-dark-950">
    <div class="w-full max-w-md">
      <!-- Logo/Title -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gradient">El Frontend</h1>
        <p class="text-dark-400 mt-2">AutomationOne Debug Dashboard</p>
      </div>

      <!-- Login Card -->
      <div class="card">
        <div class="card-header">
          <h2 class="text-xl font-semibold text-dark-100">Sign In</h2>
        </div>

        <div class="card-body">
          <form @submit.prevent="handleLogin" class="space-y-5">
            <!-- Error Message -->
            <div
              v-if="error"
              class="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400"
            >
              <AlertCircle class="w-5 h-5 flex-shrink-0" />
              <span class="text-sm">{{ error }}</span>
            </div>

            <!-- Username -->
            <div>
              <label for="username" class="label">Username or Email</label>
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
            <div>
              <label for="password" class="label">Password</label>
              <div class="relative">
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  class="input pr-12"
                  placeholder="••••••••"
                  autocomplete="current-password"
                  required
                />
                <button
                  type="button"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-200"
                  @click="showPassword = !showPassword"
                >
                  <Eye v-if="!showPassword" class="w-5 h-5" />
                  <EyeOff v-else class="w-5 h-5" />
                </button>
              </div>
            </div>

            <!-- Remember Me -->
            <div class="flex items-center">
              <input
                id="remember"
                v-model="rememberMe"
                type="checkbox"
                class="w-4 h-4 rounded border-dark-600 bg-dark-800 text-blue-600 focus:ring-blue-500"
              />
              <label for="remember" class="ml-2 text-sm text-dark-300">
                Remember me for 7 days
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
                Signing in...
              </span>
              <span v-else class="flex items-center gap-2">
                <LogIn class="w-5 h-5" />
                Sign In
              </span>
            </button>
          </form>
        </div>
      </div>

      <!-- Footer -->
      <p class="text-center text-dark-500 text-sm mt-6">
        God-Kaiser Server &middot; Debug Mode
      </p>
    </div>
  </div>
</template>
