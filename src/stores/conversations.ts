/**
 * 会话/项目 store —— 侧边栏的数据与操作
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createProject,
  deleteConversation,
  deleteProject,
  fetchConversations,
  fetchProjects,
  moveConversation,
  renameConversation,
  type Conversation,
  type Project,
} from '../api/conversations'

export const useConversationsStore = defineStore('conversations', () => {
  const list = ref<Conversation[]>([])
  const projects = ref<Project[]>([])
  const activeId = ref('')
  const loading = ref(false)
  /** 待归属项目：在项目分组里点"新对话"后，下一条消息创建的会话归入该项目 */
  const pendingProjectId = ref<string | null>(null)

  /** 分组视图：默认分组(null)永远在最后，项目按创建时间在前 */
  const grouped = computed(() => {
    const groups: Array<{ key: string; name: string; project: Project | null; items: Conversation[] }> = []
    for (const p of projects.value) {
      groups.push({
        key: p.id,
        name: p.name,
        project: p,
        items: list.value.filter((c) => c.project_id === p.id),
      })
    }
    groups.push({
      key: '__default__',
      name: '默认分组',
      project: null,
      items: list.value.filter((c) => !c.project_id),
    })
    return groups
  })

  async function refresh() {
    loading.value = true
    try {
      ;[list.value, projects.value] = await Promise.all([fetchConversations(), fetchProjects()])
    } catch (e) {
      console.error('刷新会话列表失败:', e)
    } finally {
      loading.value = false
    }
  }

  async function remove(id: string) {
    await deleteConversation(id)
    await refresh()
  }

  async function rename(id: string, title: string) {
    await renameConversation(id, title)
    await refresh()
  }

  /** 移动会话到项目（null = 默认分组） */
  async function move(id: string, projectId: string | null) {
    await moveConversation(id, projectId)
    await refresh()
  }

  async function addProject(name: string) {
    await createProject(name)
    await refresh()
  }

  async function removeProject(id: string) {
    await deleteProject(id)
    await refresh()
  }

  return {
    list, projects, activeId, loading, pendingProjectId, grouped,
    refresh, remove, rename, move, addProject, removeProject,
  }
})
