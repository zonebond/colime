import {
  listTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskPause,
  triggerTask,
} from './tasks.service'

export async function loadTasks() {
  return listTasks()
}

export async function loadTask(taskId) {
  return getTaskById(taskId)
}

export async function createTaskAndReturn(input) {
  return createTask(input)
}

export async function createTaskAndReload(input) {
  await createTask(input)
  return listTasks()
}

export async function updateTaskAndReload(taskId, input) {
  await updateTask(taskId, input)
  return listTasks()
}

export async function updateTaskAndReturn(taskId, input) {
  return updateTask(taskId, input)
}

export async function deleteTaskAndReload(taskId) {
  await deleteTask(taskId)
  return listTasks()
}

export async function toggleTaskPauseAndReload(taskId) {
  await toggleTaskPause(taskId)
  return listTasks()
}

export async function toggleTaskPauseAndReturn(taskId) {
  return toggleTaskPause(taskId)
}

export async function triggerTaskAndReload(taskId) {
  await triggerTask(taskId)
  return listTasks()
}

export async function triggerTaskAndReturn(taskId) {
  return triggerTask(taskId)
}

export function loadTasksPageData() {
  return {}
}
