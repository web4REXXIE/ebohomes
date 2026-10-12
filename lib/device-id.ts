// A random ID kept in this browser. Used only as a risk signal, never as proof.
export function getDeviceId(): string {
  try {
    const key = 'ebo_device_id'
    let id = window.localStorage.getItem(key)
    if (!id) {
      id = window.crypto.randomUUID()
      window.localStorage.setItem(key, id)
    }
    return id
  } catch {
    return ''
  }
}