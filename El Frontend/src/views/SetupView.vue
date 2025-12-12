<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { UserPlus, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-vue-next'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const fullName = ref('')
const showPassword = ref(false)
const localError = ref<string | null>(null)

const passwordRequirements = computed(() => [
  { met: password.value.length >= 8, text: 'At least 8 characters' },
  { met: /[A-Z]/.test(password.value), text: 'One uppercase letter' },
  { met: /[a-z]/.test(password.value), text: 'One lowercase letter' },
  { met: /[0-9]/.test(password.value), text: 'One number' },
  { met: /[!@#$%^&*(),.?":{}|<>]/.test(password.value), text: 'One special character' },
])

const passwordValid = computed(() => passwordRequirements.value.every(r => r.met))
const passwordsMatch = computed(() => password.value === confirmPassword.value && confirmPassword.value.length > 0)
const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))
const usernameValid = computed(() => /^[a-zA-Z0-9_]{3,50}$/.test(username.value))

const isValid = computed(() =>
  usernameValid.value &&
  emailValid.value &&
  passwordValid.value &&
  passwordsMatch.value
)

const error = computed(() => localError.value || authStore.error)

async function handleSetup() {
  if (!isValid.value) return

  localError.value = null

  try {
    await authStore.setup({
      username: username.value,
      email: email.value,
      password: password.value,
      full_name: fullName.value || undefined,
    })

    router.push('/')
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
        <h1 class="text-3xl font-bold text-gradient">Initial Setup</h1>
        <p class="text-dark-400 mt-2">Create your admin account</p>
      </div>

      <!-- Setup Card -->
      <div class="card">
        <div class="card-header">
          <h2 class="text-xl font-semibold text-dark-100">Administrator Account</h2>
          <p class="text-sm text-dark-400 mt-1">This will be the first admin user</p>
        </div>

        <div class="card-body">
          <form @submit.prevent="handleSetup" class="space-y-5">
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
              <label for="username" class="label">Username</label>
              <input
                id="username"
                v-model="username"
                type="text"
                class="input"
                :class="{ 'input-error': username && !usernameValid }"
                placeholder="admin"
                autocomplete="username"
                required
              />
              <p v-if="username && !usernameValid" class="text-xs text-red-400 mt-1">
                3-50 characters, alphanumeric and underscore only
              </p>
            </div>

            <!-- Email -->
            <div>
              <label for="email" class="label">Email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                class="input"
                :class="{ 'input-error': email && !emailValid }"
                placeholder="admin@example.com"
                autocomplete="email"
                required
              />
            </div>

            <!-- Full Name (optional) -->
            <div>
              <label for="fullName" class="label">
                Full Name <span class="text-dark-500">(optional)</span>
              </label>
              <input
                id="fullName"
                v-model="fullName"
                type="text"
                class="input"
                placeholder="John Doe"
                autocomplete="name"
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
                  autocomplete="new-password"
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

              <!-- Password Requirements -->
              <ul class="mt-2 space-y-1">
                <li
                  v-for="req in passwordRequirements"
                  :key="req.text"
                  class="flex items-center gap-2 text-xs"
                  :class="req.met ? 'text-green-400' : 'text-dark-500'"
                >
                  <CheckCircle v-if="req.met" class="w-3 h-3" />
                  <span v-else class="w-3 h-3 rounded-full border border-dark-500" />
                  {{ req.text }}
                </li>
              </ul>
            </div>

            <!-- Confirm Password -->
            <div>
              <label for="confirmPassword" class="label">Confirm Password</label>
              <input
                id="confirmPassword"
                v-model="confirmPassword"
                :type="showPassword ? 'text' : 'password'"
                class="input"
                :class="{ 'input-error': confirmPassword && !passwordsMatch }"
                placeholder="••••••••"
                autocomplete="new-password"
                required
              />
              <p v-if="confirmPassword && !passwordsMatch" class="text-xs text-red-400 mt-1">
                Passwords do not match
              </p>
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
                Creating account...
              </span>
              <span v-else class="flex items-center gap-2">
                <UserPlus class="w-5 h-5" />
                Create Admin Account
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
