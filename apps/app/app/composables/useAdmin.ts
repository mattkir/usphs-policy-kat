export function useAdmin() {
  if (import.meta.server) {
    return { isAdmin: computed(() => false) }
  }

  const { user } = useUserSession()
  const isAdmin = computed(() => user.value?.role === 'admin')
  return { isAdmin }
}
