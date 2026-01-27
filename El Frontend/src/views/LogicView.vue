<script setup lang="ts">
import { GitBranch, Plus } from 'lucide-vue-next'

// Logic view is a placeholder for now - would connect to /v1/logic API
</script>

<template>
  <div class="h-full overflow-auto space-y-6">
    <div class="flex justify-end">
      <button class="btn-primary">
        <Plus class="w-4 h-4 mr-2" />
        Create Rule
      </button>
    </div>

    <div class="card p-12 text-center">
      <GitBranch class="w-12 h-12 text-dark-600 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-dark-200 mb-2">Logic Engine</h3>
      <p class="text-dark-400 mb-4">
        Create automation rules to control actuators based on sensor readings and schedules.
      </p>
      <p class="text-sm text-dark-500">
        Connect to the server's Logic API at <code class="text-blue-400">/v1/logic</code> to manage rules.
      </p>
    </div>

    <!-- Example Rule Card (static) -->
    <div class="card">
      <div class="card-header flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <GitBranch class="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p class="font-medium text-dark-100">Example: Temperature Control</p>
            <p class="text-xs text-dark-400">When temperature &gt; 30°C, turn on fan</p>
          </div>
        </div>
        <span class="badge badge-gray">Template</span>
      </div>
      <div class="card-body text-sm text-dark-400">
        <p><strong class="text-dark-200">Condition:</strong> sensor.temperature &gt; 30</p>
        <p><strong class="text-dark-200">Action:</strong> actuator.fan = ON</p>
        <p><strong class="text-dark-200">Cooldown:</strong> 60 seconds</p>
      </div>
    </div>
  </div>
</template>
