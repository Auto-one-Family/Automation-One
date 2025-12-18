<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { usersApi, type User, type UserCreate, type UserUpdate, type UserRole } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import {
  Users, Plus, Edit, Trash2, Key, RefreshCw, AlertCircle, Check, X,
  Shield, Eye, Settings, UserCheck, UserX
} from 'lucide-vue-next'

const authStore = useAuthStore()

// State
const users = ref<User[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)

// Modals
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showDeleteModal = ref(false)
const showResetPasswordModal = ref(false)
const showChangePasswordModal = ref(false)

// Selected user for edit/delete
const selectedUser = ref<User | null>(null)

// Form data
const createForm = ref<UserCreate>({
  username: '',
  email: '',
  password: '',
  full_name: '',
  role: 'viewer'
})

const editForm = ref<UserUpdate>({})

const newPassword = ref('')
const currentPassword = ref('')
const confirmPassword = ref('')

// Role options
const ROLES: { value: UserRole; label: string; icon: typeof Shield; color: string }[] = [
  { value: 'admin', label: 'Admin', icon: Shield, color: 'text-red-400' },
  { value: 'operator', label: 'Operator', icon: Settings, color: 'text-yellow-400' },
  { value: 'viewer', label: 'Viewer', icon: Eye, color: 'text-blue-400' }
]

// Methods
async function loadUsers(): Promise<void> {
  isLoading.value = true
  error.value = null

  try {
    users.value = await usersApi.listUsers()
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to load users'
  } finally {
    isLoading.value = false
  }
}

function openCreateModal(): void {
  createForm.value = {
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'viewer'
  }
  showCreateModal.value = true
}

async function createUser(): Promise<void> {
  isLoading.value = true
  error.value = null

  try {
    await usersApi.createUser(createForm.value)
    showCreateModal.value = false
    successMessage.value = 'User created successfully'
    await loadUsers()
    setTimeout(() => successMessage.value = null, 3000)
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to create user'
  } finally {
    isLoading.value = false
  }
}

function openEditModal(user: User): void {
  selectedUser.value = user
  editForm.value = {
    email: user.email,
    full_name: user.full_name || '',
    role: user.role,
    is_active: user.is_active
  }
  showEditModal.value = true
}

async function updateUser(): Promise<void> {
  if (!selectedUser.value) return

  isLoading.value = true
  error.value = null

  try {
    await usersApi.updateUser(selectedUser.value.id, editForm.value)
    showEditModal.value = false
    successMessage.value = 'User updated successfully'
    await loadUsers()
    setTimeout(() => successMessage.value = null, 3000)
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to update user'
  } finally {
    isLoading.value = false
  }
}

function openDeleteModal(user: User): void {
  selectedUser.value = user
  showDeleteModal.value = true
}

async function deleteUser(): Promise<void> {
  if (!selectedUser.value) return

  isLoading.value = true
  error.value = null

  try {
    await usersApi.deleteUser(selectedUser.value.id)
    showDeleteModal.value = false
    successMessage.value = 'User deleted successfully'
    await loadUsers()
    setTimeout(() => successMessage.value = null, 3000)
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to delete user'
  } finally {
    isLoading.value = false
  }
}

function openResetPasswordModal(user: User): void {
  selectedUser.value = user
  newPassword.value = ''
  confirmPassword.value = ''
  showResetPasswordModal.value = true
}

async function resetPassword(): Promise<void> {
  if (!selectedUser.value) return

  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    await usersApi.resetPassword(selectedUser.value.id, newPassword.value)
    showResetPasswordModal.value = false
    successMessage.value = 'Password reset successfully'
    setTimeout(() => successMessage.value = null, 3000)
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to reset password'
  } finally {
    isLoading.value = false
  }
}

function openChangePasswordModal(): void {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  showChangePasswordModal.value = true
}

async function changeOwnPassword(): Promise<void> {
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    await usersApi.changeOwnPassword(currentPassword.value, newPassword.value)
    showChangePasswordModal.value = false
    successMessage.value = 'Password changed successfully'
    setTimeout(() => successMessage.value = null, 3000)
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { detail?: string } } }
    error.value = axiosError.response?.data?.detail || 'Failed to change password'
  } finally {
    isLoading.value = false
  }
}

