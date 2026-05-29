<script setup lang="ts">
const loginUrl = 'http://192.168.0.2:5173/login'
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center p-8 text-center">
    <h1 class="text-2xl font-semibold">Phyta Hardware</h1>
    <p class="mt-4 max-w-md text-dark-300">
      Bitte zuerst im El Frontend einloggen. Das Auth-Cookie wird mit diesem Port geteilt.
    </p>
    <a
      :href="loginUrl"
      class="mt-6 rounded-lg bg-accent px-6 py-3 text-white hover:opacity-90"
    >
      Zum Login (El Frontend :5173)
    </a>
  </div>
</template>
