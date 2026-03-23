export default defineEventHandler(() => {
  return {
    ok: true,
    service: 'usphs-policy',
    timestamp: new Date().toISOString(),
  }
})
