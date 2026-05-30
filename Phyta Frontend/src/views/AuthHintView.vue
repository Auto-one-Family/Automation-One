<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Cpu, LogIn } from 'lucide-vue-next'

const router = useRouter()

function goLogin(): void {
  void router.push({ name: 'login', query: { redirect: '/hardware' } })
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center p-8 text-center">
    <div class="glass-panel max-w-lg rounded-xl p-8">
      <Cpu :size="32" class="mx-auto text-iridescent-2" aria-hidden="true" />
      <h1 class="mt-4 text-2xl font-semibold">Phyta Hardware</h1>
      <p class="mt-4 text-dark-300 leading-relaxed">
        Ein Login auf El Frontend (:5173) reicht hier nicht — der Browser speichert
        Tokens pro Port getrennt. Bitte einmal auf diesem Port (:5174) anmelden.
      </p>
      <button
        type="button"
        class="phyta-btn-primary mt-6 inline-flex items-center gap-2 px-6 py-3"
        aria-label="Zur Anmeldung"
        @click="goLogin"
      >
        <LogIn :size="18" aria-hidden="true" />
        Anmelden (Phyta :5174)
      </button>
    </div>
  </div>
</template>
