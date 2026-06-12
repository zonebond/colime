// Tasks are not available as a standalone API in ravens.
// Ravens uses cron/scheduled skills for timed operations.
// Stub all operations — the UI already shows "coming soon" state.

export async function listTasks() {
  return []
}

export async function getTaskById() {
  return null
}

export async function createTask() {
  return null
}

export async function updateTask() {
  return null
}

export async function deleteTask() {
  return { success: true }
}

export async function toggleTaskPause() {
  return null
}

export async function triggerTask() {
  return null
}
