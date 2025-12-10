<template>
  <v-menu
    v-model="isOpen"
    :position-x="position.x"
    :position-y="position.y"
    :close-on-content-click="false"
    @update:model-value="handleClose"
  >
    <v-list density="compact">
      <!-- 🆕 NEU: Kontext-spezifische Aktionen -->
      <template v-if="context.type === 'zone'">
        <v-list-item @click="handleAction('configure')">
          <template #prepend>
            <v-icon icon="mdi-cog" size="small" />
          </template>
          <v-list-item-title>Zone konfigurieren</v-list-item-title>
        </v-list-item>

        <v-list-item @click="handleAction('compare')">
          <template #prepend>
            <v-icon icon="mdi-chart-multiline" size="small" />
          </template>
          <v-list-item-title>Zum Vergleich hinzufügen</v-list-item-title>
        </v-list-item>

        <v-list-item @click="handleAction('favorite')">
          <template #prepend>
            <v-icon icon="mdi-star" size="small" />
          </template>
          <v-list-item-title>Als Favorit markieren</v-list-item-title>
        </v-list-item>
      </template>

      <template v-else-if="context.type === 'sensor'">
        <v-list-item @click="handleAction('configure')">
          <template #prepend>
            <v-icon icon="mdi-cog" size="small" />
          </template>
          <v-list-item-title>Sensor konfigurieren</v-list-item-title>
        </v-list-item>

        <v-list-item @click="handleAction('compare')">
          <template #prepend>
            <v-icon icon="mdi-chart-multiline" size="small" />
          </template>
          <v-list-item-title>Zum Vergleich hinzufügen</v-list-item-title>
        </v-list-item>

        <v-list-item @click="handleAction('logic')">
          <template #prepend>
            <v-icon icon="mdi-lightning-bolt" size="small" />
          </template>
          <v-list-item-title>In Logik verwenden</v-list-item-title>
        </v-list-item>

        <v-list-item @click="handleAction('details')">
          <template #prepend>
            <v-icon icon="mdi-information" size="small" />
          </template>
          <v-list-item-title>Details anzeigen</v-list-item-title>
        </v-list-item>
      </template>

      <template v-else-if="context.type === 'actuator'">
        <v-list-item @click="handleAction('configure')">
          <template #prepend>
            <v-icon icon="mdi-cog" size="small" />
          </template>
          <v-list-item-title>Aktor konfigurieren</v-list-item-title>
        </v-list-item>

        <v-list-item @click="handleAction('logic')">
          <template #prepend>
            <v-icon icon="mdi-lightning-bolt" size="small" />
          </template>
          <v-list-item-title>Logik bearbeiten</v-list-item-title>
        </v-list-item>

        <v-list-item @click="handleAction('toggle')">
          <template #prepend>
            <v-icon icon="mdi-power" size="small" />
          </template>
          <v-list-item-title>{{
            context.data?.state ? 'Ausschalten' : 'Einschalten'
          }}</v-list-item-title>
        </v-list-item>

        <v-list-item @click="handleAction('details')">
          <template #prepend>
            <v-icon icon="mdi-information" size="small" />
          </template>
          <v-list-item-title>Details anzeigen</v-list-item-title>
        </v-list-item>
      </template>

      <!-- 🆕 NEU: Allgemeine Aktionen -->
      <v-divider v-if="context.type" />

      <v-list-item @click="handleAction('copy')">
        <template #prepend>
          <v-icon icon="mdi-content-copy" size="small" />
        </template>
        <v-list-item-title>Kopieren</v-list-item-title>
      </v-list-item>

      <v-list-item @click="handleAction('export')">
        <template #prepend>
          <v-icon icon="mdi-export" size="small" />
        </template>
        <v-list-item-title>Exportieren</v-list-item-title>
      </v-list-item>

      <v-list-item @click="handleAction('delete')" color="error">
        <template #prepend>
          <v-icon icon="mdi-delete" size="small" color="error" />
        </template>
        <v-list-item-title>Löschen</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script>
import { defineComponent, ref, watch } from 'vue'

export default defineComponent({
  name: 'ContextMenu',

  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    context: {
      type: Object,
      default: () => ({
        type: null, // 'zone', 'sensor', 'actuator'
        data: null,
      }),
    },
    position: {
      type: Object,
      default: () => ({ x: 0, y: 0 }),
    },
  },

  emits: ['update:modelValue', 'action'],

  setup(props, { emit }) {
    const isOpen = ref(props.modelValue)

    // 🆕 NEU: Watch für v-model
    watch(
      () => props.modelValue,
      (newValue) => {
        isOpen.value = newValue
      },
    )

    watch(isOpen, (newValue) => {
      emit('update:modelValue', newValue)
    })

    // 🆕 NEU: Action Handler
    const handleAction = (action) => {
      emit('action', {
        action,
        context: props.context,
        data: props.context.data,
      })
      isOpen.value = false
    }

    const handleClose = () => {
      isOpen.value = false
    }

    return {
      isOpen,
      handleAction,
      handleClose,
    }
  },
})
</script>

<style scoped>
.v-menu {
  z-index: 1000;
}
</style>
