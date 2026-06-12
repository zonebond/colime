import { apiClient } from '@/lib/apiClient'

function normalizeLabel(payload) {
  if (!payload) return null
  return {
    id: String(payload.id ?? ''),
    name: payload.name ?? '',
    description: payload.description ?? '',
    isStarred: payload.pinned ?? false,
    isArchived: false,
    instructions: '',
    files: [],
    createdAt: payload.time?.created ?? Date.now(),
    updatedAt: payload.time?.updated ?? Date.now(),
    lastActivityAt: payload.time?.updated ?? Date.now(),
  }
}

const adapter = {
  async listProjects() {
    const response = await apiClient.get('/label')
    const items = Array.isArray(response) ? response : response?.items ?? []
    return items.map(normalizeLabel)
  },

  async createProject(input) {
    const response = await apiClient.post('/label', { name: input?.name || input?.title || 'Untitled', description: input?.description ?? '' })
    return normalizeLabel(response)
  },

  async renameProject(id, name) {
    const response = await apiClient.patch(`/label/${id}`, { name })
    return normalizeLabel(response)
  },

  async updateProjectDetails(id, input) {
    const response = await apiClient.patch(`/label/${id}`, { name: input.name, description: input.description })
    return normalizeLabel(response)
  },

  async updateProjectDescription(id, description) {
    const response = await apiClient.patch(`/label/${id}`, { description })
    return normalizeLabel(response)
  },

  async toggleProjectStar(id, pinned) {
    await apiClient.patch(`/label/${id}`, { pinned })
    return null
  },

  async archiveProject(_id) {
    return null
  },

  async updateProjectInstructions(_id, _instructions) {
    return null
  },

  async addProjectFiles(_id, _files) {
    return null
  },

  async removeProjectFile(_id, _fileId) {
    return null
  },

  async deleteProject(id) {
    await apiClient.delete(`/label/${id}`)
    return { success: true }
  },
}

export async function listProjects() {
  return adapter.listProjects()
}

export async function createProject(input) {
  return adapter.createProject(input)
}

export async function renameProject(id, name) {
  return adapter.renameProject(id, name)
}

export async function updateProjectDetails(id, input) {
  return adapter.updateProjectDetails(id, input)
}

export async function updateProjectDescription(id, description) {
  return adapter.updateProjectDescription(id, description)
}

export async function deleteProject(id) {
  return adapter.deleteProject(id)
}

export async function toggleProjectStar(id, pinned) {
  return adapter.toggleProjectStar(id, pinned)
}

export async function archiveProject(id) {
  return adapter.archiveProject(id)
}

export async function updateProjectInstructions(id, instructions) {
  return adapter.updateProjectInstructions(id, instructions)
}

export async function addProjectFiles(id, files) {
  return adapter.addProjectFiles(id, files)
}

export async function removeProjectFile(id, fileId) {
  await adapter.removeProjectFile(id, fileId)
}

export async function fetchProjectAttachments(_projectId) {
  return []
}