function getRoleConfig(role: string) {
  return ROLES.find(r => r.value === role) || ROLES[2]
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

const isCurrentUser = computed(() => (user: User) => user.id === authStore.user?.id)

onMounted(() => {
  loadUsers()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-dark-100 flex items-center gap-3">
          <Users class="w-7 h-7 text-green-400" />
          User Management
        </h1>
        <p class="text-sm text-dark-400 mt-1">
          Manage user accounts and permissions
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button class="btn-secondary" @click="openChangePasswordModal">
          <Key class="w-4 h-4 mr-2" />
          Change My Password
        </button>
        <button class="btn-primary" @click="openCreateModal">
          <Plus class="w-4 h-4 mr-2" />
          Add User
        </button>
      </div>
    </div>

    <!-- Alerts -->
    <div
      v-if="error"
      class="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3"
    >
      <AlertCircle class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm text-red-400">{{ error }}</p>
      </div>
      <button class="text-red-400 hover:text-red-300" @click="error = null">
        <X class="w-4 h-4" />
      </button>
    </div>

    <div
      v-if="successMessage"
      class="p-4 rounded-lg bg-green-500/10 border border-green-500/30 flex items-start gap-3"
    >
      <Check class="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
      <p class="text-sm text-green-400">{{ successMessage }}</p>
    </div>

    <!-- Users Table -->
    <div class="card overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="border-b border-dark-700">
            <th class="p-4 text-left text-xs font-medium text-dark-400 uppercase">User</th>
            <th class="p-4 text-left text-xs font-medium text-dark-400 uppercase">Email</th>
            <th class="p-4 text-left text-xs font-medium text-dark-400 uppercase">Role</th>
            <th class="p-4 text-left text-xs font-medium text-dark-400 uppercase">Status</th>
            <th class="p-4 text-left text-xs font-medium text-dark-400 uppercase">Created</th>
            <th class="p-4 text-right text-xs font-medium text-dark-400 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody v-if="!isLoading && users.length > 0">
          <tr
            v-for="user in users"
            :key="user.id"
            class="border-b border-dark-800 hover:bg-dark-800/50"
          >
            <td class="p-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center">
                  <span class="text-sm font-medium text-dark-200">
                    {{ user.username.charAt(0).toUpperCase() }}
                  </span>
                </div>
                <div>
                  <p class="font-medium text-dark-100">
                    {{ user.username }}
                    <span v-if="isCurrentUser(user)" class="text-xs text-purple-400 ml-1">(you)</span>
                  </p>
                  <p v-if="user.full_name" class="text-xs text-dark-400">{{ user.full_name }}</p>
                </div>
              </div>
            </td>
            <td class="p-4 text-sm text-dark-300">{{ user.email }}</td>
            <td class="p-4">
              <span
                :class="[
                  'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
                  getRoleConfig(user.role).color
                ]"
              >
                <component :is="getRoleConfig(user.role).icon" class="w-3 h-3" />
                {{ getRoleConfig(user.role).label }}
              </span>
            </td>
            <td class="p-4">
              <span
                :class="[
                  'inline-flex items-center gap-1 px-2 py-1 rounded text-xs',
                  user.is_active ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'
                ]"
              >
                <component :is="user.is_active ? UserCheck : UserX" class="w-3 h-3" />
                {{ user.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="p-4 text-sm text-dark-400">{{ formatDate(user.created_at) }}</td>
            <td class="p-4">
              <div class="flex items-center justify-end gap-1">
                <button
                  class="p-2 rounded hover:bg-dark-700 text-dark-400 hover:text-dark-200 transition-colors"
                  title="Edit"
                  @click="openEditModal(user)"
                >
                  <Edit class="w-4 h-4" />
                </button>
                <button
                  class="p-2 rounded hover:bg-dark-700 text-dark-400 hover:text-yellow-400 transition-colors"
                  title="Reset Password"
                  @click="openResetPasswordModal(user)"
                >
                  <Key class="w-4 h-4" />
                </button>
                <button
                  v-if="!isCurrentUser(user)"
                  class="p-2 rounded hover:bg-dark-700 text-dark-400 hover:text-red-400 transition-colors"
                  title="Delete"
                  @click="openDeleteModal(user)"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="isLoading">
          <tr>
            <td colspan="6" class="p-8 text-center text-dark-400">
              <div class="flex items-center justify-center gap-2">
                <RefreshCw class="w-4 h-4 animate-spin" />
                Loading users...
              </div>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr>
            <td colspan="6" class="p-8 text-center text-dark-400">
              No users found
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create User Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div class="card w-full max-w-md">
        <div class="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 class="text-lg font-semibold text-dark-100">Create User</h3>
          <button class="text-dark-400 hover:text-dark-200" @click="showCreateModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="label">Username</label>
            <input v-model="createForm.username" type="text" class="input w-full" />
          </div>
          <div>
            <label class="label">Email</label>
            <input v-model="createForm.email" type="email" class="input w-full" />
          </div>
          <div>
            <label class="label">Password</label>
            <input v-model="createForm.password" type="password" class="input w-full" />
            <p class="text-xs text-dark-500 mt-1">Min 8 chars, with uppercase, lowercase, and digit</p>
          </div>
          <div>
            <label class="label">Full Name (optional)</label>
            <input v-model="createForm.full_name" type="text" class="input w-full" />
          </div>
          <div>
            <label class="label">Role</label>
            <select v-model="createForm.role" class="input w-full">
              <option v-for="role in ROLES" :key="role.value" :value="role.value">
                {{ role.label }}
              </option>
            </select>
          </div>
        </div>
        <div class="p-4 border-t border-dark-700 flex justify-end gap-2">
          <button class="btn-secondary" @click="showCreateModal = false">Cancel</button>
          <button class="btn-primary" :disabled="isLoading" @click="createUser">
            Create User
          </button>
        </div>
      </div>
    </div>

    <!-- Edit User Modal -->
    <div v-if="showEditModal && selectedUser" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div class="card w-full max-w-md">
        <div class="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 class="text-lg font-semibold text-dark-100">Edit User: {{ selectedUser.username }}</h3>
          <button class="text-dark-400 hover:text-dark-200" @click="showEditModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="label">Email</label>
            <input v-model="editForm.email" type="email" class="input w-full" />
          </div>
          <div>
            <label class="label">Full Name</label>
            <input v-model="editForm.full_name" type="text" class="input w-full" />
          </div>
          <div>
            <label class="label">Role</label>
            <select v-model="editForm.role" class="input w-full">
              <option v-for="role in ROLES" :key="role.value" :value="role.value">
                {{ role.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="editForm.is_active" class="rounded" />
              <span class="text-dark-200">Account Active</span>
            </label>
          </div>
        </div>
        <div class="p-4 border-t border-dark-700 flex justify-end gap-2">
          <button class="btn-secondary" @click="showEditModal = false">Cancel</button>
          <button class="btn-primary" :disabled="isLoading" @click="updateUser">
            Save Changes
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal && selectedUser" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div class="card w-full max-w-md">
        <div class="p-4 border-b border-dark-700">
          <h3 class="text-lg font-semibold text-dark-100">Delete User</h3>
        </div>
        <div class="p-4">
          <p class="text-dark-300">
            Are you sure you want to delete user <strong class="text-dark-100">{{ selectedUser.username }}</strong>?
            This action cannot be undone.
          </p>
        </div>
        <div class="p-4 border-t border-dark-700 flex justify-end gap-2">
          <button class="btn-secondary" @click="showDeleteModal = false">Cancel</button>
          <button class="btn-danger" :disabled="isLoading" @click="deleteUser">
            Delete User
          </button>
        </div>
      </div>
    </div>

    <!-- Reset Password Modal -->
    <div v-if="showResetPasswordModal && selectedUser" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div class="card w-full max-w-md">
        <div class="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 class="text-lg font-semibold text-dark-100">Reset Password: {{ selectedUser.username }}</h3>
          <button class="text-dark-400 hover:text-dark-200" @click="showResetPasswordModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="label">New Password</label>
            <input v-model="newPassword" type="password" class="input w-full" />
          </div>
          <div>
            <label class="label">Confirm Password</label>
            <input v-model="confirmPassword" type="password" class="input w-full" />
          </div>
        </div>
        <div class="p-4 border-t border-dark-700 flex justify-end gap-2">
          <button class="btn-secondary" @click="showResetPasswordModal = false">Cancel</button>
          <button class="btn-primary" :disabled="isLoading || !newPassword || newPassword !== confirmPassword" @click="resetPassword">
            Reset Password
          </button>
        </div>
      </div>
    </div>

    <!-- Change Own Password Modal -->
    <div v-if="showChangePasswordModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div class="card w-full max-w-md">
        <div class="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 class="text-lg font-semibold text-dark-100">Change Your Password</h3>
          <button class="text-dark-400 hover:text-dark-200" @click="showChangePasswordModal = false">
            <X class="w-5 h-5" />
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="label">Current Password</label>
            <input v-model="currentPassword" type="password" class="input w-full" />
          </div>
          <div>
            <label class="label">New Password</label>
            <input v-model="newPassword" type="password" class="input w-full" />
          </div>
          <div>
            <label class="label">Confirm New Password</label>
            <input v-model="confirmPassword" type="password" class="input w-full" />
          </div>
        </div>
        <div class="p-4 border-t border-dark-700 flex justify-end gap-2">
          <button class="btn-secondary" @click="showChangePasswordModal = false">Cancel</button>
          <button
            class="btn-primary"
            :disabled="isLoading || !currentPassword || !newPassword || newPassword !== confirmPassword"
            @click="changeOwnPassword"
          >
            Change Password
          </button>
        </div>
      </div>
    </div>
  </div>
</template>




