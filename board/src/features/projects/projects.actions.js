import {
  listProjects,
  createProject,
  renameProject,
  updateProjectDetails,
  updateProjectDescription,
  toggleProjectStar,
  archiveProject,
  updateProjectInstructions,
  addProjectFiles,
  removeProjectFile,
  deleteProject,
} from './projects.service'

export async function loadProjects() {
  return listProjects()
}

export async function createProjectAndReload(input) {
  await createProject(input)
  return listProjects()
}

export async function createProjectAndReturn(input) {
  return createProject(input)
}

export async function renameProjectAndReload(id, name) {
  await renameProject(id, name)
  return listProjects()
}

export async function updateProjectDetailsAndReload(id, input) {
  await updateProjectDetails(id, input)
  return listProjects()
}

export async function updateProjectDescriptionAndReload(id, description) {
  await updateProjectDescription(id, description)
  return listProjects()
}

export async function toggleProjectStarAndReload(id, pinned) {
  await toggleProjectStar(id, pinned)
  return listProjects()
}

export async function archiveProjectAndReload(id) {
  await archiveProject(id)
  return listProjects()
}

export async function updateProjectInstructionsAndReload(id, instructions) {
  await updateProjectInstructions(id, instructions)
  return listProjects()
}

export async function addProjectFilesAndReload(id, files) {
  await addProjectFiles(id, files)
  return listProjects()
}

export async function removeProjectFileAndReload(id, fileId) {
  await removeProjectFile(id, fileId)
  return listProjects()
}

export async function deleteProjectAndReload(id) {
  await deleteProject(id)
  return listProjects()
}

export function loadProjectsPageData() {
  return {}
}
