<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Cpu, LogIn } from 'lucide-vue-next'
import { login } from '@/api/auth'

const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

const isValid = computed(() => username.value.length >= 3 && password.value.length >= 8)

const redirectTarget = computed(() => {
  const raw = route.query.redirect
  const path = typeof raw === 'string' ? raw : '/hardware'
  return path.startsWith('/') ? path : '/hardware'
})

async function handleLogin(): Promise<void> {
  if (!isValid.value || loading.value) return
  loading.value = true
  error.value = null
  try {
    await login({
      username: username.value,
      password: password.value,
      remember_me: true,
    })
    await router.replace(redirectTarget.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-6">
    <form
      class="glass-panel iridescent-border w-full max-w-md rounded-xl p-8"
      @submit.prevent="handleLogin"
    >
      <div class="flex items-center gap-2">
        <Cpu :size="28" class="text-iridescent-2" aria-hidden="true" />
        <h1 class="text-2xl font-semibold">Phyta Hardware</h1>
      </div>
      <p class="mt-3 text-sm text-dark-400 leading-relaxed">
        Anmeldung auf Port <span class="font-mono text-dark-200">5174</span> — Tokens sind
        port-getrennt von El Frontend (:5173).
      </p>

      <label class="mt-6 block text-sm text-dark-300" for="username">Benutzername</label>
      <input
        id="username"
        v-model="username"
        type="text"
        autocomplete="username"
        class="phyta-input mt-1"
        aria-label="Benutzername"
      />

      <label class="mt-4 block text-sm text-dark-300" for="password">Passwort</label>
      <input
        id="password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        class="phyta-input mt-1"
        aria-label="Passwort"
      />

      <p v-if="error" class="mt-4 text-sm text-danger" role="alert">{{ error }}</p>

      <button
        type="submit"
        class="phyta-btn-primary mt-6 flex w-full items-center justify-center gap-2 py-3"
        :disabled="!isValid || loading"
        aria-label="Anmelden"
      >
        <LogIn :size="18" aria-hidden="true" />
        {{ loading ? 'Anmelden…' : 'Anmelden und Hardware öffnen' }}
      </button>
    </form>
  </div>
</template>
